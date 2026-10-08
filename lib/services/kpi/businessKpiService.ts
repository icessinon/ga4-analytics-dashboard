/**
 * 事業KPI（応募数・会員登録数）の月次。**プロダクトDB `xmile-drm.xwork` が正**で、GA4 ではない。
 *
 * 分類は三木さんのクエリ（2026-10-02）／goal-tracker の weekly_actuals.sql v4.1 と同じ定義に
 * 揃えてある。移植時に 2026-07〜09 の全列が一致することを確認済み（応募 74/110/187、
 * 内訳 35・6・6・25・2 ほか、会員登録 1117/1195/1159）。**定義を変えるときは向こうも直す。**
 *
 * 流入分類（求人広告の応募のみ。上から順に当てはめる）:
 *  - scout        … scout_id があるか applied_kind が scout_apply / scout_inquiry
 *  - product      … utm source=product × medium=line（LINEプッシュ）
 *  - line         … utm source=line（LINE公式）
 *  - hrs          … utm source が ca / scout / crm_scout / bdash（人材紹介側の配信）
 *  - apply_signup … 応募と同時に会員登録した人
 *  - others       … medium=cpc（広告）
 *  上のどれでもない既存会員の応募は product（プロダクト経由）に寄せる。
 *
 * 「応募同時登録」の判定は signup_kind が入る 2026-09-04 以降はその値、それ以前は
 * 「最初の応募が登録から 5 秒以内か」で代替する（登録区分のカラムが無かったため）。
 *
 * スキャンは約 50MB（0.05 円）。ダッシュボードの初期表示で毎回叩いてよい水準。
 * ※ サーバー専用。クライアントは businessKpiTypes を参照すること
 */

import { runGa4EventsQuery } from '@/lib/bq/ga4EventsClient'
import type { BusinessKpiMonth, BusinessKpiReport, JobAdSource } from './businessKpiTypes'

const APPLICATIONS = '`xmile-drm.xwork.job_applications`'
const JOB_DESCRIPTIONS = '`xmile-drm.xwork.job_descriptions`'
const JOB_DESCRIPTIONS_ALL = '`xmile-drm.xwork.job_descriptions_with_deleted`'
const MEMBER_USERS = '`xmile-drm.xwork.member_users`'
const SCOUT_ATTEMPTS = '`xmile-drm.xwork.scout_attempts`'

const num = (v: string | null | undefined) => (v == null ? 0 : Number(v) || 0)

/** 何ヶ月分さかのぼるか。1〜24 に丸める */
export function clampMonths(months: unknown): number {
    return Math.min(24, Math.max(1, Number(months) || 6))
}

/** 'YYYY-MM-01' 形式で nMonths 前の月初を返す */
function startMonth(nMonths: number): string {
    const now = new Date(Date.now() + 9 * 3600_000)
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (nMonths - 1), 1))
    return d.toISOString().slice(0, 10)
}

