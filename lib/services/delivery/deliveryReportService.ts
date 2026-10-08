/**
 * 配信レポート: SMS / メール / LINE を 1 枚で比べる。
 *
 * **開封率でチャネルを比較してはいけない。** 開封イベントがあるのはメールだけで、
 * SMS と LINE には原理的に存在しない。チャネル比較はクリックと GA4 着地で行い、
 * 開封率はメール内の施策比較にだけ使う。
 *
 * 出典は 4 つ。どれも性質が違うので画面にも必ず出典を出す。
 *  1. `xmile-drm.bdash.action_log`  — B-Dash 一斉配信（media=mail/sms、将来 line）。
 *     送信・開封・クリック・配信停止が 1 行 1 アクションで入る。`action_log_id` は一意で重複なし。
 *     ※ `bdash.send_log` は一部のキャンペーンしか入っておらず（同期間でメール 575,371 vs 1,035,711）、
 *       送信数の分母には使わない。
 *  2. `xmile-drm.xwork.delivery_records_history` — 本体通知基盤 @xwork/messaging の送達記録。
 *     topic × channel(mail/line/sms)。**スカウト LINE が増えたらここに topic が増える**ので、
 *     このサービスは topic をハードコードせず、出てきたものをそのまま並べる。
 *  3. `xmile-drm.xwork.ses_event_records` — 本体メールの SES イベント。件名別の開封・クリックはここだけ。
 *  4. `xmile-drm.analytics_534098180.events_*` — GA4。utm_medium=email/sms/line の着地セッション。
 *     **全チャネルで唯一共通に取れる成果指標**なので、チャネル比較の軸はこれにする。
 *
 * 加えて `xwork.line_job_recommendation_unit_stats`（LINEおすすめ求人配信のユニット別実績）を読む。
 *
 * コスト: 1 回の実行で合計 1〜2GB スキャンする。ページは手動実行型にしてあり、
 * スキャン量はレスポンスに載せて画面に出す。
 * ※ サーバー専用。クライアントは deliveryReportTypes を参照すること
 */

import { runGa4EventsQuery } from '@/lib/bq/ga4EventsClient'
import { clampToExportWindow, eventsFromWhere } from '@/lib/bq/ga4EventsSql'
import { BDASH_INCREMENTAL_START, type DeliveryChannel, type DeliveryScope } from '@/lib/constants/delivery'
import type {
    CampaignRow, ChannelSummaryRow, DeliveryReport, Ga4LandingRow, LineUnitRow, SubjectRow,
} from './deliveryReportTypes'

const BDASH_ACTION_LOG = '`xmile-drm.bdash.action_log`'
const DELIVERY_RECORDS = '`xmile-drm.xwork.delivery_records_history`'
const SES_EVENTS = '`xmile-drm.xwork.ses_event_records`'
const LINE_UNIT_STATS = '`xmile-drm.xwork.line_job_recommendation_unit_stats`'

/**
 * B-Dash にはグループ各社の配信が同居している。クロスワーク（求職者向け）は
 * メールが `【X Work_クロスワーク】…`、SMS が `【SMS】agent_…` の 2 系統。
 * 命名に依存する絞り込みなので、画面から「B-Dash 全社」に切り替えられるようにしてある。
 */
const XWORK_SCOPE_SQL = `AND (campaign_name LIKE '%クロスワーク%' OR campaign_name LIKE '%【SMS】agent%')`

const num = (v: string | null | undefined) => (v == null ? 0 : Number(v) || 0)
const rate = (n: number, d: number | null) => (d && d > 0 ? n / d : null)
const jstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
const addDays = (date: string, n: number) => new Date(`${date}T00:00:00Z`).getTime() + n * 86400_000
const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function clampDays(days: unknown): number {
    return Math.min(180, Math.max(7, Number(days) || 30))
}

export function resolveScope(scope: unknown): DeliveryScope {
    return scope === 'all' ? 'all' : 'xwork'
}

