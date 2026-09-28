import { NextResponse } from 'next/server'
import { DDB_TABLES, scanAll } from '@/lib/aws/dynamoClient'
import { runGa4EventsQuery } from '@/lib/bq/ga4EventsClient'
import { SIGNUP_STEPS, SIGNUP_STEP_TOPIC } from '@/lib/constants/signupStepMails'

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
 *
 * 開封率の注意: SESの開封計測は画像読み込みに依存する。画像ブロック環境では open が
 * 立たないので実態より低く出る。逆に Apple のメールプライバシー保護は先読みで open を
 * 立てるため高く出る。**率の水準ではなくステップ間の相対差・時系列の変化で見る。**
 */

const SES_TABLE = '`xmile-drm.xwork.ses_event_records`'

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

const stepKeyOf = (r: DeliveryRecord) => (r.sentIdempotencyKey ?? '').split(':').pop() ?? '(unknown)'
const jstDay = (iso?: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? '' : new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10)
}

export async function POST(request: Request) {
    try {
        const { days = 30 } = (await request.json().catch(() => ({}))) as { days?: number }
        const nDays = Math.min(365, Math.max(7, Number(days) || 30))
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

        // 2) SESイベントを message_id 単位に畳む
        const messageIds = [...new Set(records.map((r) => r.providerMessageId).filter(Boolean))] as string[]
        const events = new Map<string, { delivered: boolean; opened: boolean; clicked: boolean; bounced: boolean }>()
        if (messageIds.length > 0) {
            // IN句が巨大になりすぎないようチャンクする。列は最小限に絞ってスキャン量を抑える
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
        }

        // 3) ステップ別に集計
        const blank = () => ({ sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0 })
        const byStep = new Map<string, ReturnType<typeof blank>>()
        const byDay = new Map<string, ReturnType<typeof blank>>()
        for (const r of records) {
            const step = stepKeyOf(r)
            const day = jstDay(r.at)
            const ev = r.providerMessageId ? events.get(r.providerMessageId) : undefined
            for (const [map, key] of [[byStep, step], [byDay, day]] as const) {
                const b = map.get(key) ?? blank()
                if (r.status === 'sent') {
                    b.sent += 1
                    if (ev?.delivered) b.delivered += 1
                    if (ev?.opened) b.opened += 1
                    if (ev?.clicked) b.clicked += 1
                    if (ev?.bounced) b.bounced += 1
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
            scheduleStatus[s.status ?? '(unknown)'] = (scheduleStatus[s.status ?? '(unknown)'] ?? 0) + 1
            const idx = Number(s.nextStepIndex ?? 0)
            const next = SIGNUP_STEPS[idx]
            if (s.status === 'active' && next) pendingByStep[next.key] = (pendingByStep[next.key] ?? 0) + 1
        }

        const steps = SIGNUP_STEPS.map((def) => {
            const b = byStep.get(def.key) ?? blank()
            return {
                ...def,
                ...b,
                // 分母は配信成功。SESが Delivery を返す前の集計では sent にフォールバックする
                openRate: b.delivered > 0 ? b.opened / b.delivered : null,
                clickRate: b.delivered > 0 ? b.clicked / b.delivered : null,
                ctorRate: b.opened > 0 ? b.clicked / b.opened : null,
                pendingUsers: pendingByStep[def.key] ?? 0,
            }
        })

        // 送信ゼロの日も行として残す。抜けていると「データが取れていない」ように見えるが、
        // 実際には cron が回って対象者がいなかっただけ、という日が普通に挟まる。
        // 起点は最初の送信日ではなく「最初の対象者の登録日」。稼働直後は経過日数が足りず
        // 送信ゼロの日が先頭に並ぶので、そこを省くと立ち上がりの経緯が読めなくなる
        const todayJst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
        const firstRegisteredDay = schedules
            .map((x) => jstDay(x.registeredAt))
            .filter(Boolean)
            .sort()[0]
        const firstDay = [firstRegisteredDay, since.slice(0, 10)]
            .filter(Boolean)
            .sort()
            .reverse()[0]
        const daily: Array<{ date: string } & ReturnType<typeof blank> & { openRate: number | null }> = []
        if (firstDay) {
            for (
                let d = new Date(`${firstDay}T00:00:00Z`);
                d.toISOString().slice(0, 10) <= todayJst;
                d.setUTCDate(d.getUTCDate() + 1)
            ) {
                const date = d.toISOString().slice(0, 10)
                const b = byDay.get(date) ?? blank()
                daily.push({ date, ...b, openRate: b.delivered > 0 ? b.opened / b.delivered : null })
            }
        }

        const totals = steps.reduce(
            (a, s) => ({
                sent: a.sent + s.sent, delivered: a.delivered + s.delivered,
                opened: a.opened + s.opened, clicked: a.clicked + s.clicked,
                bounced: a.bounced + s.bounced, failed: a.failed + s.failed,
            }),
            blank(),
        )

        return NextResponse.json({
            success: true,
            days: nDays,
            since: since.slice(0, 10),
            steps,
            daily,
            totals: {
                ...totals,
                openRate: totals.delivered > 0 ? totals.opened / totals.delivered : null,
                clickRate: totals.delivered > 0 ? totals.clicked / totals.delivered : null,
            },
            schedules: {
                total: schedules.length,
                byStatus: scheduleStatus,
                firstRegisteredAt: schedules.map((x) => x.registeredAt ?? '').filter(Boolean).sort()[0] ?? null,
            },
            unmatchedMessages: messageIds.length - events.size,
            /** 日次Lambdaの発火時刻（JST）。当日分がこの時刻まで0なのは正常 */
            cronHourJst: 12,
            todayJst,
            fetchedAt: new Date().toISOString(),
        })
    } catch (error) {
        console.error('Signup Step Mails API Error:', error)
        return NextResponse.json(
            { error: 'ステップメール実績の集計に失敗しました', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 },
        )
    }
}
