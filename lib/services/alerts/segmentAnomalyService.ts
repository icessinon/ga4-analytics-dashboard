import { fetchGA4Data } from '@/lib/api/ga4/client'
import type { SlackBlock } from '@/lib/services/notification/slackService'

/**
 * セグメント別の急増・急落検知。
 * 全体指標のみの cvDropAlertService を補完し、
 *  ① ページカテゴリ別の閲覧ユーザー（求人詳細・検索・一覧など）
 *  ② CV種別×チャネル別のCVユーザー
 * を「前日 vs 過去8週の同一曜日の中央値」で比較して、急落だけでなく急増（スパイク）も通知する。
 * SEOの順位変動・キャンペーン流入・計測タグ事故・bot流入は全体値に埋もれてセグメント単位で先に現れるため。
 */

const BASELINE_WEEKS = 8
const FETCH_START_DATE = `${BASELINE_WEEKS * 7 + 1}daysAgo`
// 急増側のしきい値（+50%）。下落側は AlertConfig.dropThreshold を使う
export const SPIKE_THRESHOLD = Number(process.env.CV_SPIKE_ALERT_THRESHOLD || '') || 0.5

const INDUSTRY_ALT = 'driver|sekokan|sekkei|soko|shokunin|seibi|hoshu|setsubi-sagyo|keibi|unkan|kojo-sagyo|food|unyu-sagyo|others'

type FilterExpression = Record<string, unknown>

const pageFilter = (matchType: string, value: string): FilterExpression => ({
    filter: { fieldName: 'pagePath', stringFilter: { matchType, value } },
})

/** ページカテゴリ定義（GA4のRE2は否定先読み不可のため、除外は notExpression で表現する） */
const PAGE_SEGMENTS: Array<{ key: string; label: string; expression: FilterExpression }> = [
    {
        key: 'detail',
        label: '求人詳細',
        expression: pageFilter('PARTIAL_REGEXP', `^/(${INDUSTRY_ALT})/media_[0-9]+`),
    },
    {
        key: 'list',
        label: '検索・一覧',
        expression: {
            andGroup: {
                expressions: [
                    {
                        orGroup: {
                            expressions: [
                                pageFilter('BEGINS_WITH', '/search'),
                                pageFilter('PARTIAL_REGEXP', `^/(${INDUSTRY_ALT})(/|$)`),
                            ],
                        },
                    },
                    { notExpression: pageFilter('CONTAINS', 'media_') },
                ],
            },
        },
    },
    { key: 'top', label: 'TOP', expression: pageFilter('EXACT', '/') },
    // コラム(/journal)はこのGA4プロパティにデータなし（2026-08バックテストで確認）のため対象外
    { key: 'signupForm', label: '会員登録フォーム', expression: pageFilter('BEGINS_WITH', '/members/signup') },
    { key: 'entryForm', label: '応募フォーム', expression: pageFilter('PARTIAL_REGEXP', '^/entry/media_[0-9]+') },
]

// CV種別（cvDropAlertService と同じサンクスページ定義。循環importを避けるためここに持つ）
const CV_SEGMENTS: Array<{ key: string; label: string; prefix: string }> = [
    { key: 'applyCv', label: '応募CV', prefix: '/entry/thanks' },
    { key: 'lpApplyCv', label: 'LP応募CV', prefix: '/lp-thanks' },
    { key: 'signupCv', label: '会員登録CV', prefix: '/members/signup/thanks' },
]

export interface SegmentAnomaly {
    /** 'page' = ページカテゴリ別閲覧 / 'cvChannel' = CV種別×チャネル */
    family: 'page' | 'cvChannel'
    segment: string
    direction: 'spike' | 'drop'
    yesterday: number
    baselineMedian: number
    /** +0.54 = +54% / -0.35 = -35% */
    changeRate: number
    /** 変動に効いたページ・チャネルの内訳（上位のみ） */
    contributors?: Array<{ name: string; yesterday: number; baselineMedian: number; diff: number }>
}