/** B-Dash の増分が始まる前には遡れない。切り詰めたかどうかは画面に出す */
function resolveWindow(days: number): { startDate: string; endDate: string; clamped: boolean } {
    const endDate = toDate(addDays(jstToday(), -1))
    const wanted = toDate(addDays(endDate, -(days - 1)))
    const startDate = wanted < BDASH_INCREMENTAL_START ? BDASH_INCREMENTAL_START : wanted
    return { startDate, endDate, clamped: startDate !== wanted }
}

/**
 * B-Dash 一斉配信。
 * **実人数（COUNT DISTINCT）は施策をまたいで合算できない**（同じ人が多数の施策を受け取る）ので、
 * チャネル / 施策 / 施策×件名 の 3 グレインを GROUPING SETS で一度に出す。1 スキャンで済む。
 * campaign_name と subject は base で NULL を潰してあるので、出力の NULL は「畳んだ」印になる。
 */
function bdashSql(startDate: string, endExclusive: string, scope: DeliveryScope): string {
    return `
    WITH base AS (
      SELECT
        media,
        -- 施策名の正規化。B-Dash の campaign_name は「25590_3【X Work_クロスワーク】HRS_…」のように
        -- 連番・管理ID・ブランド表記が前置されるので、落とさないと同じ施策が何行にも割れる。
        IFNULL(
          TRIM(REGEXP_EXTRACT(campaign_name, r'】\\s*(.+?)\\s*$')),
          IFNULL(NULLIF(TRIM(REGEXP_REPLACE(campaign_name, r'^[0-9]+_?[0-9]*', '')), ''), '(名前なし)')
        ) AS campaign_name,
        IFNULL(NULLIF(mail_subject, ''), '(件名なし)') AS subject,
        action_type,
        customer_account_id AS acct,
        CONCAT(IFNULL(campaign_id,''), '|', IFNULL(mail_address, IFNULL(sms_phone_number,'')), '|', IFNULL(delivery_date_time,'')) AS k
      FROM ${BDASH_ACTION_LOG}
      WHERE imported_at >= TIMESTAMP('${startDate}T00:00:00+09:00')
        AND delivery_date_time >= '${startDate}' AND delivery_date_time < '${endExclusive}'
        ${scope === 'xwork' ? XWORK_SCOPE_SQL : ''}
    )
    SELECT media, campaign_name, subject,
      COUNT(DISTINCT IF(ENDS_WITH(action_type, '_tried'), k, NULL)) AS tried,
      COUNT(DISTINCT IF(ENDS_WITH(action_type, '_tried'), acct, NULL)) AS people,
      COUNT(DISTINCT IF(ENDS_WITH(action_type, '_succeeded'), k, NULL)) AS delivered,
      COUNT(DISTINCT IF(ENDS_WITH(action_type, '_opened'), k, NULL)) AS opened,
      COUNT(DISTINCT IF(ENDS_WITH(action_type, '_clicked') AND NOT CONTAINS_SUBSTR(action_type, 'redirect'), k, NULL)) AS clicked,
      COUNT(DISTINCT IF(CONTAINS_SUBSTR(action_type, 'redirect'), k, NULL)) AS redirect_clicked,
      COUNT(DISTINCT IF(ENDS_WITH(action_type, '_failed'), k, NULL)) AS failed,
      COUNT(DISTINCT IF(ENDS_WITH(action_type, '_unsubscribed'), k, NULL)) AS unsubscribed
    FROM base
    GROUP BY GROUPING SETS ((media), (media, campaign_name), (media, campaign_name, subject))`
}

