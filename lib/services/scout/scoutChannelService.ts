/**
 * スカウト経由の応募を SMS / メールに分ける（プロダクトDB）。
 *
 * ファネル本体は DynamoDB（送信）＋ GA4（閲覧・応募）で組んでいるが、
 * **どのチャネルから来た応募かは GA4 のラベルでは分からない**ので、ここだけ
 * プロダクトDB の `job_applications.utm.medium_last` で判定する。
 *
 * スカウトは 2 系統あるので分けて出す（混ぜると桁が違って読めない）:
 * - direct … 本体の 1:1 スカウト。`scout_id` があるか `applied_kind` が scout_apply / scout_inquiry。
 *            UTM は source=product × medium=sms|email × campaign=scout_{scoutId}
 * - bulk   … B-Dash の一斉配信。UTM の source が scout / crm_scout
 *
 * 送信数は direct だけ出す（SMS は ScoutAttempts、メールは通知基盤の scout_mail topic）。
 * bulk の送信数は B-Dash 側にしか無く 1GB 超のスキャンが要るので、配信レポートに委ねる。
 *
 * 実測（2026-09-09〜10-09）で medium_last が取れない応募は 0 件。スキャンは約 15MB。
 * ※ サーバー専用。クライアントは scoutFunnelTypes を参照すること
 */

import { runGa4EventsQuery } from '@/lib/bq/ga4EventsClient'
import type { ScoutChannelRow, ScoutChannelSystem } from './scoutFunnelTypes'

const APPLICATIONS = '`xmile-drm.xwork.job_applications`'
const SCOUT_ATTEMPTS = '`xmile-drm.xwork.scout_attempts`'
const DELIVERY_RECORDS = '`xmile-drm.xwork.delivery_records_history`'

const num = (v: string | null | undefined) => (v == null ? 0 : Number(v) || 0)

/** 本体 1:1 スカウトのメール通知。通知基盤の topic 名 */
const SCOUT_MAIL_TOPIC = 'scout_mail'

function sql(startDate: string, endDate: string): string {
    return `
    WITH apps AS (
      SELECT
        IF(scout_id IS NOT NULL OR applied_kind IN ('scout_apply','scout_inquiry'), 'direct', 'bulk') AS system,
        CASE JSON_VALUE(utm,'$.medium_last') WHEN 'sms' THEN 'sms' WHEN 'email' THEN 'mail' ELSE 'unknown' END AS channel,
        COUNT(*) AS applied
      FROM ${APPLICATIONS}
      WHERE DATE(created_at,'Asia/Tokyo') BETWEEN DATE '${startDate}' AND DATE '${endDate}'
        AND (scout_id IS NOT NULL
             OR applied_kind IN ('scout_apply','scout_inquiry')
             OR JSON_VALUE(utm,'$.source_last') IN ('scout','crm_scout'))
      GROUP BY 1, 2
    ),
    -- 本体 1:1 の送信数。SMS は事業者が受け付けた件数、メールは通知基盤の送達記録
    sent AS (
      SELECT 'direct' AS system, 'sms' AS channel, COUNT(*) AS sent
      FROM ${SCOUT_ATTEMPTS}
      WHERE status = 'sent' AND sent_at IS NOT NULL
        AND DATE(sent_at,'Asia/Tokyo') BETWEEN DATE '${startDate}' AND DATE '${endDate}'
      UNION ALL
      SELECT 'direct', 'mail', COUNT(DISTINCT record_key)
      FROM ${DELIVERY_RECORDS}
      WHERE topic = '${SCOUT_MAIL_TOPIC}' AND status = 'sent' AND channel = 'mail'
        AND DATE(recorded_at,'Asia/Tokyo') BETWEEN DATE '${startDate}' AND DATE '${endDate}'
    )
    SELECT
      IFNULL(apps.system, sent.system) AS system,
      IFNULL(apps.channel, sent.channel) AS channel,
      IFNULL(apps.applied, 0) AS applied,
      sent.sent AS sent
    FROM apps FULL OUTER JOIN sent USING (system, channel)
    ORDER BY system, channel`
}

const asSystem = (v: string): ScoutChannelSystem => (v === 'direct' ? 'direct' : 'bulk')

export async function runScoutChannelBreakdown(startDate: string, endDate: string): Promise<ScoutChannelRow[]> {
    const { rows } = await runGa4EventsQuery(sql(startDate, endDate))
    return rows.map((r) => {
        const applied = num(r.applied)
        // 一斉配信の送信数は B-Dash 側にしか無いので null（配信レポートで見る）
        const sent = r.sent == null ? null : num(r.sent)
        return {
            system: asSystem(String(r.system ?? 'bulk')),
            channel: String(r.channel ?? 'unknown') as ScoutChannelRow['channel'],
            applied,
            sent,
            applyRate: sent != null && sent > 0 ? applied / sent : null,
        }
    })
}
