import { and, exact, partialRegexp, stringFilter, type Ga4FilterExpression } from '@/lib/api/ga4/filters'
import type { GA4ReportResponse } from '@/lib/api/ga4/client'
import type { Ga4Reporter } from '@/lib/api/ga4/report'
import { dim, firstMetricInt, metricFloat, metricInt, rowsOf } from '@/lib/api/ga4/rows'
import { CHANNEL_LABELS } from '@/lib/constants/channelLabels'
import { INDUSTRY_ALT, categorizePath, categorizeReferrer, normalizePath } from './pathCategories'
import type { JourneyReport, PageSignal } from './journeyTypes'

export interface JourneyOptions {
    goalPath: string
    goalLabel: string
    /** 内部ドメイン（リファラーのサイト内判定） */
    domain: string
    deviceFilter?: string
}

const EMPTY: GA4ReportResponse = { dimensionHeaders: [], metricHeaders: [], rows: [], rowCount: 0 }

function withDevice(f: Ga4FilterExpression, dev: Ga4FilterExpression | null): Ga4FilterExpression {
    return dev ? and(f, dev) : f
}

/**
 * ゴール（会員登録フォーム等）に到達したページビューを、流入チャネル → 直前ページ（N-1）→ ゴール と
 * N-2 → N-1 の 2 ホップで再構成する。あわせてページカテゴリ別の離脱傾向・行動シグナルを出す。
 */
