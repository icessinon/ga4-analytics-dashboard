/**
 * 会員登録後ステップメールの実績（drm-front PR#3659）。
 *
 * 送信数は DynamoDB の DeliveryRecords（topic=signup_step_mail）が正。
 * ステップの識別は sentIdempotencyKey（`signup_step_mail:<userId>:<stepKey>`）で行う。
 * 件名は day7/day14 が氏名・エリアを差し込む可変文面なので突合キーには使えない。
 *
 * 開封・クリック・バウンスは SES のイベントを BigQuery に落とした
 * xmile-drm.xwork.ses_event_records を providerMessageId = message_id で結合して得る。
 * 同一メールに Open が複数回入る（再表示のたびに記録される）ため、必ず message_id で
 * DISTINCT を取ってから率を出す。
 * ※ SES テーブルは GA4 の events_* ではないので、bot 除外（GA4_EXPORT_DEFAULT_FILTER）の対象外。
 *
 * 開封率の注意: SESの開封計測は画像読み込みに依存する。画像ブロック環境では open が
 * 立たないので実態より低く出る。逆に Apple のメールプライバシー保護は先読みで open を
 * 立てるため高く出る。**率の水準ではなくステップ間の相対差・時系列の変化で見る。**
 * ※ サーバー専用（DynamoDB / BQ）。クライアントは signupStepMailsTypes を参照すること
 */

import { DDB_TABLES, scanAll } from '@/lib/aws/dynamoClient'
import { runGa4EventsQuery } from '@/lib/bq/ga4EventsClient'
import { SIGNUP_STEPS, SIGNUP_STEP_TOPIC } from '@/lib/constants/signupStepMails'
import type { DailyMailRow, MailCounts, SignupStepMailsReport, StepMailRow } from './signupStepMailsTypes'

const SES_TABLE = '`xmile-drm.xwork.ses_event_records`'
/** 日次 Lambda の発火時刻（JST） */
const CRON_HOUR_JST = 12

interface DeliveryRecord {
    pk: string
    sk: string
    userId?: string
    topic?: string
    channel?: string
    status?: string
    at?: string
    providerMessageId?: string
    sentIdempotencyKey?: string
    reason?: string
}

interface StepMailSchedule {
    userId?: string
    registeredAt?: string
    nextStepIndex?: number
    status?: string
}

interface SesFlags {
    delivered: boolean
    opened: boolean
    clicked: boolean
    bounced: boolean
}

const stepKeyOf = (r: DeliveryRecord) => (r.sentIdempotencyKey ?? '').split(':').pop() ?? '(unknown)'
const jstDay = (iso?: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? '' : new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10)
}
const blank = (): MailCounts => ({ sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0, skipped: 0 })
const rate = (num: number, den: number) => (den > 0 ? num / den : null)

/** 期間は 7〜365 日に丸める */
export function clampDays(days: unknown): number {
    return Math.min(365, Math.max(7, Number(days) || 30))
}

/** SES イベントを message_id 単位に畳む。IN 句が巨大になりすぎないようチャンクする */
async function fetchSesFlags(messageIds: string[]): Promise<Map<string, SesFlags>> {
    const events = new Map<string, SesFlags>()
    const CHUNK = 900
    for (let i = 0; i < messageIds.length; i += CHUNK) {
        const ids = messageIds.slice(i, i + CHUNK).map((m) => `'${m.replace(/'/g, "''")}'`).join(',')
        const { rows } = await runGa4EventsQuery(`
            SELECT message_id,
              MAX(IF(event_type='Delivery', 1, 0)) AS delivered,
              MAX(IF(event_type='Open',     1, 0)) AS opened,
              MAX(IF(event_type='Click',    1, 0)) AS clicked,
              MAX(IF(event_type='Bounce',   1, 0)) AS bounced
            FROM ${SES_TABLE}
            WHERE message_id IN (${ids})
            GROUP BY message_id
        `)
        for (const r of rows) {
            events.set(String(r.message_id), {
                delivered: r.delivered === '1',
                opened: r.opened === '1',
                clicked: r.clicked === '1',
                bounced: r.bounced === '1',
            })
        }
    }
    return events
}