function sql(from: string): string {
    return `
    WITH members AS (
      SELECT m.user_id, m.user_created_at, m.line_user_id,
        COALESCE(m.signup_kind = 'apply_signup',
                 TIMESTAMP_DIFF(MIN(ja.created_at), m.user_created_at, SECOND) BETWEEN 0 AND 5) AS is_apply_signup
      FROM ${MEMBER_USERS} m
      LEFT JOIN ${APPLICATIONS} ja ON ja.user_id = m.user_id
      GROUP BY m.user_id, m.user_created_at, m.line_user_id, m.signup_kind
    ),
    apps AS (
      SELECT
        DATE_TRUNC(DATE(ja.created_at,'Asia/Tokyo'), MONTH) AS m,
        jd.contract_type,
        CASE
          WHEN ja.scout_id IS NOT NULL OR ja.applied_kind IN ('scout_apply','scout_inquiry')  THEN 'scout'
          WHEN JSON_VALUE(ja.utm,'$.source_last') = 'product'
           AND JSON_VALUE(ja.utm,'$.medium_last') = 'line'                                    THEN 'product'
          WHEN JSON_VALUE(ja.utm,'$.source_last') = 'line'                                    THEN 'line'
          WHEN JSON_VALUE(ja.utm,'$.source_last') IN ('ca','scout','crm_scout','bdash')        THEN 'hrs'
          WHEN NOT IFNULL(mb.is_apply_signup, FALSE)                                          THEN 'product'
          WHEN JSON_VALUE(ja.utm,'$.medium_last') = 'cpc'                                      THEN 'others'
          WHEN TIMESTAMP_DIFF(ja.created_at, mb.user_created_at, SECOND) BETWEEN 0 AND 5       THEN 'apply_signup'
          ELSE 'product'
        END AS cat,
        -- 会員になってからの経過。M1 の「登録当日 / 1〜30日の再訪 / 既存会員」の分解に使う
        CASE
          WHEN mb.user_id IS NULL THEN 'unknown'
          WHEN DATE(ja.created_at,'Asia/Tokyo') = DATE(mb.user_created_at,'Asia/Tokyo') THEN 'day0'
          WHEN DATE_DIFF(DATE(ja.created_at,'Asia/Tokyo'), DATE(mb.user_created_at,'Asia/Tokyo'), DAY) <= 30 THEN 'd1_30'
          ELSE 'd31' END AS tenure,
        IFNULL(JSON_VALUE(ja.utm,'$.source_last') = 'product' AND JSON_VALUE(ja.utm,'$.medium_last') = 'line', FALSE) AS is_product_linepush
      FROM ${APPLICATIONS} ja
      JOIN ${JOB_DESCRIPTIONS_ALL} jd ON jd.id = ja.media_id
      LEFT JOIN members mb ON mb.user_id = ja.user_id
      WHERE DATE(ja.created_at,'Asia/Tokyo') BETWEEN DATE '${from}' AND DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL 1 DAY)
    ),
    agg AS (
      SELECT m,
        COUNT(*) AS apps_total,
        COUNTIF(contract_type='求人広告')    AS apps_jobad,
        COUNTIF(contract_type='人材紹介')    AS apps_agent,
        COUNTIF(contract_type='ハローワーク') AS apps_hw,
        COUNTIF(contract_type='求人広告' AND cat='scout')        AS ad_scout,
        COUNTIF(contract_type='求人広告' AND cat='product')      AS ad_product,
        COUNTIF(contract_type='求人広告' AND cat='line')         AS ad_line,
        COUNTIF(contract_type='求人広告' AND cat='hrs')          AS ad_hrs,
        COUNTIF(contract_type='求人広告' AND cat='apply_signup') AS ad_apply_signup,
        COUNTIF(contract_type='求人広告' AND cat='others')       AS ad_others,
        -- プロダクト経由の内訳（LINEプッシュ経由か、会員になってからの経過か）
        COUNTIF(contract_type='求人広告' AND cat='product' AND is_product_linepush) AS prod_linepush,
        COUNTIF(contract_type='求人広告' AND cat='product' AND NOT is_product_linepush AND tenure='day0')  AS prod_day0,
        COUNTIF(contract_type='求人広告' AND cat='product' AND NOT is_product_linepush AND tenure='d1_30') AS prod_d1_30,
        COUNTIF(contract_type='求人広告' AND cat='product' AND NOT is_product_linepush AND tenure IN ('d31','unknown')) AS prod_d31,
        -- LINE公式の内訳
        COUNTIF(contract_type='求人広告' AND cat='line' AND tenure='day0')  AS line_day0,
        COUNTIF(contract_type='求人広告' AND cat='line' AND tenure='d1_30') AS line_d1_30,
        COUNTIF(contract_type='求人広告' AND cat='line' AND tenure IN ('d31','unknown')) AS line_d31
      FROM apps GROUP BY m
    ),
    reg AS (
      SELECT DATE_TRUNC(DATE(user_created_at,'Asia/Tokyo'), MONTH) AS m,
        COUNT(*) AS reg,
        COUNTIF(line_user_id IS NOT NULL) AS reg_line,
        COUNTIF(NOT IFNULL(is_apply_signup, FALSE)) AS reg_plain,
        COUNTIF(IFNULL(is_apply_signup, FALSE)) AS reg_apply_signup
      FROM members
      WHERE DATE(user_created_at,'Asia/Tokyo') BETWEEN DATE '${from}' AND DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL 1 DAY)
      GROUP BY m
    ),
    snd AS (
      SELECT DATE_TRUNC(DATE(sent_at,'Asia/Tokyo'), MONTH) AS m, COUNT(*) AS sends
      FROM ${SCOUT_ATTEMPTS}
      WHERE sent_at IS NOT NULL
        AND DATE(sent_at,'Asia/Tokyo') BETWEEN DATE '${from}' AND DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL 1 DAY)
      GROUP BY m
    )
    SELECT
      FORMAT_DATE('%Y-%m', agg.m) AS month,
      IF(agg.m = DATE_TRUNC(DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL 1 DAY), MONTH),
         EXTRACT(DAY FROM DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL 1 DAY)),
         EXTRACT(DAY FROM LAST_DAY(agg.m))) AS days_elapsed,
      EXTRACT(DAY FROM LAST_DAY(agg.m)) AS days_in_month,
      agg.* EXCEPT (m),
      IFNULL(reg.reg, 0) AS reg, IFNULL(reg.reg_line, 0) AS reg_line,
      IFNULL(reg.reg_plain, 0) AS reg_plain, IFNULL(reg.reg_apply_signup, 0) AS reg_apply_signup,
      IFNULL(snd.sends, 0) AS sends,
      (SELECT COUNT(*) FROM ${JOB_DESCRIPTIONS} WHERE contract_type='求人広告' AND is_public) AS inventory_jobad,
      (SELECT COUNTIF(line_user_id IS NOT NULL) / COUNT(*) FROM ${MEMBER_USERS}) AS line_rate_all,
      CAST(DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL 1 DAY) AS STRING) AS data_to
    FROM agg LEFT JOIN reg USING (m) LEFT JOIN snd USING (m)
    ORDER BY month`
}