/** 本体通知基盤。topic × channel。LINE・SMS はここに送達しか無い（開封は存在しない） */
function messagingSql(startDate: string, endExclusive: string): string {
    return `
    WITH d AS (
      SELECT record_key, topic, channel, status, provider_message_id
      FROM ${DELIVERY_RECORDS}
      WHERE recorded_at >= TIMESTAMP('${startDate}T00:00:00+09:00')
        AND recorded_at < TIMESTAMP('${endExclusive}T00:00:00+09:00')
      QUALIFY ROW_NUMBER() OVER (PARTITION BY record_key ORDER BY bq_updated_at DESC) = 1
    ),
    s AS (
      SELECT message_id,
        MAX(IF(event_type='Delivery', 1, 0)) AS delivered,
        MAX(IF(event_type='Open',     1, 0)) AS opened,
        MAX(IF(event_type='Click',    1, 0)) AS clicked
      FROM ${SES_EVENTS}
      GROUP BY message_id
    )
    SELECT d.topic, IFNULL(d.channel, '(未決定)') AS channel,
      COUNTIF(d.status = 'sent')    AS tried,
      COUNTIF(d.status = 'failed')  AS failed,
      COUNTIF(d.status = 'skipped') AS skipped,
      COUNTIF(d.status = 'sent' AND s.delivered = 1) AS delivered,
      COUNTIF(d.status = 'sent' AND s.opened = 1)    AS opened,
      COUNTIF(d.status = 'sent' AND s.clicked = 1)   AS clicked
    FROM d LEFT JOIN s ON d.provider_message_id = s.message_id
    GROUP BY 1, 2`
}

/**
 * 本体メールの件名別。delivery_records に載らないメール（応募完了・キープリマインド等）も
 * 拾えるよう SES を主にする。企業名・氏名・都道府県を差し込む件名は 1 つに畳まないと
 * 1 社 1 行になって読めないので、ここで正規化する。
 */
function sesSubjectSql(startDate: string, endExclusive: string): string {
    return `
    WITH m AS (
      SELECT message_id,
        ANY_VALUE(subject) AS subject,
        MAX(IF(event_type='Send',     1, 0)) AS sent,
        MAX(IF(event_type='Delivery', 1, 0)) AS delivered,
        MAX(IF(event_type='Open',     1, 0)) AS opened,
        MAX(IF(event_type='Click',    1, 0)) AS clicked,
        MAX(IF(event_type='Bounce',   1, 0)) AS bounced
      FROM ${SES_EVENTS}
      WHERE evented_at >= TIMESTAMP('${startDate}T00:00:00+09:00')
        AND evented_at < TIMESTAMP('${endExclusive}T00:00:00+09:00')
      GROUP BY message_id
    )
    SELECT
      COUNT(*) AS messages,
      CASE
        WHEN REGEXP_CONTAINS(subject, r'^【スカウト】.+からスカウトが届きました$') THEN '【スカウト】（企業名）からスカウトが届きました'
        WHEN REGEXP_CONTAINS(subject, r'からメッセージが届きました') AND NOT CONTAINS_SUBSTR(subject, '担当者から') THEN '（企業名）からメッセージが届きました'
        WHEN REGEXP_CONTAINS(subject, r'様に関するメッセージが届きました') THEN '（CA担当者）から企業へのメッセージ'
        WHEN REGEXP_CONTAINS(subject, r'で条件の近い求人を[0-9]+件そろえました$') THEN '（都道府県）で条件の近い求人をそろえました'
        ELSE subject
      END AS subject_group,
      SUM(sent) AS sent, SUM(delivered) AS delivered, SUM(opened) AS opened,
      SUM(clicked) AS clicked, SUM(bounced) AS bounced
    FROM m
    GROUP BY 2
    ORDER BY messages DESC
    LIMIT 100`
}

