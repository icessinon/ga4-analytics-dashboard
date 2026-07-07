import { prisma } from '@/lib/db/client'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { sendSlackNotification, type SlackBlock } from '@/lib/services/notification/slackService'
import { CV_PAGE_PREFIXES, type CvKey } from '@/lib/services/alerts/cvDropAlertService'
import {
    generateWeeklySummary,
    type WeeklyKpi,
    type WeeklyChannelMove,
    type WeeklyAbTestProgress,
} from '@/lib/api/gemini/weeklySummary'

interface WeekKpis {
    sessions: number
    newUsers: number
    cv: Record<CvKey, number>
    channels: Map<string, number>
}

export interface WeeklySummaryResult {
    productId: number
    productName: string
    weekStart: string
    weekEnd: string
    kpis: WeeklyKpi[]
    channelMoves: WeeklyChannelMove[]
    runningAbTests: WeeklyAbTestProgress[]
    aiSummary: string | null
}

/** JST基準で「先週（月〜日）」と「先々週」の日付範囲を返す */
export function lastWeekRanges(): { start: string; end: string; prevStart: string; prevEnd: string } {
    const nowJst = new Date(Date.now() + 9 * 3600 * 1000)
    const daysSinceMonday = (nowJst.getUTCDay() + 6) % 7
    const thisMonday = Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate() - daysSinceMonday)
    const day = 24 * 3600 * 1000
    const toStr = (t: number) => new Date(t).toISOString().slice(0, 10)
    return {
        start: toStr(thisMonday - 7 * day),
        end: toStr(thisMonday - 1 * day),
        prevStart: toStr(thisMonday - 14 * day),
        prevEnd: toStr(thisMonday - 8 * day),
    }
}