export async function runBusinessKpiReport(monthsInput: unknown): Promise<BusinessKpiReport> {
    const nMonths = clampMonths(monthsInput)
    const { rows, scannedBytes } = await runGa4EventsQuery(sql(startMonth(nMonths)))

    const inventoryJobAd = rows.length > 0 ? num(rows[0].inventory_jobad) : 0
    const lineRateAll = rows.length > 0 && rows[0].line_rate_all != null ? Number(rows[0].line_rate_all) : null
    const dataTo = rows.length > 0 ? String(rows[0].data_to ?? '') : ''

    const months: BusinessKpiMonth[] = rows.map((r) => {
        const daysElapsed = num(r.days_elapsed)
        const daysInMonth = num(r.days_in_month)
        const appsJobAd = num(r.apps_jobad)
        const reg = num(r.reg)
        // 当月は途中なので、同じペースで進んだ場合の月末着地も出す（確定月は実績のまま）
        const pace = (v: number) => (daysElapsed > 0 && daysElapsed < daysInMonth ? Math.round((v / daysElapsed) * daysInMonth) : v)
        const jobAdBySource: Record<JobAdSource, number> = {
            scout: num(r.ad_scout),
            product: num(r.ad_product),
            line: num(r.ad_line),
            hrs: num(r.ad_hrs),
            apply_signup: num(r.ad_apply_signup),
            others: num(r.ad_others),
        }
        return {
            month: String(r.month ?? ''),
            daysElapsed, daysInMonth,
            appsTotal: num(r.apps_total),
            appsJobAd,
            appsAgent: num(r.apps_agent),
            appsHelloWork: num(r.apps_hw),
            jobAdBySource,
            breakdown: {
                prodLinePush: num(r.prod_linepush),
                prodDay0: num(r.prod_day0),
                prodD1_30: num(r.prod_d1_30),
                prodD31: num(r.prod_d31),
                lineDay0: num(r.line_day0),
                lineD1_30: num(r.line_d1_30),
                lineD31: num(r.line_d31),
            },
            reg,
            regPlain: num(r.reg_plain),
            regApplySignup: num(r.reg_apply_signup),
            regLine: num(r.reg_line),
            sends: num(r.sends),
            appsPerJob: inventoryJobAd > 0 ? appsJobAd / inventoryJobAd : null,
            appsJobAdPace: pace(appsJobAd),
            regPace: pace(reg),
        }
    })

    return { months, inventoryJobAd, lineRateAll, dataTo, scannedBytes, fetchedAt: new Date().toISOString() }
}
