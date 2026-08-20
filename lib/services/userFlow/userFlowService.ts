import { GA4_EXPORT_DATASET, GA4_EXPORT_PROJECT, GA4_EXPORT_START, runGa4EventsQuery } from '@/lib/bq/ga4EventsClient'

/**
 * CVセッション解剖レポート（BigQuery events_* ベース）。
 * GA4 APIの集計値では見えない「セッション単位の行動量」をSQLで直接集計する:
 *  1. 応募/登録/非CVセッションの行動量比較（求人詳細閲覧数・検索利用率・滞在時間・CVまでの時間）
 *  2. 求人詳細ページを見た直後の遷移先（次アクション）の内訳
 *
 * 定義（2026-08-14実測で確定）:
 *  - 応募完了 = data_click_label の click_label が EF__Job{R|A|H}__Btn__（送信ボタンは入力完了までdisabled → クリック=応募実行、DynamoDB実応募と一致）
 *  - 会員登録完了 = /members/signup/thanks の page_view
 *  - 求人詳細 = /{industry}/media_{id}、検索ページ = /search（次アクション最多の実URL）
 *  - 応募フォーム = /entry/media_{id}
 */

const INDUSTRIES = 'driver|sekokan|sekkei|soko|shokunin|seibi|hoshu|setsubi-sagyo|keibi|unkan|kojo-sagyo|food|unyu-sagyo|others'

export interface FlowGroup {
    key: 'applied' | 'signup' | 'browsed' | 'other'
    sessions: number
    avgDetails: number
    medDetails: number
    searchRatePct: number
    medDurMin: number
    medCvMin: number | null
    dist: { d0: number; d1: number; d2_3: number; d4_9: number; d10p: number }
}

export interface NextAction {
    action: string
    count: number
}

export interface UserFlowReport {
    startDate: string
    endDate: string
    clamped: boolean
    groups: FlowGroup[]
    nextActions: NextAction[]
    scannedMb: number
}

function evCte(start: string, end: string): string {
    return `
WITH ev AS (
  SELECT
    CONCAT(user_pseudo_id, '.', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING)) AS sid,
    event_timestamp,
    event_name,
    REGEXP_EXTRACT((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location'), r'^https?://[^/]+([^?#]*)') AS path,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'click_label') AS click_label
  FROM \`${GA4_EXPORT_PROJECT}.${GA4_EXPORT_DATASET}.events_*\`
  WHERE _TABLE_SUFFIX BETWEEN '${start}' AND '${end}'
)`
}

function buildSessionQuery(start: string, end: string): string {
    return `${evCte(start, end)},
sess AS (
  SELECT sid,
    COUNTIF(event_name = 'page_view' AND REGEXP_CONTAINS(path, r'^/(${INDUSTRIES})/media_[0-9]+')) AS detail_views,
    LOGICAL_OR(event_name = 'page_view' AND (
      STARTS_WITH(path, '/search')
      OR (REGEXP_CONTAINS(path, r'^/(${INDUSTRIES})(/|$)') AND NOT REGEXP_CONTAINS(path, r'/media_[0-9]'))
      OR STARTS_WITH(path, '/cond/')
    )) AS used_search,
    LOGICAL_OR(event_name = 'data_click_label' AND REGEXP_CONTAINS(click_label, r'^EF__Job(R|A|H)__Btn__')) AS applied,
    LOGICAL_OR(event_name = 'page_view' AND STARTS_WITH(path, '/members/signup/thanks')) AS signed_up,
    (MAX(event_timestamp) - MIN(event_timestamp)) / 1e6 AS dur_sec,
    (MIN(IF(
      (event_name = 'data_click_label' AND REGEXP_CONTAINS(click_label, r'^EF__Job(R|A|H)__Btn__'))
      OR (event_name = 'page_view' AND STARTS_WITH(path, '/members/signup/thanks')),
      event_timestamp, NULL
    )) - MIN(event_timestamp)) / 1e6 AS cv_sec
  FROM ev
  WHERE sid IS NOT NULL AND NOT ENDS_WITH(sid, '.')
  GROUP BY sid
)
SELECT
  CASE
    WHEN applied THEN 'applied'
    WHEN signed_up THEN 'signup'
    WHEN detail_views > 0 THEN 'browsed'
    ELSE 'other'
  END AS grp,
  COUNT(*) AS sessions,
  ROUND(AVG(detail_views), 2) AS avg_details,
  APPROX_QUANTILES(detail_views, 2)[OFFSET(1)] AS med_details,
  ROUND(AVG(IF(used_search, 1, 0)) * 100, 1) AS search_rate_pct,
  ROUND(APPROX_QUANTILES(dur_sec, 2)[OFFSET(1)] / 60, 1) AS med_dur_min,
  ROUND(APPROX_QUANTILES(cv_sec, 2)[OFFSET(1)] / 60, 1) AS med_cv_min,
  COUNTIF(detail_views = 0) AS d0,
  COUNTIF(detail_views = 1) AS d1,
  COUNTIF(detail_views BETWEEN 2 AND 3) AS d2_3,
  COUNTIF(detail_views BETWEEN 4 AND 9) AS d4_9,
  COUNTIF(detail_views >= 10) AS d10p
FROM sess
GROUP BY grp`
}