/** GA4 の着地。セッション単位に畳んでから数えるので、施策別と合計で二重計上にならない */
function ga4Sql(startSuffix: string, endSuffix: string): string {
    return `
    WITH s AS (
      SELECT
        CONCAT(user_pseudo_id, '-', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key='ga_session_id') AS STRING)) AS sid,
        ANY_VALUE(user_pseudo_id) AS uid,
        ARRAY_AGG(STRUCT(
          collected_traffic_source.manual_source AS src,
          collected_traffic_source.manual_medium AS medium,
          collected_traffic_source.manual_campaign_name AS campaign
        ) ORDER BY event_timestamp LIMIT 1)[OFFSET(0)] AS ts
      ${eventsFromWhere({ start: startSuffix, end: endSuffix })}
        AND collected_traffic_source.manual_medium IN ('email', 'sms', 'line')
      GROUP BY sid
    )
    SELECT ts.src AS src, ts.medium AS medium,
      IFNULL(REGEXP_EXTRACT(ts.campaign, r'^([a-z]+(?:_[a-z]+){0,2})'), IFNULL(ts.campaign, '(not set)')) AS campaign_group,
      COUNT(*) AS sessions,
      COUNT(DISTINCT uid) AS users
    FROM s
    GROUP BY 1, 2, 3
    ORDER BY sessions DESC`
}

function lineUnitSql(startDate: string, endExclusive: string): string {
    return `
    SELECT unit,
      SUM(linked_user_count) AS linked_users,
      SUM(not_to_receive_user_count) AS not_to_receive_users,
      SUM(jobs_available_user_count) AS jobs_available_users,
      SUM(success_user_count) AS success_users,
      SUM(error_user_count) AS error_users,
      COUNT(*) AS deliveries,
      CAST(MAX(created_at) AS STRING) AS last_delivered_at
    FROM ${LINE_UNIT_STATS}
    WHERE created_at >= TIMESTAMP('${startDate}T00:00:00+09:00')
      AND created_at < TIMESTAMP('${endExclusive}T00:00:00+09:00')
    GROUP BY unit
    ORDER BY success_users DESC`
}

const asChannel = (media: string): DeliveryChannel =>
    media === 'sms' ? 'sms' : media === 'line' ? 'line' : 'mail'

const mediumToChannel = (medium: string): DeliveryChannel | null =>
    medium === 'email' ? 'mail' : medium === 'sms' ? 'sms' : medium === 'line' ? 'line' : null