export async function runSignupStepMailsReport(daysInput: unknown): Promise<SignupStepMailsReport> {
    const nDays = clampDays(daysInput)
    const since = new Date(Date.now() - nDays * 86400_000).toISOString()

    // 1) 送達記録（送信の正）。小規模テーブルなのでScanで足りる
    const records = (
        await scanAll<DeliveryRecord>({
            TableName: DDB_TABLES.deliveryRecords,
            FilterExpression: '#topic = :topic AND #at >= :since',
            ExpressionAttributeNames: { '#topic': 'topic', '#at': 'at' },
            ExpressionAttributeValues: { ':topic': SIGNUP_STEP_TOPIC, ':since': since },
        })
    ).filter((r) => r.at)

    // 2) SES イベント
    const messageIds = [...new Set(records.map((r) => r.providerMessageId).filter(Boolean))] as string[]
    const events = messageIds.length > 0 ? await fetchSesFlags(messageIds) : new Map<string, SesFlags>()

    // 3) ステップ別・日別に集計。skipped と failed は意味が違うので必ず分ける
    const byStep = new Map<string, MailCounts>()
    const byDay = new Map<string, MailCounts>()
    const skipReasons: Record<string, number> = {}
    for (const r of records) {
        const ev = r.providerMessageId ? events.get(r.providerMessageId) : undefined
        if (r.status === 'skipped') {
            const reason = r.reason ?? '(unknown)'
            skipReasons[reason] = (skipReasons[reason] ?? 0) + 1
        }
        for (const [map, key] of [[byStep, stepKeyOf(r)], [byDay, jstDay(r.at)]] as const) {
            const b = map.get(key) ?? blank()
            if (r.status === 'sent') {
                b.sent += 1
                if (ev?.delivered) b.delivered += 1
                if (ev?.opened) b.opened += 1
                if (ev?.clicked) b.clicked += 1
                if (ev?.bounced) b.bounced += 1
            } else if (r.status === 'skipped') {
                b.skipped += 1
            } else {
                b.failed += 1
            }
            map.set(key, b)
        }
    }

    // 4) 配信スケジュール（母集団と進捗）
    const schedules = (
        await scanAll<StepMailSchedule>({
            TableName: DDB_TABLES.signupStepMails,
            FilterExpression: 'sk = :sk',
            ExpressionAttributeValues: { ':sk': 'SIGNUP_STEP' },
        })
    ).filter((s) => s.registeredAt)

    const scheduleStatus: Record<string, number> = {}
    const pendingByStep: Record<string, number> = {}
    for (const s of schedules) {
        const st = s.status ?? '(unknown)'
        scheduleStatus[st] = (scheduleStatus[st] ?? 0) + 1
        const next = SIGNUP_STEPS[Number(s.nextStepIndex ?? 0)]
        if (s.status === 'active' && next) pendingByStep[next.key] = (pendingByStep[next.key] ?? 0) + 1
    }

    const steps: StepMailRow[] = SIGNUP_STEPS.map((def) => {
        const b = byStep.get(def.key) ?? blank()
        return {
            ...def,
            ...b,
            openRate: rate(b.opened, b.delivered),
            clickRate: rate(b.clicked, b.delivered),
            ctorRate: rate(b.clicked, b.opened),
            pendingUsers: pendingByStep[def.key] ?? 0,
        }
    })

    // 送信ゼロの日も行として残す。抜けていると「データが取れていない」ように見えるが、
    // 実際には cron が回って対象者がいなかっただけ、という日が普通に挟まる。
    // 起点は最初の送信日ではなく「最初の対象者の登録日」。稼働直後は経過日数が足りず
    // 送信ゼロの日が先頭に並ぶので、そこを省くと立ち上がりの経緯が読めなくなる
    const todayJst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
    const firstRegisteredDay = schedules.map((x) => jstDay(x.registeredAt)).filter(Boolean).sort()[0]
    const firstDay = [firstRegisteredDay, since.slice(0, 10)].filter(Boolean).sort().reverse()[0]
    const daily: DailyMailRow[] = []
    if (firstDay) {
        for (let d = new Date(`${firstDay}T00:00:00Z`); d.toISOString().slice(0, 10) <= todayJst; d.setUTCDate(d.getUTCDate() + 1)) {
            const date = d.toISOString().slice(0, 10)
            const b = byDay.get(date) ?? blank()
            daily.push({ date, ...b, openRate: rate(b.opened, b.delivered) })
        }
    }

    const totals = steps.reduce<MailCounts>((a, s) => ({
        sent: a.sent + s.sent, delivered: a.delivered + s.delivered,
        opened: a.opened + s.opened, clicked: a.clicked + s.clicked,
        bounced: a.bounced + s.bounced, failed: a.failed + s.failed,
        skipped: a.skipped + s.skipped,
    }), blank())

    return {
        days: nDays,
        since: since.slice(0, 10),
        steps,
        daily,
        totals: { ...totals, openRate: rate(totals.opened, totals.delivered), clickRate: rate(totals.clicked, totals.delivered) },
        schedules: {
            total: schedules.length,
            byStatus: scheduleStatus,
            firstRegisteredAt: schedules.map((x) => x.registeredAt ?? '').filter(Boolean).sort()[0] ?? null,
        },
        skipReasons,
        unmatchedMessages: messageIds.length - events.size,
        cronHourJst: CRON_HOUR_JST,
        todayJst,
        fetchedAt: new Date().toISOString(),
    }
}