export interface SegmentAnomalyConfig {
    dropThreshold: number
    spikeThreshold: number
    minPageUsers: number
    minCv: number
    checkPageSegments: boolean
    checkCvChannels: boolean
}

interface GA4Row { dimensionValues: Array<{ value?: string }>; metricValues: Array<{ value?: string }> }

function weekday(dateStr: string): number {
    return new Date(`${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T00:00:00Z`).getUTCDay()
}

function median(nums: number[]): number {
    const sorted = [...nums].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** date→値 の系列から (前日, 同曜日中央値, ベースライン日付) を出す。日付はGA4のYYYYMMDD */
function evalSeries(series: Map<string, number>, targetDate: string, baselineDates: string[]): { yesterday: number; baselineMedian: number } {
    return {
        yesterday: series.get(targetDate) ?? 0,
        baselineMedian: median(baselineDates.map((d) => series.get(d) ?? 0)),
    }
}

function rowsToSeries(rows: GA4Row[], segmentIndex: number | null): Map<string, Map<string, number>> {
    // segmentIndex = null → 全体で1系列（キー ''）
    const bySegment = new Map<string, Map<string, number>>()
    for (const r of rows) {
        const date = r.dimensionValues[0]?.value ?? ''
        const seg = segmentIndex != null ? (r.dimensionValues[segmentIndex]?.value || '(not set)') : ''
        const v = parseInt(r.metricValues[0]?.value ?? '0', 10)
        if (!bySegment.has(seg)) bySegment.set(seg, new Map())
        const s = bySegment.get(seg) as Map<string, number>
        s.set(date, (s.get(date) ?? 0) + v)
    }
    return bySegment
}

/** 直近57日の日付一覧から対象日（最終日）とベースライン日付（過去8週の同曜日）を決める */
function resolveDates(allDates: string[]): { targetDate: string; baselineDates: string[] } | null {
    if (allDates.length < 15) return null
    const sorted = [...new Set(allDates)].sort()
    const targetDate = sorted[sorted.length - 1]
    const targetWd = weekday(targetDate)
    const baselineDates = sorted.slice(0, -1).filter((d) => weekday(d) === targetWd).slice(-BASELINE_WEEKS)
    if (baselineDates.length < 2) return null
    return { targetDate, baselineDates }
}

function judge(
    yesterday: number, baselineMedian: number, minBaseline: number,
    config: SegmentAnomalyConfig
): { direction: 'spike' | 'drop'; changeRate: number } | null {
    // 急落は既存アラート同様ベースラインの太さで判定。急増は「ベースラインが細くても前日が太い」ケース
    // （新規流入・bot・タグ変更）を拾いたいので、前日値が最低ラインを超えていれば判定する
    if (baselineMedian < minBaseline && yesterday < minBaseline) return null
    if (baselineMedian <= 0) {
        return yesterday >= minBaseline ? { direction: 'spike', changeRate: Infinity } : null
    }
    // 統計ガード: 件数データの日次ゆらぎは±√n程度あるため、%しきい値だけだと中央値が小さい
    // セグメントがノイズで発火し続ける（バックテスト実測: 2.8件/日 → 3σガードで0.7件/日）。
    // ポアソン近似で3σ以上乖離した変動のみアラート対象にする
    if (Math.abs(yesterday - baselineMedian) < 3 * Math.sqrt(baselineMedian)) return null
    const changeRate = (yesterday - baselineMedian) / baselineMedian
    if (changeRate >= config.spikeThreshold && yesterday >= minBaseline) return { direction: 'spike', changeRate }
    if (-changeRate >= config.dropThreshold && baselineMedian >= minBaseline) return { direction: 'drop', changeRate }
    return null
}

/** 発火したページセグメントについて、変動に効いた個別ページ上位を取る */
async function fetchPageContributors(
    propertyId: string, accessToken: string, expression: FilterExpression,
    targetDate: string, baselineDates: string[], direction: 'spike' | 'drop'
): Promise<SegmentAnomaly['contributors']> {
    const report = await fetchGA4Data({
        propertyId,
        dateRanges: [{ startDate: FETCH_START_DATE, endDate: 'yesterday' }],
        dimensions: [{ name: 'date' }, { name: 'pagePath' }],
        metrics: [{ name: 'totalUsers' }],
        dimensionFilter: expression,
        limit: 50000,
    }, accessToken)
    const byPage = rowsToSeries((report.rows ?? []) as GA4Row[], 1)
    const contributors: NonNullable<SegmentAnomaly['contributors']> = []
    for (const [name, series] of byPage) {
        const { yesterday, baselineMedian } = evalSeries(series, targetDate, baselineDates)
        const diff = yesterday - baselineMedian
        if (direction === 'spike' ? diff > 0 : diff < 0) contributors.push({ name, yesterday, baselineMedian, diff })
    }
    contributors.sort((a, b) => direction === 'spike' ? b.diff - a.diff : a.diff - b.diff)
    return contributors.slice(0, 5)
}

/**
 * セグメント別の急増・急落を検知する。
 * 戻り値の anomalies が空なら異常なし。
 */
export async function detectSegmentAnomalies(
    propertyId: string,
    accessToken: string,
    config: SegmentAnomalyConfig
): Promise<{ targetDate: string; baselineDates: string[]; anomalies: SegmentAnomaly[] } | null> {
    const dateRanges = [{ startDate: FETCH_START_DATE, endDate: 'yesterday' }]
    const anomalies: SegmentAnomaly[] = []
    let targetDate = ''
    let baselineDates: string[] = []

    if (config.checkPageSegments) {
        // ページカテゴリごとに date × totalUsers（クエリは小さいので直列でなく並列）
        const reports = await Promise.all(PAGE_SEGMENTS.map((s) => fetchGA4Data({
            propertyId, dateRanges,
            dimensions: [{ name: 'date' }],
            metrics: [{ name: 'totalUsers' }],
            dimensionFilter: s.expression,
            limit: 100,
        }, accessToken)))
        for (let i = 0; i < PAGE_SEGMENTS.length; i++) {
            const seg = PAGE_SEGMENTS[i]
            const series = rowsToSeries((reports[i].rows ?? []) as GA4Row[], null).get('') ?? new Map()
            const dates = resolveDates([...series.keys()])
            if (!dates) continue
            targetDate = dates.targetDate
            baselineDates = dates.baselineDates
            const { yesterday, baselineMedian } = evalSeries(series, dates.targetDate, dates.baselineDates)
            const judged = judge(yesterday, baselineMedian, config.minPageUsers, config)
            if (!judged) continue
            const anomaly: SegmentAnomaly = {
                family: 'page', segment: `${seg.label}（閲覧ユーザー）`,
                direction: judged.direction, yesterday, baselineMedian, changeRate: judged.changeRate,
            }
            try {
                anomaly.contributors = await fetchPageContributors(propertyId, accessToken, seg.expression, dates.targetDate, dates.baselineDates, judged.direction)
            } catch { /* 内訳は取れなくても本体は通知する */ }
            anomalies.push(anomaly)
        }
    }

    if (config.checkCvChannels) {
        const reports = await Promise.all(CV_SEGMENTS.map((s) => fetchGA4Data({
            propertyId, dateRanges,
            dimensions: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }],
            metrics: [{ name: 'totalUsers' }],
            dimensionFilter: { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: s.prefix } } },
            limit: 2000,
        }, accessToken)))
        for (let i = 0; i < CV_SEGMENTS.length; i++) {
            const cv = CV_SEGMENTS[i]
            const byChannel = rowsToSeries((reports[i].rows ?? []) as GA4Row[], 1)
            // 日付はチャネル横断で解決（特定チャネルにデータが無い日もあるため）
            const allDates = [...new Set([...byChannel.values()].flatMap((s) => [...s.keys()]))]
            const dates = resolveDates(allDates)
            if (!dates) continue
            targetDate = dates.targetDate
            baselineDates = dates.baselineDates
            for (const [channel, series] of byChannel) {
                const { yesterday, baselineMedian } = evalSeries(series, dates.targetDate, dates.baselineDates)
                const judged = judge(yesterday, baselineMedian, config.minCv, config)
                if (!judged) continue
                anomalies.push({
                    family: 'cvChannel', segment: `${cv.label} × ${channel}`,
                    direction: judged.direction, yesterday, baselineMedian, changeRate: judged.changeRate,
                })
            }
        }
    }

    if (!targetDate) return null
    // 表示順: 急増→急落、それぞれ変動率の大きい順
    anomalies.sort((a, b) => (a.direction === b.direction)
        ? Math.abs(b.changeRate) - Math.abs(a.changeRate)
        : (a.direction === 'spike' ? -1 : 1))
    return { targetDate, baselineDates, anomalies }
}

