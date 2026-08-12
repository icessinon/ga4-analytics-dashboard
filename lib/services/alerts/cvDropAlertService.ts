import { prisma } from '@/lib/db/client'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { sendSlackNotification, type SlackBlock } from '@/lib/services/notification/slackService'
import { generateCvDropCauseHypothesis, type DropDrilldown, type DropSegment } from '@/lib/api/gemini/cvDropCause'
import {
    detectSegmentAnomalies, buildSegmentAnomalyBlocks, SPIKE_THRESHOLD,
    type SegmentAnomaly, type SegmentAnomalyConfig,
} from './segmentAnomalyService'

// x-work.jpのサンクスページ定義（insights と同じ）: 応募CV / LP応募CV / 会員登録CV
export const CV_PAGE_PREFIXES = {
    applyCv: '/entry/thanks',
    lpApplyCv: '/lp-thanks',
    signupCv: '/members/signup/thanks',
} as const
export type CvKey = keyof typeof CV_PAGE_PREFIXES

export const METRIC_LABELS: Record<string, string> = {
    sessions: 'セッション数',
    applyCv: '応募CV',
    lpApplyCv: 'LP応募CV',
    signupCv: '会員登録CV',
    cvr: '全体CVR（CV合計÷セッション）',
}

// セグメント監視の擬似指標キー（AlertConfig.metrics のトグルで使う。全体指標のdetectDropsでは判定しない）
export const SEGMENT_METRIC_KEYS = ['pageSegments', 'cvChannelSegments'] as const

// 前日値がベースライン（過去8週の同一曜日の中央値）からこれ以上下落したら通知
// 求人サービスは曜日変動が大きいため、直近7日平均ではなく同一曜日で比較する。
// 4週だとキャンペーン等のスパイクが2週あるだけで中央値が歪むため8週とる
const DROP_THRESHOLD = Number(process.env.CV_DROP_ALERT_THRESHOLD || '') || 0.3
const BASELINE_WEEKS = 8
// 8週ぶんの同一曜日 + 前日 を含む範囲（8*7+1 = 57日前〜昨日）
const FETCH_START_DATE = `${BASELINE_WEEKS * 7 + 1}daysAgo`
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
    dropThreshold: number
    baselineDates: string[]
    alerts: CvDropAlert[]
    drilldowns?: DropDrilldown[]
    aiHypothesis?: string | null
    /** セグメント別（ページカテゴリ・CV×チャネル）の急増・急落 */
    segmentAnomalies?: SegmentAnomaly[]
}

interface DailyMetrics {
    date: string
    sessions: number
    cv: Record<CvKey, number>
}

