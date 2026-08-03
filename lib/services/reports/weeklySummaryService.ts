import { prisma } from '@/lib/db/client'
import { BatchGetCommand, ScanCommandInput } from '@aws-sdk/lib-dynamodb'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { DDB_TABLES, getDdbDocClient, scanAll } from '@/lib/aws/dynamoClient'
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

// ===== 応募の構造セクション（クロスワーク専用: DDB実数 + GA4ラベル） =====

const XWORK_PROPERTY_ID = '534098180'
const STRUCT_JOB_TYPES = [
    { key: 'JobR', label: '人材紹介', btn: '話を聞いてみる' },
    { key: 'JobA', label: '求人広告', btn: '応募する' },
    { key: 'JobH', label: 'ハローワーク', btn: '話を聞いてみる' },
] as const

export interface WeeklyStructure {
    apps: { total: number; prevTotal: number; featured: number; natural: number; ca: number; other: number }
    signup: { standalone: number; prevStandalone: number; simultaneous: number; formUsers: number; prevFormUsers: number }
    funnel: Array<{ label: string; detail: number; form: number; complete: number }>
    scout: { requested: number; sent: number; viewed: number }
}

function structLayer(source: string | undefined | null): 'featured' | 'natural' | 'ca' | 'other' {
    if (!source) return 'natural'
    if (source.startsWith('featured')) return 'featured'
    if (source === 'ca_referral') return 'ca'
    return 'other'
}

const jstDayStartIso = (date: string) => new Date(`${date}T00:00:00+09:00`).toISOString()
const jstNextDayIso = (date: string) => new Date(new Date(`${date}T00:00:00+09:00`).getTime() + 86400000).toISOString()

async function scanAppsInRange(start: string, end: string): Promise<{ layers: Record<string, number>; total: number; memberApps: Array<{ userId?: string; createdAt?: string }> }> {
    const since = jstDayStartIso(start)
    const until = jstNextDayIso(end)
    const base = {
        FilterExpression: 'createdAt >= :s AND createdAt < :u',
        ExpressionAttributeValues: { ':s': since, ':u': until },
        ExpressionAttributeNames: { '#src': 'source' },
    }
    const [members, guests] = await Promise.all([
        scanAll<{ userId?: string; createdAt?: string; source?: string }>({
            TableName: DDB_TABLES.jobApplications, ProjectionExpression: 'createdAt, userId, #src', ...base,
        } as ScanCommandInput),
        scanAll<{ source?: string }>({
            TableName: DDB_TABLES.guestJobApplications, ProjectionExpression: 'createdAt, #src', ...base,
        } as ScanCommandInput),
    ])
    const layers: Record<string, number> = { featured: 0, natural: 0, ca: 0, other: 0 }
    for (const a of [...members, ...guests]) layers[structLayer((a as { source?: string }).source)] += 1
    return { layers, total: members.length + guests.length, memberApps: members }
}