async function fetchWeekKpis(propertyId: string, accessToken: string, startDate: string, endDate: string): Promise<WeekKpis> {
    const dateRanges = [{ startDate, endDate }]
    const [totalsReport, cvReport, channelReport] = await Promise.all([
        fetchGA4Data({
            propertyId, dateRanges,
            metrics: [{ name: 'sessions' }, { name: 'newUsers' }],
            limit: 10,
        }, accessToken),
        fetchGA4Data(Object.assign({
            propertyId, dateRanges,
            dimensions: [{ name: 'pagePath' }],
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
        fetchGA4Data({
            propertyId, dateRanges,
            dimensions: [{ name: 'sessionDefaultChannelGroup' }],
            metrics: [{ name: 'sessions' }],
            limit: 50,
        }, accessToken),
    ])

    const totalsRow = totalsReport.rows?.[0]
    const cv: Record<CvKey, number> = { applyCv: 0, lpApplyCv: 0, signupCv: 0 }
    for (const r of cvReport.rows ?? []) {
        const path = r.dimensionValues[0]?.value ?? ''
        for (const [key, prefix] of Object.entries(CV_PAGE_PREFIXES) as Array<[CvKey, string]>) {
            if (path.startsWith(prefix)) {
                cv[key] += parseInt(r.metricValues[0]?.value ?? '0', 10)
                break
            }
        }
    }
    const channels = new Map<string, number>()
    for (const r of channelReport.rows ?? []) {
        const channel = r.dimensionValues[0]?.value || '(not set)'
        channels.set(channel, parseInt(r.metricValues[0]?.value ?? '0', 10))
    }
    return {
        sessions: parseInt(totalsRow?.metricValues[0]?.value ?? '0', 10),
        newUsers: parseInt(totalsRow?.metricValues[1]?.value ?? '0', 10),
        cv,
        channels,
    }
}

type CvrResult = { pv: number; cv: number; cvr: number }
type ResultData = {
    cvrResults?: { dataA?: CvrResult; dataB?: CvrResult; dataC?: CvrResult; dataD?: CvrResult }
    abTestEvaluation?: { checks?: { significance?: { value?: number } } } | null
}

async function fetchRunningAbTests(productId: number): Promise<WeeklyAbTestProgress[]> {
    const abTests = await prisma.abTest.findMany({
        where: { productId, status: 'running' },
        orderBy: { updatedAt: 'desc' },
        take: 10,
    })
    const progress: WeeklyAbTestProgress[] = []
    for (const abTest of abTests) {
        const lastExec = await prisma.abTestReportExecution.findFirst({
            where: { abTestId: abTest.id, status: 'completed' },
            orderBy: { completedAt: 'desc' },
            select: { resultData: true },
        })
        const resultData = (lastExec?.resultData ?? null) as ResultData | null
        const cvrResults = resultData?.cvrResults
        const variantLabels: Record<string, string> = {
            A: abTest.variantAName, B: abTest.variantBName, C: 'バリアントC', D: 'バリアントD',
        }
        const variants: WeeklyAbTestProgress['variants'] = []
        if (cvrResults) {
            for (const name of ['A', 'B', 'C', 'D'] as const) {
                const data = cvrResults[`data${name}`]
                if (data) variants.push({ label: variantLabels[name], pv: data.pv ?? 0, cv: data.cv ?? 0, cvr: data.cvr ?? 0 })
            }
        }
        progress.push({
            name: abTest.name,
            hypothesis: abTest.hypothesis,
            variants,
            significance: resultData?.abTestEvaluation?.checks?.significance?.value ?? null,
            endDate: abTest.endDate ? abTest.endDate.toISOString().slice(0, 10) : null,
        })
    }
    return progress
}

function buildKpis(thisWeek: WeekKpis, prevWeek: WeekKpis): WeeklyKpi[] {
    const totalCv = (w: WeekKpis) => w.cv.applyCv + w.cv.lpApplyCv + w.cv.signupCv
    const cvr = (w: WeekKpis) => (w.sessions > 0 ? totalCv(w) / w.sessions : 0)
    return [
        { label: 'セッション数', thisWeek: thisWeek.sessions, prevWeek: prevWeek.sessions },
        { label: '新規ユーザー数', thisWeek: thisWeek.newUsers, prevWeek: prevWeek.newUsers },
        { label: '応募CV', thisWeek: thisWeek.cv.applyCv, prevWeek: prevWeek.cv.applyCv },
        { label: 'LP応募CV', thisWeek: thisWeek.cv.lpApplyCv, prevWeek: prevWeek.cv.lpApplyCv },
        { label: '会員登録CV', thisWeek: thisWeek.cv.signupCv, prevWeek: prevWeek.cv.signupCv },
        { label: '全体CVR（CV合計÷セッション）', thisWeek: cvr(thisWeek), prevWeek: cvr(prevWeek), isRate: true },
    ]
}

function buildChannelMoves(thisWeek: WeekKpis, prevWeek: WeekKpis): WeeklyChannelMove[] {
    const allChannels = new Set([...thisWeek.channels.keys(), ...prevWeek.channels.keys()])
    const moves: WeeklyChannelMove[] = []
    for (const channel of allChannels) {
        moves.push({
            channel,
            thisWeek: thisWeek.channels.get(channel) ?? 0,
            prevWeek: prevWeek.channels.get(channel) ?? 0,
        })
    }
    // 変動絶対値の大きい順に上位を返す
    return moves.sort((a, b) => Math.abs(b.thisWeek - b.prevWeek) - Math.abs(a.thisWeek - a.prevWeek)).slice(0, 6)
}

function fmtWow(thisWeek: number, prevWeek: number): string {
    if (prevWeek === 0) return ''
    const pct = ((thisWeek - prevWeek) / prevWeek) * 100
    const arrow = pct >= 0 ? '↑' : '↓'
    return `（前週比 ${arrow}${Math.abs(pct).toFixed(1)}%）`
}

function buildSlackBlocks(result: WeeklySummaryResult): SlackBlock[] {
    const kpiLines = result.kpis.map((k) => {
        const value = k.isRate ? `${(k.thisWeek * 100).toFixed(2)}%` : Math.round(k.thisWeek).toLocaleString()
        const prev = k.isRate ? `${(k.prevWeek * 100).toFixed(2)}%` : Math.round(k.prevWeek).toLocaleString()
        return `• *${k.label}*: ${value}（前週 ${prev}）${fmtWow(k.thisWeek, k.prevWeek)}`
    }).join('\n')

    const blocks: SlackBlock[] = [
        { type: 'header', text: { type: 'plain_text', text: `📊 週次サマリー: ${result.productName}（${result.weekStart} 〜 ${result.weekEnd}）` } },
        { type: 'section', text: { type: 'mrkdwn', text: kpiLines } },
    ]
    if (result.runningAbTests.length > 0) {
        const abLines = result.runningAbTests.map((t) => {
            const variantText = t.variants.map((v) => `${v.label} ${(v.cvr * 100).toFixed(2)}%`).join(' vs ')
            const sig = t.significance != null ? `有意差 ${t.significance.toFixed(1)}%` : '有意差 未算出'
            return `• *${t.name}*${t.endDate ? `（〜${t.endDate}）` : ''}: ${variantText || '結果未取得'} ／ ${sig}`
        }).join('\n')
        blocks.push({ type: 'divider' })
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*実行中のABテスト*\n${abLines}` } })
    }
    if (result.aiSummary) {
        blocks.push({ type: 'divider' })
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `🤖 *AIサマリー*\n${result.aiSummary}` } })
    }
    return blocks
}

/**
 * 全プロダクトの先週KPI（前週比）・チャネル変動・実行中ABテスト途中経過を集計し、
 * AIサマリーを添えて Slack に配信する。毎週月曜 09:00 JST にスケジューラから実行される。
 */
export async function sendWeeklySummary(): Promise<WeeklySummaryResult[]> {
    const products = await prisma.product.findMany({
        where: { ga4PropertyId: { not: null } },
    })
    if (products.length === 0) return []

    const accessToken = await getGA4AccessToken()
    const webhookUrl = process.env.SLACK_WEBHOOK_URL
    const { start, end, prevStart, prevEnd } = lastWeekRanges()
    const results: WeeklySummaryResult[] = []

    for (const product of products) {
        try {
            const propertyId = product.ga4PropertyId as string
            const [thisWeek, prevWeek, runningAbTests] = await Promise.all([
                fetchWeekKpis(propertyId, accessToken, start, end),
                fetchWeekKpis(propertyId, accessToken, prevStart, prevEnd),
                fetchRunningAbTests(product.id),
            ])
            const kpis = buildKpis(thisWeek, prevWeek)
            const channelMoves = buildChannelMoves(thisWeek, prevWeek)

            let aiSummary: string | null = null
            try {
                aiSummary = await generateWeeklySummary({
                    productName: product.name,
                    weekStart: start,
                    weekEnd: end,
                    kpis,
                    channelMoves,
                    runningAbTests,
                }, product.id)
            } catch (err) {
                console.error(`[weeklySummary] product ${product.id} AIサマリー生成失敗:`, err instanceof Error ? err.message : err)
            }

            const result: WeeklySummaryResult = {
                productId: product.id,
                productName: product.name,
                weekStart: start,
                weekEnd: end,
                kpis,
                channelMoves,
                runningAbTests,
                aiSummary,
            }
            results.push(result)
            if (webhookUrl) {
                await sendSlackNotification([webhookUrl], buildSlackBlocks(result))
            }
        } catch (err) {
            console.error(`[weeklySummary] product ${product.id} 集計失敗:`, err instanceof Error ? err.message : err)
        }
    }
    return results
}