export async function runDeliveryReport(daysInput: unknown, scopeInput: unknown): Promise<DeliveryReport> {
    const days = clampDays(daysInput)
    const scope = resolveScope(scopeInput)
    const { startDate, endDate, clamped } = resolveWindow(days)
    const endExclusive = toDate(addDays(endDate, 1))
    const ga4Window = clampToExportWindow(startDate, endDate)

    const [bdash, messaging, ses, ga4, lineUnits] = await Promise.all([
        runGa4EventsQuery(bdashSql(startDate, endExclusive, scope)),
        runGa4EventsQuery(messagingSql(startDate, endExclusive)),
        runGa4EventsQuery(sesSubjectSql(startDate, endExclusive)),
        runGa4EventsQuery(ga4Sql(ga4Window.start, ga4Window.end)),
        runGa4EventsQuery(lineUnitSql(startDate, endExclusive)),
    ])

    const scannedBytes = [bdash, messaging, ses, ga4, lineUnits].reduce((a, r) => a + r.scannedBytes, 0)

    // B-Dash の 3 グレインに切り分ける。campaign_name が NULL ならチャネル、subject が NULL なら施策
    const bdashChannelRows = bdash.rows.filter((r) => r.campaign_name == null)
    const bdashCampaignRows = bdash.rows.filter((r) => r.campaign_name != null && r.subject == null)
    const bdashSubjectRaw = bdash.rows.filter((r) => r.campaign_name != null && r.subject != null)

    /** メールは B-Dash に Delivery イベントが無いので「送信 − 失敗」を送達とみなす */
    const deliveredOf = (channel: DeliveryChannel, r: Record<string, string | null>) =>
        channel === 'mail' ? num(r.tried) - num(r.failed) : num(r.delivered)

    // ── 施策別 ──
    const campaigns: CampaignRow[] = bdashCampaignRows.map((r): CampaignRow => {
        const channel = asChannel(String(r.media ?? 'mail'))
        const delivered = deliveredOf(channel, r)
        const opened = channel === 'mail' ? num(r.opened) : null
        const clicked = num(r.clicked)
        return {
            source: 'bdash', channel, name: String(r.campaign_name ?? ''),
            tried: num(r.tried), delivered, opened, clicked,
            failed: num(r.failed), unsubscribed: num(r.unsubscribed),
            people: num(r.people),
            redirectClicked: channel === 'sms' ? num(r.redirect_clicked) : null,
            openRate: opened == null ? null : rate(opened, delivered),
            clickRate: rate(clicked, delivered),
            ctorRate: opened ? rate(clicked, opened) : null,
        }
    })

    for (const r of messaging.rows) {
        // 配信先が決まる前にスキップした行は channel が NULL で入る。送信も失敗も 0 なので施策行にしない
        if (num(r.tried) === 0 && num(r.failed) === 0) continue
        const channel = asChannel(String(r.channel ?? 'mail'))
        const tried = num(r.tried)
        const delivered = channel === 'mail' ? num(r.delivered) : tried
        const opened = channel === 'mail' ? num(r.opened) : null
        const clicked = channel === 'mail' ? num(r.clicked) : null
        campaigns.push({
            source: 'messaging', channel, name: String(r.topic ?? '(unknown)'),
            tried, delivered, opened, clicked,
            failed: num(r.failed), unsubscribed: 0, people: null, redirectClicked: null,
            openRate: opened == null ? null : rate(opened, delivered),
            clickRate: clicked == null ? null : rate(clicked, delivered),
            ctorRate: opened ? rate(clicked ?? 0, opened) : null,
        })
    }
    campaigns.sort((a, b) => b.tried - a.tried)

    // ── 件名別（B-Dash の mail_subject ＋ 本体 SES）──
    // 同じ件名が複数キャンペーンに現れるので畳む。キー k は施策・件名に対して一意なので通数は合算してよい
    const bdashSubjects = new Map<string, SubjectRow>()
    for (const r of bdashSubjectRaw) {
        if (asChannel(String(r.media ?? 'mail')) !== 'mail') continue
        const subject = String(r.subject ?? '')
        if (subject === '(件名なし)') continue
        const cur = bdashSubjects.get(subject) ?? {
            source: 'bdash' as const, channel: 'mail' as DeliveryChannel, subject,
            messages: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0,
            openRate: null, clickRate: null, ctorRate: null,
        }
        cur.messages += num(r.tried)
        cur.sent += num(r.tried)
        cur.delivered += num(r.tried) - num(r.failed)
        cur.opened += num(r.opened)
        cur.clicked += num(r.clicked)
        cur.bounced += num(r.failed)
        bdashSubjects.set(subject, cur)
    }

    const subjects: SubjectRow[] = [
        ...[...bdashSubjects.values()].map((s) => ({
            ...s,
            openRate: rate(s.opened, s.delivered),
            clickRate: rate(s.clicked, s.delivered),
            ctorRate: s.opened > 0 ? rate(s.clicked, s.opened) : null,
        })),
        // SES は種別によって Send イベントを publish していないものがあり（Delivery だけ来る）、
        // sent や delivered を分母にすると開封率が 100% を超える。観測できたメッセージ数を分母にする。
        ...ses.rows.map((r): SubjectRow => {
            const messages = num(r.messages)
            const opened = num(r.opened)
            return {
                source: 'messaging', channel: 'mail', subject: String(r.subject_group ?? ''),
                messages, sent: num(r.sent), delivered: num(r.delivered), opened,
                clicked: num(r.clicked), bounced: num(r.bounced),
                openRate: rate(opened, messages),
                clickRate: rate(num(r.clicked), messages),
                ctorRate: opened > 0 ? rate(num(r.clicked), opened) : null,
            }
        }),
    ].sort((a, b) => b.messages - a.messages)

    // ── GA4 着地 ──
    const ga4Rows: Ga4LandingRow[] = ga4.rows.map((r) => ({
        source: String(r.src ?? '(not set)'),
        medium: String(r.medium ?? ''),
        campaignGroup: String(r.campaign_group ?? '(not set)'),
        sessions: num(r.sessions),
        users: num(r.users),
    }))

    // ── LINE おすすめ求人配信 ──
    const lineUnitRows: LineUnitRow[] = lineUnits.rows.map((r) => ({
        unit: String(r.unit ?? ''),
        linkedUsers: num(r.linked_users),
        jobsAvailableUsers: num(r.jobs_available_users),
        successUsers: num(r.success_users),
        errorUsers: num(r.error_users),
        notToReceiveUsers: num(r.not_to_receive_users),
        deliveries: num(r.deliveries),
        lastDeliveredAt: r.last_delivered_at ?? null,
    }))

    // ── チャネル別サマリー ──
    // B-Dash はチャネルグレインの行をそのまま使う（人数を施策から合算すると重複する）
    const blankChannel = (channel: DeliveryChannel): ChannelSummaryRow => ({
        channel, tried: 0, delivered: 0, opened: null, clicked: 0, failed: 0, unsubscribed: 0,
        people: null, ga4Sessions: 0, ga4Users: 0, openRate: null, clickRate: null, ctorRate: null,
    })
    const channelMap = new Map<DeliveryChannel, ChannelSummaryRow>()
    for (const r of bdashChannelRows) {
        const channel = asChannel(String(r.media ?? 'mail'))
        const cur = channelMap.get(channel) ?? blankChannel(channel)
        cur.tried += num(r.tried)
        cur.delivered = (cur.delivered ?? 0) + deliveredOf(channel, r)
        cur.clicked = (cur.clicked ?? 0) + num(r.clicked)
        cur.failed += num(r.failed)
        cur.unsubscribed += num(r.unsubscribed)
        cur.people = (cur.people ?? 0) + num(r.people)
        if (channel === 'mail') cur.opened = (cur.opened ?? 0) + num(r.opened)
        channelMap.set(channel, cur)
    }
    // 本体通知基盤は人が重ならない別母集団なので足してよい（実人数は取らない）
    for (const c of campaigns.filter((x) => x.source === 'messaging')) {
        const cur = channelMap.get(c.channel) ?? blankChannel(c.channel)
        cur.tried += c.tried
        cur.delivered = (cur.delivered ?? 0) + (c.delivered ?? 0)
        cur.clicked = (cur.clicked ?? 0) + (c.clicked ?? 0)
        cur.failed += c.failed
        if (c.opened != null) cur.opened = (cur.opened ?? 0) + c.opened
        channelMap.set(c.channel, cur)
    }
    // LINE おすすめ求人配信は通知基盤を通らないので別に足す
    const lineTotals = lineUnitRows.reduce(
        (a, u) => ({ tried: a.tried + u.jobsAvailableUsers, delivered: a.delivered + u.successUsers, failed: a.failed + u.errorUsers }),
        { tried: 0, delivered: 0, failed: 0 },
    )
    if (lineTotals.tried > 0) {
        const cur = channelMap.get('line') ?? blankChannel('line')
        cur.tried += lineTotals.tried
        cur.delivered = (cur.delivered ?? 0) + lineTotals.delivered
        cur.failed += lineTotals.failed
        channelMap.set('line', cur)
    }
    for (const r of ga4Rows) {
        const ch = mediumToChannel(r.medium)
        if (!ch) continue
        const cur = channelMap.get(ch) ?? blankChannel(ch)
        cur.ga4Sessions += r.sessions
        cur.ga4Users += r.users
        channelMap.set(ch, cur)
    }

    const channels = [...channelMap.values()].map((c) => ({
        ...c,
        openRate: c.opened == null ? null : rate(c.opened, c.delivered),
        clickRate: rate(c.clicked ?? 0, c.delivered),
        ctorRate: c.opened ? rate(c.clicked ?? 0, c.opened) : null,
    })).sort((a, b) => b.tried - a.tried)

    return {
        scope, startDate, endDate, clamped,
        channels, campaigns, subjects, ga4: ga4Rows, lineUnits: lineUnitRows,
        scannedBytes,
        fetchedAt: new Date().toISOString(),
    }
}
