import { prisma } from '@/lib/db/client'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { sendSlackNotification, type SlackBlock } from '@/lib/services/notification/slackService'

// x-work.jpのサンクスページ定義（insights と同じ）: 応募CV / LP応募CV / 会員登録CV
const CV_PAGE_PREFIXES = {
    applyCv: '/entry/thanks',
    lpApplyCv: '/lp-thanks',
    signupCv: '/members/signup/thanks',
} as const
type CvKey = keyof typeof CV_PAGE_PREFIXES

const METRIC_LABELS: Record<string, string> = {
    sessions: 'セッション数',
    applyCv: '応募CV',
    lpApplyCv: 'LP応募CV',
    signupCv: '会員登録CV',
    cvr: '全体CVR（CV合計÷セッション）',
}

// 前日値がベースライン（過去4週の同一曜日の中央値）からこれ以上下落したら通知
// 求人サービスは曜日変動が大きいため、直近7日平均ではなく同一曜日で比較する
const DROP_THRESHOLD = 0.3
// ノイズ除去: ベースライン平均がこの値未満の指標は判定しない
const MIN_BASELINE = { sessions: 100, cv: 5, cvr: 0.001 } as const

export interface CvDropAlert {
    metric: string
    label: string
    yesterday: number
    baselineAvg: number
    dropRate: number
}

export interface ProductAlertResult {
    productId: number
    productName: string
    propertyId: string
    targetDate: string
    alerts: CvDropAlert[]
}

interface DailyMetrics {
    date: string
    sessions: number
    cv: Record<CvKey, number>
}