async function fetchDailyMetrics(propertyId: string, accessToken: string): Promise<DailyMetrics[]> {
    const dateRanges = [{ startDate: FETCH_START_DATE, endDate: 'yesterday' }]
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

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

// 中央値: キャンペーン等による単発スパイクがベースラインを歪めて誤報するのを防ぐ
function median(nums: number[]): number {
    const sorted = [...nums].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export interface AlertConfigValues {
    dropThreshold: number
    minSessions: number
    minCv: number
    /** 監視対象指標キー。null = 全指標 */
    metrics: string[] | null
}

export const DEFAULT_ALERT_CONFIG: AlertConfigValues = {
    dropThreshold: DROP_THRESHOLD,
    minSessions: MIN_BASELINE.sessions,
    minCv: MIN_BASELINE.cv,
    metrics: null,
}

function detectDrops(days: DailyMetrics[], config: AlertConfigValues): { targetDate: string; baselineDates: string[]; alerts: CvDropAlert[] } | null {
    if (days.length < 8) return null
    const yesterday = days[days.length - 1]
    const targetWeekday = weekday(yesterday.date)
    // ベースライン: 過去8週の同一曜日
    const baseline = days.slice(0, -1).filter((d) => weekday(d.date) === targetWeekday).slice(-BASELINE_WEEKS)
    if (baseline.length < 2) return null // 比較に足るサンプルがない

    const totalCv = (d: DailyMetrics) => d.cv.applyCv + d.cv.lpApplyCv + d.cv.signupCv
    const cvr = (d: DailyMetrics) => (d.sessions > 0 ? totalCv(d) / d.sessions : 0)

    // 統計ガード: 件数データの日次ゆらぎは±√n程度あり、%しきい値だけだと中央値が小さい指標
    // （例: 応募CVは日次十数件）がノイズで発火し続ける。ポアソン近似で3σ以上の乖離を必須にする。
    // CVR（比率）は「昨日のセッション数×ベースラインCVRから期待されるCV数」と実CV数の乖離で判定する
    const sigmaOk = (yesterdayCount: number, expectedCount: number) =>
        expectedCount <= 0 || Math.abs(yesterdayCount - expectedCount) >= 3 * Math.sqrt(expectedCount)

    const baselineCvr = median(baseline.map(cvr))
    const checks: Array<{ metric: string; yesterday: number; baselineAvg: number; minBaseline: number; passesSigma: boolean }> = [
        { metric: 'sessions', yesterday: yesterday.sessions, baselineAvg: median(baseline.map((d) => d.sessions)), minBaseline: config.minSessions, passesSigma: sigmaOk(yesterday.sessions, median(baseline.map((d) => d.sessions))) },
        { metric: 'applyCv', yesterday: yesterday.cv.applyCv, baselineAvg: median(baseline.map((d) => d.cv.applyCv)), minBaseline: config.minCv, passesSigma: sigmaOk(yesterday.cv.applyCv, median(baseline.map((d) => d.cv.applyCv))) },
        { metric: 'lpApplyCv', yesterday: yesterday.cv.lpApplyCv, baselineAvg: median(baseline.map((d) => d.cv.lpApplyCv)), minBaseline: config.minCv, passesSigma: sigmaOk(yesterday.cv.lpApplyCv, median(baseline.map((d) => d.cv.lpApplyCv))) },
        { metric: 'signupCv', yesterday: yesterday.cv.signupCv, baselineAvg: median(baseline.map((d) => d.cv.signupCv)), minBaseline: config.minCv, passesSigma: sigmaOk(yesterday.cv.signupCv, median(baseline.map((d) => d.cv.signupCv))) },
        { metric: 'cvr', yesterday: cvr(yesterday), baselineAvg: baselineCvr, minBaseline: MIN_BASELINE.cvr, passesSigma: sigmaOk(totalCv(yesterday), baselineCvr * yesterday.sessions) },
    ]

    const alerts: CvDropAlert[] = []
    for (const c of checks) {
        if (config.metrics && !config.metrics.includes(c.metric)) continue
        if (c.baselineAvg < c.minBaseline) continue
        if (!c.passesSigma) continue
        const dropRate = (c.baselineAvg - c.yesterday) / c.baselineAvg
        if (dropRate >= config.dropThreshold) {
            alerts.push({
                metric: c.metric,
                label: METRIC_LABELS[c.metric],
                yesterday: c.yesterday,
                baselineAvg: c.baselineAvg,
                dropRate,
            })
        }
    }
    return { targetDate: yesterday.date, baselineDates: baseline.map((d) => d.date), alerts }
}

// ── アラート発火時の原因ドリルダウン ──

/** date × セグメント の GA4 レポートから、セグメント別の「前日 vs 過去8週同曜日中央値」下落幅を集計 */
function buildSegmentDrops(
    rows: Array<{ dimensionValues: Array<{ value?: string }>; metricValues: Array<{ value?: string }> }>,
    targetDate: string,
    baselineDates: string[]
): DropSegment[] {
    const bySegment = new Map<string, Map<string, number>>()
    for (const r of rows) {
        const date = r.dimensionValues[0]?.value ?? ''
        const segment = r.dimensionValues[1]?.value || '(not set)'
        const value = parseInt(r.metricValues[0]?.value ?? '0', 10)
        if (!bySegment.has(segment)) bySegment.set(segment, new Map())
        const dates = bySegment.get(segment) as Map<string, number>
        dates.set(date, (dates.get(date) ?? 0) + value)
    }
    const drops: DropSegment[] = []
    for (const [segment, dates] of bySegment) {
        const yesterday = dates.get(targetDate) ?? 0
        const baselineMedian = median(baselineDates.map((d) => dates.get(d) ?? 0))
        const diff = baselineMedian - yesterday
        if (diff > 0) drops.push({ segment, yesterday, baselineMedian, diff })
    }
    return drops.sort((a, b) => b.diff - a.diff).slice(0, 5)
}

/** 急落した指標に応じて、チャネル別・デバイス別・ページ別の内訳を集計する */
async function fetchDrilldowns(
    propertyId: string,
    accessToken: string,
    targetDate: string,
    baselineDates: string[],
    alerts: CvDropAlert[]
): Promise<DropDrilldown[]> {
    const dateRanges = [{ startDate: FETCH_START_DATE, endDate: 'yesterday' }]
    const alertedMetrics = new Set(alerts.map((a) => a.metric))
    // CVR急落はセッション・CV両方の内訳で説明できるため、全CV種別を対象にする
    const cvKeys = (Object.keys(CV_PAGE_PREFIXES) as CvKey[])
        .filter((k) => alertedMetrics.has(k) || alertedMetrics.has('cvr'))

    const queries: Array<{ label: string; fetch: Promise<{ rows?: Array<{ dimensionValues: Array<{ value?: string }>; metricValues: Array<{ value?: string }> }> }> }> = [
        {
            label: 'チャネル別セッション',
            fetch: fetchGA4Data({
                propertyId, dateRanges,
                dimensions: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }],
                metrics: [{ name: 'sessions' }],
                limit: 1000,
            }, accessToken),
        },
        {
            label: 'デバイス別セッション',
            fetch: fetchGA4Data({
                propertyId, dateRanges,
                dimensions: [{ name: 'date' }, { name: 'deviceCategory' }],
                metrics: [{ name: 'sessions' }],
                limit: 1000,
            }, accessToken),
        },
    ]
    for (const key of cvKeys) {
        const cvFilter = {
            dimensionFilter: {
                filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: CV_PAGE_PREFIXES[key] } },
            },
        }
        queries.push({
            label: `チャネル別${METRIC_LABELS[key]}`,
            fetch: fetchGA4Data(Object.assign({
                propertyId, dateRanges,
                dimensions: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }],
                metrics: [{ name: 'totalUsers' }],
                limit: 1000,
            }, cvFilter), accessToken),
        })
        queries.push({
            label: `ページ別${METRIC_LABELS[key]}`,
            fetch: fetchGA4Data(Object.assign({
                propertyId, dateRanges,
                dimensions: [{ name: 'date' }, { name: 'pagePath' }],
                metrics: [{ name: 'totalUsers' }],
                limit: 1000,
            }, cvFilter), accessToken),
        })
    }

    const reports = await Promise.all(queries.map((q) => q.fetch))
    const drilldowns: DropDrilldown[] = []
    for (let i = 0; i < queries.length; i++) {
        const segments = buildSegmentDrops(reports[i].rows ?? [], targetDate, baselineDates)
        if (segments.length > 0) drilldowns.push({ label: queries[i].label, segments })
    }
    return drilldowns
}

