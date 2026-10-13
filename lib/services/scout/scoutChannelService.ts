/**
 * スカウト経由の応募を SMS / メール / LINE に分ける（プロダクトDB）。
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
 * 送信数は direct だけ出す。**ScoutAttempts が送信の正**で、通知基盤（delivery_records）の
 * scout / scout_mail topic は同じ scout_id への**追加通知**（メール・LINE）という構造:
 * - SMS   … ScoutAttempts（2026-10-09 で 958 件/日）
 * - メール … delivery_records topic=scout_mail channel=mail（2026-10-06 開始）
 * - LINE  … delivery_records topic=scout channel=line（2026-10-09 開始）
 *
 * **通知基盤側の channel=sms は足さない。** 全 17 件とも scout_id が ScoutAttempts にも
 * 存在しており（only_in_messaging = 0）、足すと二重計上になる。
 *
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

/**
 * 本体 1:1 スカウトの追加通知。通知基盤の topic。
 * 2026-10-06 に scout_mail（メール）、2026-10-09 に scout（SMS・LINE）が増えた。
 * 今後 topic 名が増えても拾えるよう、ここに足すだけで済むようにしている。
 */
const SCOUT_NOTIFY_TOPICS = ["'scout'", "'scout_mail'"].join(', ')

function sql(startDate: string, endDate: string): string {
    return `
    WITH apps AS (
      SELECT
        IF(scout_id IS NOT NULL OR applied_kind IN ('scout_apply','scout_inquiry'), 'direct', 'bulk') AS system,
        CASE JSON_VALUE(utm,'$.medium_last')
          WHEN 'sms' THEN 'sms' WHEN 'email' THEN 'mail' WHEN 'line' THEN 'line'
          ELSE 'unknown' END AS channel,
        COUNT(*) AS applied
      FROM ${APPLICATIONS}
      WHERE DATE(created_at,'Asia/Tokyo') BETWEEN DATE '${startDate}' AND DATE '${endDate}'
        AND (scout_id IS NOT NULL
             OR applied_kind IN ('scout_apply','scout_inquiry')
             OR JSON_VALUE(utm,'$.source_last') IN ('scout','crm_scout'))
      GROUP BY 1, 2
    ),
    -- 本体 1:1 の送信数。SMS は事業者が受け付けた件数（ScoutAttempts が正）、
    -- メール・LINE は通知基盤の送達記録。通知基盤の channel='sms' は ScoutAttempts と
    -- 同じ scout_id を指していて二重計上になるので除く
    sent AS (
      SELECT 'direct' AS system, 'sms' AS channel, COUNT(*) AS sent
      FROM ${SCOUT_ATTEMPTS}
      WHERE status = 'sent' AND sent_at IS NOT NULL
        AND DATE(sent_at,'Asia/Tokyo') BETWEEN DATE '${startDate}' AND DATE '${endDate}'
      UNION ALL
      SELECT 'direct', channel, COUNT(DISTINCT record_key)
      FROM ${DELIVERY_RECORDS}
      WHERE topic IN (${SCOUT_NOTIFY_TOPICS}) AND status = 'sent'
        AND channel IN ('mail', 'line')
        AND DATE(recorded_at,'Asia/Tokyo') BETWEEN DATE '${startDate}' AND DATE '${endDate}'
      GROUP BY channel
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