/** 応募の構造（先週実数・前週比）を集計する。クロスワーク専用（DDB直読み＋GA4ラベル） */
async function fetchWeeklyStructure(
    propertyId: string, accessToken: string,
    start: string, end: string, prevStart: string, prevEnd: string,
): Promise<WeeklyStructure> {
    const dateRanges = [{ startDate: start, endDate: end }]
    const client = getDdbDocClient()

    const [thisApps, prevApps] = await Promise.all([scanAppsInRange(start, end), scanAppsInRange(prevStart, prevEnd)])

    // 応募と同時の会員登録（応募時刻とユーザー作成時刻が10分以内・ユニークユーザー）
    const userIds = [...new Set(thisApps.memberApps.map((a) => a.userId).filter(Boolean))] as string[]
    const userCreated = new Map<string, string>()
    for (let i = 0; i < userIds.length; i += 100) {
        const keys = userIds.slice(i, i + 100).map((id) => ({ pk: `USER#${id}`, sk: `USER#${id}` }))
        const res = await client.send(new BatchGetCommand({
            RequestItems: { [DDB_TABLES.memberUsers]: { Keys: keys, ProjectionExpression: 'pk, createdAt' } },
        }))
        for (const item of res.Responses?.[DDB_TABLES.memberUsers] ?? []) {
            userCreated.set(String(item.pk).replace('USER#', ''), item.createdAt as string)
        }
    }
    const simulUsers = new Set<string>()
    for (const a of thisApps.memberApps) {
        if (!a.userId || !a.createdAt) continue
        const uc = userCreated.get(a.userId)
        if (uc && Math.abs(new Date(a.createdAt).getTime() - new Date(uc).getTime()) < 10 * 60 * 1000) simulUsers.add(a.userId)
    }

    // GA4: 単独登録（thanks到達）今週/前週、種別ファネル（詳細/フォームview・完了click）、スカウト閲覧
    const thanksFilter = { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: '/members/signup/thanks' } } }
    const signupFormFilter = { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'EXACT', value: '/members/signup' } } }
    const viewLabels = STRUCT_JOB_TYPES.flatMap((t) => [`DL__Media__Area__${t.key}`, `EF__${t.key}__Area__Header`])
    const [thanksNow, thanksPrev, formNow, formPrev, viewRep, clickRep, scoutView] = await Promise.all([
        fetchGA4Data({ propertyId, dateRanges, metrics: [{ name: 'totalUsers' }], dimensionFilter: thanksFilter, limit: 1 }, accessToken),
        fetchGA4Data({ propertyId, dateRanges: [{ startDate: prevStart, endDate: prevEnd }], metrics: [{ name: 'totalUsers' }], dimensionFilter: thanksFilter, limit: 1 }, accessToken),
        fetchGA4Data({ propertyId, dateRanges, metrics: [{ name: 'totalUsers' }], dimensionFilter: signupFormFilter, limit: 1 }, accessToken),
        fetchGA4Data({ propertyId, dateRanges: [{ startDate: prevStart, endDate: prevEnd }], metrics: [{ name: 'totalUsers' }], dimensionFilter: signupFormFilter, limit: 1 }, accessToken),
        fetchGA4Data({
            propertyId, dateRanges,
            dimensions: [{ name: 'customEvent:view_label' }], metrics: [{ name: 'totalUsers' }],
            dimensionFilter: { orGroup: { expressions: viewLabels.map((v) => ({ filter: { fieldName: 'customEvent:view_label', stringFilter: { matchType: 'EXACT', value: v } } })) } },
            limit: 50,
        }, accessToken),
        fetchGA4Data({
            propertyId, dateRanges,
            dimensions: [{ name: 'customEvent:click_label' }], metrics: [{ name: 'totalUsers' }],
            dimensionFilter: { orGroup: { expressions: STRUCT_JOB_TYPES.map((t) => ({ filter: { fieldName: 'customEvent:click_label', stringFilter: { matchType: 'EXACT', value: `EF__${t.key}__Btn__${t.btn}` } } })) } },
            limit: 50,
        }, accessToken),
        fetchGA4Data({
            propertyId, dateRanges, metrics: [{ name: 'totalUsers' }],
            dimensionFilter: { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: '/scout/' } } }, limit: 1,
        }, accessToken),
    ])
    const labelUsers = new Map<string, number>()
    for (const r of [...(viewRep.rows ?? []), ...(clickRep.rows ?? [])]) {
        labelUsers.set(r.dimensionValues[0]?.value ?? '', parseInt(r.metricValues[0]?.value ?? '0', 10))
    }
    const funnel = STRUCT_JOB_TYPES.map((t) => ({
        label: t.label,
        detail: labelUsers.get(`DL__Media__Area__${t.key}`) ?? 0,
        form: labelUsers.get(`EF__${t.key}__Area__Header`) ?? 0,
        complete: labelUsers.get(`EF__${t.key}__Btn__${t.btn}`) ?? 0,
    }))

    // スカウト送信/送達（先週分のattempt）
    const scoutItems = await scanAll<{ pk: string; attempts?: Array<{ status?: string; requestedAt?: string }> }>({
        TableName: DDB_TABLES.scoutHistories,
        FilterExpression: 'begins_with(pk, :c)',
        ExpressionAttributeValues: { ':c': 'CANDIDATE#' },
        ProjectionExpression: 'pk, attempts',
    } as ScanCommandInput)
    let requested = 0, sent = 0
    const since = jstDayStartIso(start), until = jstNextDayIso(end)
    for (const item of scoutItems) {
        for (const a of item.attempts ?? []) {
            if (!a.requestedAt || a.requestedAt < since || a.requestedAt >= until) continue
            requested += 1
            if (a.status === 'sent') sent += 1
        }
    }

    return {
        apps: {
            total: thisApps.total,
            prevTotal: prevApps.total,
            featured: thisApps.layers.featured,
            natural: thisApps.layers.natural,
            ca: thisApps.layers.ca,
            other: thisApps.layers.other,
        },
        signup: {
            standalone: parseInt(thanksNow.rows?.[0]?.metricValues[0]?.value ?? '0', 10),
            prevStandalone: parseInt(thanksPrev.rows?.[0]?.metricValues[0]?.value ?? '0', 10),
            simultaneous: simulUsers.size,
            formUsers: parseInt(formNow.rows?.[0]?.metricValues[0]?.value ?? '0', 10),
            prevFormUsers: parseInt(formPrev.rows?.[0]?.metricValues[0]?.value ?? '0', 10),
        },
        funnel,
        scout: { requested, sent, viewed: parseInt(scoutView.rows?.[0]?.metricValues[0]?.value ?? '0', 10) },
    }
}