export async function runJourneyReport(reporter: Ga4Reporter, opts: JourneyOptions): Promise<JourneyReport> {
    const { goalPath, goalLabel, domain } = opts
    const devFilter = opts.deviceFilter ? exact('deviceCategory', opts.deviceFilter) : null
    const goalFilter = stringFilter('pagePath', 'BEGINS_WITH', goalPath, false)
    // Q2 filter: industry pages (求人詳細・絞り込み・大職種一覧) — likely N-1 pages before 応募フォーム
    const industryPathFilter = partialRegexp('pagePath', `^/(${INDUSTRY_ALT})/`)

    const [crossReport, pathReport, totalReport, goalUserReport] = await reporter.runAll([
        // Q1: channel × N-1 (direct referrer to goal)
        { dimensions: ['sessionDefaultChannelGroup', 'pageReferrer'], metrics: ['screenPageViews'], dimensionFilter: withDevice(goalFilter, devFilter), limit: 5000 },
        // Q2: channel × N-1 (industry page) × N-2 — reconstruct 2-hop path
        { dimensions: ['sessionDefaultChannelGroup', 'pagePath', 'pageReferrer'], metrics: ['screenPageViews'], dimensionFilter: withDevice(industryPathFilter, devFilter), limit: 5000 },
        // Q3: total sessions + users
        { metrics: ['sessions', 'activeUsers'], dimensionFilter: devFilter ?? undefined, limit: 1 },
        // Q4_goal: ゴール到達ユーザー数
        { metrics: ['activeUsers'], dimensionFilter: withDevice(goalFilter, devFilter), limit: 1 },
    ])

    // Q4: ページ別バウンス率＋行動シグナル（失敗しても他データに影響しないよう独立）
    let exitQ4Error = ''
    const exitReport = await reporter.run({
        dimensions: ['pagePath'],
        metrics: ['screenPageViews', 'bounceRate', 'activeUsers', 'scrolledUsers', 'userEngagementDuration'],
        dimensionFilter: devFilter ?? undefined,
        limit: 5000,
    }).catch((e: Error) => {
        exitQ4Error = e.message
        return EMPTY
    })

    // ── Q1 処理: channel → N-1 → goal ──
    const flowMap = new Map<string, number>()
    const channelTotals = new Map<string, number>()
    const referrerTotals = new Map<string, number>()
    const rawN1Map = new Map<string, number>()  // channel|||rawUrl → views
    let totalGoalViews = 0
    const internalBase = (domain ?? '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]

    for (const row of rowsOf(crossReport)) {
        const channelRaw = dim(row, 0)
        const referrerRaw = dim(row, 1)
        const views = metricInt(row)

        const channel = CHANNEL_LABELS[channelRaw] ?? (channelRaw || 'その他流入')
        const referrer = categorizeReferrer(referrerRaw, domain ?? '')

        const key = `${channel}|||${referrer}`
        flowMap.set(key, (flowMap.get(key) || 0) + views)
        channelTotals.set(channel, (channelTotals.get(channel) || 0) + views)
        referrerTotals.set(referrer, (referrerTotals.get(referrer) || 0) + views)
        totalGoalViews += views

        // Raw URL 収集（パス構造で内部ページか判定）
        if (referrerRaw && referrerRaw !== '(not set)') {
            try {
                const u = new URL(referrerRaw)
                const rawPath = normalizePath(u.pathname.split('?')[0] || '/')
                if (rawPath && categorizePath(rawPath) !== 'その他') {
                    const rk = `${channel}|||${rawPath}`
                    rawN1Map.set(rk, (rawN1Map.get(rk) || 0) + views)
                }
            } catch { /* 無効URL */ }
        }
    }

    const totalRow = rowsOf(totalReport)[0]
    const totalSessions = totalRow ? metricInt(totalRow, 0) : 0
    const totalUsers = totalRow ? metricInt(totalRow, 1) : 0
    const goalUsers = firstMetricInt(goalUserReport)

    // フォーム別到達ユーザー数（会員登録・応募・LP を並列取得）
    const FORM_PRESETS = [
        { name: '会員登録フォーム', path: '/members/signup' },
        { name: '応募フォーム', path: '/entry/media_' },
        { name: 'featuredページ', path: '/featured' },
    ]
    const formGoalReports = await Promise.all(
        FORM_PRESETS.map((preset) =>
            reporter.run({
                metrics: ['activeUsers'],
                dimensionFilter: withDevice(stringFilter('pagePath', 'BEGINS_WITH', preset.path), devFilter),
                limit: 1,
            }).catch(() => EMPTY)
        )
    )
    const formStats = FORM_PRESETS.map((preset, i) => {
        const gu = firstMetricInt(formGoalReports[i])
        return {
            name: preset.name,
            goalUsers: gu,
            dropoutUsers: Math.max(0, totalUsers - gu),
            arrivalRate: totalUsers > 0 ? gu / totalUsers : 0,
            dropoutRate: totalUsers > 0 ? (totalUsers - gu) / totalUsers : 0,
        }
    })

    // ── Q2 処理: N-2 → N-1 経路パターン ──
    const pathFlowMap = new Map<string, number>()
    const rawPathFlowMap = new Map<string, number>()
    const dropoutTripletMap = new Map<string, number>() // `${channel}|||${n2}|||${n1}` → views（離脱計算用）

    for (const row of rowsOf(pathReport)) {
        const channelRaw = dim(row, 0)
        const pathRaw = dim(row, 1)
        const referrerRaw = dim(row, 2)
        const views = metricInt(row)

        const channel = CHANNEL_LABELS[channelRaw] ?? (channelRaw || 'その他流入')

        // Raw URL tracking — continueより前に処理（内部ドメインのみ）
        const n1Raw = normalizePath((pathRaw || '').split('?')[0] || '/')
        let n2Raw = ''
        try {
            const refUrl = new URL(referrerRaw)
            const candidate = normalizePath(refUrl.pathname.split('?')[0] || '/')
            if (candidate && categorizePath(candidate) !== 'その他') {
                n2Raw = candidate
            }
        } catch { /* external referrer — skip */ }
        if (n2Raw && n1Raw !== n2Raw) {
            const rawKey = `${channel}|||${n2Raw}|||${n1Raw}`
            rawPathFlowMap.set(rawKey, (rawPathFlowMap.get(rawKey) || 0) + views)
        }

        // カテゴリ
        const n1 = categorizePath(pathRaw)
        const n2 = categorizeReferrer(referrerRaw, domain)

        // 3ステップ離脱マップ（continue前に集計）
        if (n1 !== 'その他' && n2 !== '直接アクセス') {
            const dk = `${channel}|||${n2}|||${n1}`
            dropoutTripletMap.set(dk, (dropoutTripletMap.get(dk) || 0) + views)
        }

        if (n1 === n2 || n2 === '直接アクセス' || n1 === 'その他' || n2 === 'その他') continue

        const key = `${channel}|||${n2}|||${n1}`
        pathFlowMap.set(key, (pathFlowMap.get(key) || 0) + views)
    }

    const toTriplets = (m: Map<string, number>, limit: number) =>
        [...m.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([key, count]) => {
                const [channel, n2, n1] = key.split('|||')
                return { channel, n2, n1, count }
            })

    // Q2由来の3ステップパス (N-2→N-1→goal) / URL版
    const q2Paths = toTriplets(pathFlowMap, 30)
    const q2RawPaths = toTriplets(rawPathFlowMap, 50)

    // Q1由来の2ステップパス (channel→N-1→goal) — Q2が空の場合のフォールバック
    const toPairs = (m: Map<string, number>, limit: number) =>
        [...m.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([key, count]) => {
                const [channel, n1] = key.split('|||')
                return { channel, n2: channel, n1, count }
            })
    const q1Paths = toPairs(flowMap, 30).filter((p) => p.n1 !== '直接アクセス' && p.n1 !== p.channel)
    const q1RawPaths = toPairs(rawN1Map, 50)

    const topPaths = q2Paths.length > 0 ? q2Paths : q1Paths
    const rawTopPaths = q2RawPaths.length > 0 ? q2RawPaths : q1RawPaths

    // 離脱経路パターン（カテゴリ3ステップ）: N-2 → N-1 → 離脱
    const dropoutPaths = [...dropoutTripletMap.entries()]
        .map(([key, total]) => {
            const [channel, n2, n1] = key.split('|||')
            const goalViews = pathFlowMap.get(key) || 0
            return { channel, n2, n1, dropout: Math.max(0, total - goalViews) }
        })
        .filter((d) => d.dropout > 0)
        .sort((a, b) => b.dropout - a.dropout)
        .slice(0, 30)

    // 離脱経路パターン（URL3ステップ）
    const rawDropoutPaths = toTriplets(rawPathFlowMap, 50).map(({ channel, n2, n1, count }) => ({ channel, n2, n1, dropout: count }))

    // ── Sankey ノード・フロー構築 ──
    const nodes = [
        ...[...channelTotals.entries()].map(([id, sessions]) => ({ id, stage: 0, sessions })),
        ...[...referrerTotals.entries()].map(([id, sessions]) => ({ id, stage: 1, sessions })),
        { id: goalLabel, stage: 2, sessions: totalGoalViews },
    ]

    const flows = [
        ...[...flowMap.entries()].map(([key, sessions]) => {
            const [from, to] = key.split('|||')
            return { from, to, sessions }
        }),
        ...[...referrerTotals.entries()].map(([from, sessions]) => ({ from, to: goalLabel, sessions })),
    ].filter((f) => f.sessions >= 2)

    const referrerRanking = [...referrerTotals.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([page, views]) => ({ page, views, rate: totalGoalViews > 0 ? views / totalGoalViews : 0 }))

    const channelRanking = [...channelTotals.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([channel, views]) => ({ channel, views, rate: totalGoalViews > 0 ? views / totalGoalViews : 0 }))

    // ── Q4 処理: ページカテゴリ別離脱傾向（bounceRate）＋行動シグナル ──
    interface SignalAgg { pvTotal: number; bounceWeightedSum: number; users: number; scrolled: number; engagementSec: number }
    const emptyAgg = (): SignalAgg => ({ pvTotal: 0, bounceWeightedSum: 0, users: 0, scrolled: 0, engagementSec: 0 })
    const addRow = (map: Map<string, SignalAgg>, key: string, pv: number, bounceRate: number, users: number, scrolled: number, engSec: number) => {
        const a = map.get(key) ?? emptyAgg()
        a.pvTotal += pv
        a.bounceWeightedSum += bounceRate * pv
        a.users += users
        a.scrolled += scrolled
        a.engagementSec += engSec
        map.set(key, a)
    }

    const exitMap = new Map<string, SignalAgg>()
    const rawSignalMap = new Map<string, SignalAgg>()
    for (const row of rowsOf(exitReport)) {
        const path = dim(row)
        const pv = metricInt(row, 0)
        const bounceRate = metricFloat(row, 1)
        const users = metricInt(row, 2)
        const scrolled = metricInt(row, 3)
        const engSec = metricFloat(row, 4)
        const cat = categorizePath(path)
        if (cat === 'その他' || pv === 0) continue
        addRow(exitMap, cat, pv, bounceRate, users, scrolled, engSec)
        addRow(rawSignalMap, normalizePath((path || '').split('?')[0] || '/'), pv, bounceRate, users, scrolled, engSec)
    }

    const toSignal = (a: SignalAgg): PageSignal => ({
        avgEngagementSec: a.users > 0 ? a.engagementSec / a.users : 0,
        scrollRate: a.users > 0 ? Math.min(1, a.scrolled / a.users) : 0,
        engagementRate: a.pvTotal > 0 ? Math.max(0, 1 - a.bounceWeightedSum / a.pvTotal) : 0,
    })

    const pageExitRates: Record<string, number> = {}
    const pageSignals: Record<string, PageSignal> = {}
    for (const [cat, d] of exitMap.entries()) {
        pageExitRates[cat] = d.pvTotal > 0 ? d.bounceWeightedSum / d.pvTotal : 0
        pageSignals[cat] = toSignal(d)
    }

    // URL表示モードで使う正規化パス別シグナル（離脱・遷移パターンに登場するパスのみ返す）
    const rawPathsUsed = new Set<string>()
    for (const p of rawDropoutPaths) { rawPathsUsed.add(p.n1); rawPathsUsed.add(p.n2) }
    for (const p of rawTopPaths) { rawPathsUsed.add(p.n1); rawPathsUsed.add(p.n2) }
    const rawPageSignals: Record<string, PageSignal> = {}
    for (const [path, d] of rawSignalMap.entries()) {
        if (rawPathsUsed.has(path)) rawPageSignals[path] = toSignal(d)
    }

    return {
        nodes,
        flows,
        totalSessions,
        totalUsers,
        goalUsers,
        formStats,
        totalGoalViews,
        goalPath,
        goalLabel,
        referrerRanking,
        channelRanking,
        topPaths,
        rawTopPaths,
        dropoutPaths,
        rawDropoutPaths,
        pageExitRates,
        pageSignals,
        rawPageSignals,
        _debug: {
            exitQ4Rows: rowsOf(exitReport).length,
            exitQ4Error,
            q2RawCount: q2RawPaths.length,
            q1RawCount: q1RawPaths.length,
            rawN1MapSize: rawN1Map.size,
            q2CatCount: q2Paths.length,
            q1CatCount: q1Paths.length,
            crossRows: rowsOf(crossReport).length,
            internalBase,
            sampleReferrer: rowsOf(crossReport)[0] ? dim(rowsOf(crossReport)[0], 1) : '',
        },
    }
}