function formatValue(metric: string, v: number): string {
    return metric === 'cvr' ? `${(v * 100).toFixed(2)}%` : Math.round(v).toLocaleString()
}

function fmtDate(dateStr: string): string {
    return `${parseInt(dateStr.slice(4, 6), 10)}/${parseInt(dateStr.slice(6, 8), 10)}`
}

// Slack の section text は 3,000 文字上限。超えると途中で切断され文字化けするため安全にトリムする
const SLACK_SECTION_MAX = 2900
function trimForSlack(text: string): string {
    return text.length > SLACK_SECTION_MAX ? `${text.slice(0, SLACK_SECTION_MAX)}\n…(以下省略)` : text
}

function buildSlackBlocks(result: ProductAlertResult): SlackBlock[] {
    const date = `${result.targetDate.slice(0, 4)}-${result.targetDate.slice(4, 6)}-${result.targetDate.slice(6, 8)}`
    const baselineNote = result.baselineDates.length > 0
        ? `\nベースライン: 過去${result.baselineDates.length}週の同一曜日（${result.baselineDates.map(fmtDate).join(', ')}）の中央値`
        : ''
    const lines = result.alerts.map((a) =>
        `• *${a.label}*: ${formatValue(a.metric, a.yesterday)}（同曜日中央値 ${formatValue(a.metric, a.baselineAvg)} から *-${(a.dropRate * 100).toFixed(1)}%*）`
    ).join('\n')
    const blocks: SlackBlock[] = [
        { type: 'header', text: { type: 'plain_text', text: `🚨 CV急落アラート: ${result.productName}` } },
        { type: 'section', text: { type: 'mrkdwn', text: trimForSlack(`対象日: *${date}*（前日）\n以下の指標が同一曜日の中央値から${Math.round(result.dropThreshold * 100)}%以上下落しています。${baselineNote}`) } },
        { type: 'section', text: { type: 'mrkdwn', text: trimForSlack(lines) } },
    ]
    if (result.drilldowns && result.drilldowns.length > 0) {
        blocks.push({ type: 'divider' })
        // 1セクションにまとめると3,000文字を超えて切断されるため、次元ごとにセクションを分ける
        for (const d of result.drilldowns) {
            const segLines = d.segments.map((s) =>
                `　• ${s.segment}: ${Math.round(s.yesterday).toLocaleString()}（中央値 ${Math.round(s.baselineMedian).toLocaleString()}、-${Math.round(s.diff).toLocaleString()}）`
            ).join('\n')
            blocks.push({ type: 'section', text: { type: 'mrkdwn', text: trimForSlack(`*${d.label}（下落幅上位）*\n${segLines}`) } })
        }
    }
    if (result.aiHypothesis) {
        blocks.push({ type: 'divider' })
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: trimForSlack(`🤖 *AI原因仮説*\n${result.aiHypothesis}`) } })
    }
    blocks.push({ type: 'divider' })
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '計測タグの欠落・サイト障害・流入急減の可能性を確認してください。' } })
    return blocks
}