async function fetchDailyMetrics(propertyId: string, accessToken: string): Promise<DailyMetrics[]> {
    const dateRanges = [{ startDate: '29daysAgo', endDate: 'yesterday' }]
    const [sessionsReport, cvReport] = await Promise.all([
        fetchGA4Data({
            propertyId, dateRanges,
            dimensions: [{ name: 'date' }],
            metrics: [{ name: 'sessions' }],
            limit: 100,
        }, accessToken),
        fetchGA4Data(Object.assign({
            propertyId, dateRanges,
            dimensions: [{ name: 'date' }, { name: 'pagePath' }],
            metrics: [{ name: 'totalUsers' }],
            limit: 1000,
        }, {
            dimensionFilter: {
                orGroup: {
                    expressions: Object.values(CV_PAGE_PREFIXES).map((prefix) => ({
                        filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: prefix } },
                    })),
                },
            },
        }), accessToken),
    ])

    const byDate = new Map<string, DailyMetrics>()
    for (const r of sessionsReport.rows ?? []) {
        const date = r.dimensionValues[0]?.value ?? ''
        byDate.set(date, { date, sessions: parseInt(r.metricValues[0]?.value ?? '0', 10), cv: { applyCv: 0, lpApplyCv: 0, signupCv: 0 } })
    }
    for (const r of cvReport.rows ?? []) {
        const date = r.dimensionValues[0]?.value ?? ''
        const path = r.dimensionValues[1]?.value ?? ''
        const entry = byDate.get(date)
        if (!entry) continue
        for (const [key, prefix] of Object.entries(CV_PAGE_PREFIXES) as Array<[CvKey, string]>) {
            if (path.startsWith(prefix)) {
                entry.cv[key] += parseInt(r.metricValues[0]?.value ?? '0', 10)
                break
            }
        }
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

function weekday(dateStr: string): number {
    // GA4 の date は YYYYMMDD
    return new Date(`${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T00:00:00Z`).getUTCDay()
}

function detectDrops(days: DailyMetrics[]): { targetDate: string; alerts: CvDropAlert[] } | null {
    if (days.length < 8) return null
    const yesterday = days[days.length - 1]
    const targetWeekday = weekday(yesterday.date)
    // ベースライン: 過去4週の同一曜日
    const baseline = days.slice(0, -1).filter((d) => weekday(d.date) === targetWeekday).slice(-4)
    if (baseline.length < 2) return null // 比較に足るサンプルがない
    // 中央値: キャンペーン等による単発スパイクがベースラインを歪めて誤報するのを防ぐ
    const median = (nums: number[]) => {
        const sorted = [...nums].sort((a, b) => a - b)
        const mid = Math.floor(sorted.length / 2)
        return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
    }

    const totalCv = (d: DailyMetrics) => d.cv.applyCv + d.cv.lpApplyCv + d.cv.signupCv
    const cvr = (d: DailyMetrics) => (d.sessions > 0 ? totalCv(d) / d.sessions : 0)

    const checks: Array<{ metric: string; yesterday: number; baselineAvg: number; minBaseline: number }> = [
        { metric: 'sessions', yesterday: yesterday.sessions, baselineAvg: median(baseline.map((d) => d.sessions)), minBaseline: MIN_BASELINE.sessions },
        { metric: 'applyCv', yesterday: yesterday.cv.applyCv, baselineAvg: median(baseline.map((d) => d.cv.applyCv)), minBaseline: MIN_BASELINE.cv },
        { metric: 'lpApplyCv', yesterday: yesterday.cv.lpApplyCv, baselineAvg: median(baseline.map((d) => d.cv.lpApplyCv)), minBaseline: MIN_BASELINE.cv },
        { metric: 'signupCv', yesterday: yesterday.cv.signupCv, baselineAvg: median(baseline.map((d) => d.cv.signupCv)), minBaseline: MIN_BASELINE.cv },
        { metric: 'cvr', yesterday: cvr(yesterday), baselineAvg: median(baseline.map(cvr)), minBaseline: MIN_BASELINE.cvr },
    ]

    const alerts: CvDropAlert[] = []
    for (const c of checks) {
        if (c.baselineAvg < c.minBaseline) continue
        const dropRate = (c.baselineAvg - c.yesterday) / c.baselineAvg
        if (dropRate >= DROP_THRESHOLD) {
            alerts.push({
                metric: c.metric,
                label: METRIC_LABELS[c.metric],
                yesterday: c.yesterday,
                baselineAvg: c.baselineAvg,
                dropRate,
            })
        }
    }
    return { targetDate: yesterday.date, alerts }
}

function formatValue(metric: string, v: number): string {
    return metric === 'cvr' ? `${(v * 100).toFixed(2)}%` : Math.round(v).toLocaleString()
}

function buildSlackBlocks(result: ProductAlertResult): SlackBlock[] {
    const date = `${result.targetDate.slice(0, 4)}-${result.targetDate.slice(4, 6)}-${result.targetDate.slice(6, 8)}`
    const lines = result.alerts.map((a) =>
        `• *${a.label}*: ${formatValue(a.metric, a.yesterday)}（過去4週の同曜日中央値 ${formatValue(a.metric, a.baselineAvg)} から *-${(a.dropRate * 100).toFixed(1)}%*）`
    ).join('\n')
    return [
        { type: 'header', text: { type: 'plain_text', text: `🚨 CV急落アラート: ${result.productName}` } },
        { type: 'section', text: { type: 'mrkdwn', text: `対象日: *${date}*（前日）\n以下の指標が過去4週の同一曜日の中央値から${DROP_THRESHOLD * 100}%以上下落しています。`} },
        { type: 'section', text: { type: 'mrkdwn', text: lines } },
        { type: 'divider' },
        { type: 'section', text: { type: 'mrkdwn', text: '計測タグの欠落・サイト障害・流入急減の可能性を確認してください。' } },
    ]
}

/**
 * 全プロダクトの前日CV・CVRを過去4週の同一曜日の中央値と比較し、
 * しきい値以上の下落があれば Slack に通知する。
 */
export async function checkCvDropAndNotify(): Promise<ProductAlertResult[]> {
    const products = await prisma.product.findMany({
        where: { ga4PropertyId: { not: null } },
    })
    if (products.length === 0) return []

    const accessToken = await getGA4AccessToken()
    const webhookUrl = process.env.SLACK_WEBHOOK_URL
    const results: ProductAlertResult[] = []

    for (const product of products) {
        try {
            const days = await fetchDailyMetrics(product.ga4PropertyId as string, accessToken)
            const detected = detectDrops(days)
            if (!detected) continue
            const result: ProductAlertResult = {
                productId: product.id,
                productName: product.name,
                propertyId: product.ga4PropertyId as string,
                targetDate: detected.targetDate,
                alerts: detected.alerts,
            }
            results.push(result)
            if (detected.alerts.length > 0 && webhookUrl) {
                await sendSlackNotification([webhookUrl], buildSlackBlocks(result))
            }
        } catch (err) {
            console.error(`[cvDropAlert] product ${product.id} チェック失敗:`, err instanceof Error ? err.message : err)
        }
    }
    return results
}