function buildStructureBlocks(st: WeeklyStructure): SlackBlock[] {
    const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '－')
    const share = (a: number) => (st.apps.total > 0 ? ` (${((a / st.apps.total) * 100).toFixed(0)}%)` : '')
    const funnelLines = st.funnel.map((f) =>
        `• ${f.label}: 詳細 ${f.detail.toLocaleString()} → フォーム ${f.form.toLocaleString()} (${pct(f.form, f.detail)}) → 完了 ${f.complete.toLocaleString()}（詳細→完了 ${pct(f.complete, f.detail)}）`
    ).join('\n')
    return [
        { type: 'divider' },
        {
            type: 'section', text: { type: 'mrkdwn', text:
                `*応募の構造（DB実数・先週）*\n` +
                `• 総応募 *${st.apps.total.toLocaleString()}件* ${fmtWow(st.apps.total, st.apps.prevTotal)}\n` +
                `• featured（配信・おすすめ経由） ${st.apps.featured.toLocaleString()}${share(st.apps.featured)} ／ 自然応募 ${st.apps.natural.toLocaleString()}${share(st.apps.natural)} ／ CA紹介 ${st.apps.ca.toLocaleString()}${share(st.apps.ca)}` +
                (st.apps.other > 0 ? ` ／ その他 ${st.apps.other.toLocaleString()}` : '')
        } },
        {
            type: 'section', text: { type: 'mrkdwn', text:
                `*会員登録（先週）*\n` +
                `• 登録のみ ${st.signup.standalone.toLocaleString()} ${fmtWow(st.signup.standalone, st.signup.prevStandalone)} ＋ 応募と同時 ${st.signup.simultaneous.toLocaleString()} ＝ 計 ${(st.signup.standalone + st.signup.simultaneous).toLocaleString()}\n` +
                `• フォームCVR（到達→完了） *${pct(st.signup.standalone, st.signup.formUsers)}*（前週 ${pct(st.signup.prevStandalone, st.signup.prevFormUsers)}／到達 ${st.signup.formUsers.toLocaleString()}人）`
        } },
        { type: 'section', text: { type: 'mrkdwn', text: `*種別ファネル（GA4・先週）*\n${funnelLines}` } },
        {
            type: 'section', text: { type: 'mrkdwn', text:
                `*スカウト（先週）*: 送信リクエスト ${st.scout.requested.toLocaleString()} ／ 送達 ${st.scout.sent.toLocaleString()} ／ ページ閲覧 ${st.scout.viewed.toLocaleString()} UU`
        } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: '最新の詳細: ダッシュボード /cv-types（種別・経路別ファネル / 応募の全体像）・/scout' }] },
    ]
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
    structure?: WeeklyStructure | null
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
    if (result.structure) {
        blocks.push(...buildStructureBlocks(result.structure))
    }
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

            // 応募の構造（クロスワークのみ: 本体DDB + GA4ラベル。失敗してもサマリー本体は送る）
            let structure: WeeklyStructure | null = null
            if (propertyId === XWORK_PROPERTY_ID) {
                try {
                    structure = await fetchWeeklyStructure(propertyId, accessToken, start, end, prevStart, prevEnd)
                } catch (err) {
                    console.error(`[weeklySummary] product ${product.id} 応募構造の集計失敗:`, err instanceof Error ? err.message : err)
                }
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
                structure,
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