/**
 * 全プロダクトの前日CV・CVRを過去8週の同一曜日の中央値と比較し、
 * しきい値以上の下落があれば Slack に通知する。
 */
export async function checkCvDropAndNotify(): Promise<ProductAlertResult[]> {
    const products = await prisma.product.findMany({
        where: { ga4PropertyId: { not: null } },
        include: { alertConfig: true },
    })
    if (products.length === 0) return []

    const accessToken = await getGA4AccessToken()
    const webhookUrl = process.env.SLACK_WEBHOOK_URL
    const results: ProductAlertResult[] = []

    for (const product of products) {
        try {
            if (product.alertConfig && !product.alertConfig.enabled) continue
            const config: AlertConfigValues = product.alertConfig
                ? {
                    dropThreshold: product.alertConfig.dropThreshold,
                    minSessions: product.alertConfig.minSessions,
                    minCv: product.alertConfig.minCv,
                    metrics: Array.isArray(product.alertConfig.metrics) ? (product.alertConfig.metrics as string[]) : null,
                }
                : DEFAULT_ALERT_CONFIG
            const days = await fetchDailyMetrics(product.ga4PropertyId as string, accessToken)
            const detected = detectDrops(days, config)
            if (!detected) continue
            const result: ProductAlertResult = {
                productId: product.id,
                productName: product.name,
                propertyId: product.ga4PropertyId as string,
                targetDate: detected.targetDate,
                dropThreshold: config.dropThreshold,
                baselineDates: detected.baselineDates,
                alerts: detected.alerts,
            }
            if (detected.alerts.length > 0) {
                // 原因ドリルダウン: チャネル別・デバイス別・ページ別の内訳とAI原因仮説を添付
                try {
                    result.drilldowns = await fetchDrilldowns(
                        product.ga4PropertyId as string, accessToken,
                        detected.targetDate, detected.baselineDates, detected.alerts
                    )
                    result.aiHypothesis = await generateCvDropCauseHypothesis({
                        productName: product.name,
                        targetDate: detected.targetDate,
                        weekdayLabel: WEEKDAY_LABELS[weekday(detected.targetDate)],
                        alerts: detected.alerts,
                        drilldowns: result.drilldowns,
                    }, product.id)
                } catch (err) {
                    console.error(`[cvDropAlert] product ${product.id} ドリルダウン失敗:`, err instanceof Error ? err.message : err)
                }
            }
            // セグメント別（ページカテゴリ・CV×チャネル）の急増・急落。全体指標とは独立に判定・通知する
            try {
                const segConfig: SegmentAnomalyConfig = {
                    dropThreshold: config.dropThreshold,
                    spikeThreshold: SPIKE_THRESHOLD,
                    minPageUsers: config.minSessions,
                    minCv: config.minCv,
                    checkPageSegments: !config.metrics || config.metrics.includes('pageSegments'),
                    checkCvChannels: !config.metrics || config.metrics.includes('cvChannelSegments'),
                }
                if (segConfig.checkPageSegments || segConfig.checkCvChannels) {
                    const seg = await detectSegmentAnomalies(product.ga4PropertyId as string, accessToken, segConfig)
                    if (seg && seg.anomalies.length > 0) {
                        result.segmentAnomalies = seg.anomalies
                        if (webhookUrl) {
                            await sendSlackNotification(
                                [webhookUrl],
                                buildSegmentAnomalyBlocks(product.name, seg.targetDate, seg.baselineDates.length, seg.anomalies, segConfig)
                            )
                        }
                    }
                }
            } catch (err) {
                console.error(`[cvDropAlert] product ${product.id} セグメント検知失敗:`, err instanceof Error ? err.message : err)
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