function buildNextActionQuery(start: string, end: string): string {
    return `${evCte(start, end)},
pv AS (
  SELECT sid, event_timestamp,
    CASE
      WHEN REGEXP_CONTAINS(path, r'^/(${INDUSTRIES})/media_[0-9]+') THEN 'detail'
      WHEN STARTS_WITH(path, '/entry/') THEN 'entry_form'
      WHEN STARTS_WITH(path, '/search') THEN 'search'
      WHEN (REGEXP_CONTAINS(path, r'^/(${INDUSTRIES})(/|$)') AND NOT REGEXP_CONTAINS(path, r'/media_[0-9]')) OR STARTS_WITH(path, '/cond/') THEN 'list'
      WHEN STARTS_WITH(path, '/featured/') THEN 'featured'
      WHEN STARTS_WITH(path, '/members/signup') THEN 'signup'
      WHEN STARTS_WITH(path, '/members/') OR path IN ('/favorite', '/kyujin-history') THEN 'mypage'
      WHEN STARTS_WITH(path, '/journal') THEN 'journal'
      WHEN path = '/' THEN 'top'
      ELSE 'other_page'
    END AS cat
  FROM ev
  WHERE event_name = 'page_view' AND sid IS NOT NULL AND NOT ENDS_WITH(sid, '.')
),
seq AS (
  SELECT sid, cat,
    LEAD(cat) OVER (PARTITION BY sid ORDER BY event_timestamp) AS next_cat
  FROM pv
)
SELECT IFNULL(next_cat, 'exit') AS next_action, COUNT(*) AS n
FROM seq
WHERE cat = 'detail'
GROUP BY 1 ORDER BY n DESC`
}

function toSuffix(d: Date): string {
    return d.toISOString().slice(0, 10).replace(/-/g, '')
}

function toDisplay(suffix: string): string {
    return `${suffix.slice(0, 4)}-${suffix.slice(4, 6)}-${suffix.slice(6, 8)}`
}

export async function runUserFlowReport(startDate: string, endDate: string): Promise<UserFlowReport> {
    // BQの日次エクスポートは前日分まで。JST基準で昨日を超える終端は昨日に丸める
    const nowJst = new Date(Date.now() + 9 * 3600 * 1000)
    const yesterday = new Date(nowJst)
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)
    const yesterdaySuffix = toSuffix(yesterday)

    let start = startDate.replace(/-/g, '')
    let endSuffix = endDate.replace(/-/g, '')
    if (endSuffix > yesterdaySuffix) endSuffix = yesterdaySuffix
    let clamped = false
    if (start < GA4_EXPORT_START) {
        start = GA4_EXPORT_START
        clamped = true
    }
    if (start > endSuffix) start = endSuffix

    const [sessRes, nextRes] = await Promise.all([
        runGa4EventsQuery(buildSessionQuery(start, endSuffix)),
        runGa4EventsQuery(buildNextActionQuery(start, endSuffix)),
    ])

    const groups: FlowGroup[] = sessRes.rows.map((r) => ({
        key: (r.grp ?? 'other') as FlowGroup['key'],
        sessions: Number(r.sessions ?? 0),
        avgDetails: Number(r.avg_details ?? 0),
        medDetails: Number(r.med_details ?? 0),
        searchRatePct: Number(r.search_rate_pct ?? 0),
        medDurMin: Number(r.med_dur_min ?? 0),
        medCvMin: r.med_cv_min != null ? Number(r.med_cv_min) : null,
        dist: {
            d0: Number(r.d0 ?? 0),
            d1: Number(r.d1 ?? 0),
            d2_3: Number(r.d2_3 ?? 0),
            d4_9: Number(r.d4_9 ?? 0),
            d10p: Number(r.d10p ?? 0),
        },
    }))
    const order: FlowGroup['key'][] = ['applied', 'signup', 'browsed', 'other']
    groups.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))

    const nextActions: NextAction[] = nextRes.rows.map((r) => ({
        action: r.next_action ?? 'other_page',
        count: Number(r.n ?? 0),
    }))

    return {
        startDate: toDisplay(start),
        endDate: toDisplay(endSuffix),
        clamped,
        groups,
        nextActions,
        scannedMb: Math.round((sessRes.scannedBytes + nextRes.scannedBytes) / 1024 ** 2),
    }
}