function fmtRate(rate: number): string {
    if (!Number.isFinite(rate)) return 'ベースラインほぼ0からの出現'
    const pct = (rate * 100).toFixed(0)
    return rate >= 0 ? `+${pct}%` : `${pct}%`
}

/** Slack通知用のブロックを組み立てる（急増・急落をまとめて1メッセージ） */
export function buildSegmentAnomalyBlocks(
    productName: string,
    targetDate: string,
    baselineWeeks: number,
    anomalies: SegmentAnomaly[],
    config: SegmentAnomalyConfig
): SlackBlock[] {
    const date = `${targetDate.slice(0, 4)}-${targetDate.slice(4, 6)}-${targetDate.slice(6, 8)}`
    const spikes = anomalies.filter((a) => a.direction === 'spike')
    const drops = anomalies.filter((a) => a.direction === 'drop')
    const line = (a: SegmentAnomaly) =>
        `• *${a.segment}*: ${Math.round(a.yesterday).toLocaleString()}（同曜日中央値 ${Math.round(a.baselineMedian).toLocaleString()}、*${fmtRate(a.changeRate)}*）`

    const blocks: SlackBlock[] = [
        { type: 'header', text: { type: 'plain_text', text: `📊 セグメント変動アラート: ${productName}` } },
        {
            type: 'section', text: {
                type: 'mrkdwn',
                text: `対象日: *${date}*（前日） / ベースライン: 過去${baselineWeeks}週の同一曜日の中央値\nしきい値: 急増 +${Math.round(config.spikeThreshold * 100)}% / 急落 -${Math.round(config.dropThreshold * 100)}%`,
            },
        },
    ]
    if (spikes.length > 0) {
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `📈 *急増*\n${spikes.map(line).join('\n')}` } })
    }
    if (drops.length > 0) {
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `🔻 *急落*\n${drops.map(line).join('\n')}` } })
    }
    for (const a of anomalies) {
        if (!a.contributors || a.contributors.length === 0) continue
        const lines = a.contributors.map((c) =>
            `　• ${c.name}: ${Math.round(c.yesterday).toLocaleString()}（中央値 ${Math.round(c.baselineMedian).toLocaleString()}、${c.diff >= 0 ? '+' : ''}${Math.round(c.diff).toLocaleString()}）`
        ).join('\n')
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*${a.segment} の変動内訳（上位ページ）*\n${lines}`.slice(0, 2900) } })
    }
    blocks.push({ type: 'divider' })
    blocks.push({
        type: 'section', text: {
            type: 'mrkdwn',
            text: '急増はSEO順位変動・キャンペーン・bot流入・計測タグ変更、急落はタグ欠落・サイト障害・流入減の可能性。ダッシュボードの「求人種別CV分析」「トレンド」で要因を確認してください。',
        },
    })
    return blocks
}
