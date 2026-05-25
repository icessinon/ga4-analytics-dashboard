import { NextResponse } from 'next/server'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'

const CHANNEL_LABELS: Record<string, string> = {
    'Organic Search': 'オーガニック検索',
    'Paid Search': '有料検索（広告）',
    'Direct': '直接流入',
    'Organic Social': 'SNS（自然）',
    'Paid Social': 'SNS（広告）',
    'Referral': '外部サイト経由',
    'Email': 'メール',
    'Display': 'ディスプレイ広告',
    'Organic Video': '動画（自然）',
    'Paid Video': '動画（広告）',
    '(Other)': 'その他流入',
    'Unassigned': '未分類',
}

const INDUSTRY_SLUGS = new Set([
    'driver', 'sekokan', 'sekkei', 'soko', 'shokunin', 'seibi', 'hoshu',
    'setsubi-sagyo', 'keibi', 'unkan', 'kojo-sagyo', 'food', 'unyu-sagyo', 'others',
])

function categorizePath(path: string): string {
    const p = (path || '').split('?')[0].split('#')[0]
    if (!p || p === '/') return 'TOP'
    if (/^\/members\/signup/.test(p)) return '会員登録フォーム'
    if (/^\/members\/(?:login|signin)/.test(p)) return 'ログイン'
    if (/^\/members\/mypage/.test(p)) return 'マイページ'
    if (/^\/members\/scout/.test(p)) return 'スカウト'
    if (/^\/members/.test(p)) return '会員系その他'
    if (/^\/featured/.test(p)) return 'featured'
    if (/^\/logi/.test(p)) return '人材紹介LP'
    if (/^\/lp[_/]/.test(p) || p === '/lp') return 'LP'
    if (/^\/journal/.test(p)) return 'コラム'
    if (/^\/cond/.test(p)) return '資格条件'
    if (/^\/search/.test(p)) return '検索結果'
    if (/^\/entry\/media_\d+/.test(p)) return '応募フォーム'

    const parts = p.split('/').filter(Boolean)
    if (parts.length >= 2 && INDUSTRY_SLUGS.has(parts[0]) && /^media_\d+$/.test(parts[1])) return '求人詳細'
    if (parts.length >= 2 && INDUSTRY_SLUGS.has(parts[0])) return '絞り込み検索'
    if (parts.length === 1 && INDUSTRY_SLUGS.has(parts[0])) return '大職種一覧'

    return 'その他'
}

function categorizeReferrer(referrer: string, internalDomain: string): string {
    if (!referrer || referrer === '(not set)') return '直接アクセス'
    try {
        const url = new URL(referrer)
        const host = url.hostname.toLowerCase().replace(/^www\./, '')
        const internal = internalDomain.toLowerCase().replace(/^www\./, '')
        if (host === internal || host.endsWith('.' + internal)) {
            const cat = categorizePath(url.pathname)
            if (cat === '会員登録フォーム' || cat === '応募フォーム') return '直接アクセス'
            return cat
        }
        // ドメイン不一致でも業種固有パスなら内部ページ扱い（TOP除外：外部サイトの/ を誤認しないため）
        const pathCat = categorizePath(url.pathname)
        if (pathCat !== 'その他' && pathCat !== 'TOP') {
            if (pathCat === '会員登録フォーム' || pathCat === '応募フォーム') return '直接アクセス'
            return pathCat
        }
        return host || '外部サイト'
    } catch {
        return '直接アクセス'
    }
}

function normalizePath(p: string): string {
    return p
        .replace(/\/media_\d+/g, '/media_{id}')
        .replace(/\/license\d+/g, '/license{id}')
}

function makeDeviceFilter(device: string) {
    return {
        filter: {
            fieldName: 'deviceCategory',
            stringFilter: { matchType: 'EXACT', value: device },
        },
    }
}

function andFilter(f1: Record<string, unknown>, f2?: Record<string, unknown> | null): Record<string, unknown> {
    if (!f2) return f1
    return { andGroup: { expressions: [f1, f2] } }
}

export async function POST(request: Request) {
    try {
        const {
            propertyId,
            goalPath = '/members/signup',
            goalLabel = '会員登録フォーム',
            startDate = '30daysAgo',
            endDate = 'today',
            domain = 'x-work.jp',
            deviceFilter,
            accessToken: customToken,
        } = await request.json()

        if (!propertyId) {
            return NextResponse.json({ error: 'propertyId is required' }, { status: 400 })
        }

        const accessToken = await getGA4AccessToken(customToken)
        const dateRanges = [{ startDate, endDate }]
        const devFilter = deviceFilter ? makeDeviceFilter(deviceFilter) : null

        const goalFilter = {
            filter: {
                fieldName: 'pagePath',
                stringFilter: { matchType: 'BEGINS_WITH', value: goalPath, caseSensitive: false },
            },
        }

        // Q2 filter: industry pages (求人詳細・絞り込み・大職種一覧) — likely N-1 pages before 応募フォーム
        const industryRegexp = `^/(${[...INDUSTRY_SLUGS].join('|')})/`
        const industryPathFilter = {
            filter: {
                fieldName: 'pagePath',
                stringFilter: { matchType: 'PARTIAL_REGEXP', value: industryRegexp },
            },
        }

        const [crossReport, pathReport, totalReport, goalUserReport] = await Promise.all([
            // Q1: channel × N-1 (direct referrer to goal)
            fetchGA4Data({
                propertyId,
                dateRanges,
                dimensions: [{ name: 'sessionDefaultChannelGroup' }, { name: 'pageReferrer' }],
                metrics: [{ name: 'screenPageViews' }],
                dimensionFilter: andFilter(goalFilter, devFilter),
                limit: 5000,
            }, accessToken),
            // Q2: channel × N-1 (industry page) × N-2 — reconstruct 2-hop path
            fetchGA4Data({
                propertyId,
                dateRanges,
                dimensions: [
                    { name: 'sessionDefaultChannelGroup' },
                    { name: 'pagePath' },
                    { name: 'pageReferrer' },
                ],
                metrics: [{ name: 'screenPageViews' }],
                dimensionFilter: andFilter(industryPathFilter, devFilter),
                limit: 5000,
            }, accessToken),
            // Q3: total sessions + users
            fetchGA4Data({
                propertyId,
                dateRanges,
                dimensions: [],
                metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
                ...(devFilter && { dimensionFilter: devFilter }),
                limit: 1,
            }, accessToken),
            // Q4_goal: ゴール到達ユーザー数
            fetchGA4Data({
                propertyId,
                dateRanges,
                dimensions: [],
                metrics: [{ name: 'activeUsers' }],
                dimensionFilter: andFilter(goalFilter, devFilter),
                limit: 1,
            }, accessToken),
        ])

        // Q4: ページ別バウンス率（失敗しても他データに影響しないよう独立）
        let exitQ4Error = ''
        const exitReport = await fetchGA4Data({
            propertyId,
            dateRanges,
            dimensions: [{ name: 'pagePath' }],
            metrics: [{ name: 'screenPageViews' }, { name: 'bounceRate' }],
            ...(devFilter && { dimensionFilter: devFilter }),
            limit: 5000,
        }, accessToken).catch((e: Error) => {
            exitQ4Error = e.message
            return { rows: [], dimensionHeaders: [], metricHeaders: [], rowCount: 0 }
        })

        // ── Q1 処理: channel → N-1 → goal ──
        const flowMap = new Map<string, number>()
        const channelTotals = new Map<string, number>()
        const referrerTotals = new Map<string, number>()
        const rawN1Map = new Map<string, number>()  // channel|||rawUrl → views
        let totalGoalViews = 0
        const internalBase = (domain ?? '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]

        for (const row of crossReport.rows ?? []) {
            const channelRaw = row.dimensionValues[0]?.value ?? ''
            const referrerRaw = row.dimensionValues[1]?.value ?? ''
            const views = parseInt(row.metricValues[0]?.value ?? '0') || 0

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

        const totalSessions = parseInt(totalReport.rows?.[0]?.metricValues?.[0]?.value ?? '0') || 0
        const totalUsers = parseInt(totalReport.rows?.[0]?.metricValues?.[1]?.value ?? '0') || 0
        const goalUsers = parseInt(goalUserReport.rows?.[0]?.metricValues?.[0]?.value ?? '0') || 0

        // フォーム別到達ユーザー数（会員登録・応募・LP を並列取得）
        const FORM_PRESETS = [
            { name: '会員登録フォーム', path: '/members/signup', matchType: 'BEGINS_WITH' },
            { name: '応募フォーム', path: '/entry/media_', matchType: 'BEGINS_WITH' },
            { name: 'featuredページ', path: '/featured', matchType: 'BEGINS_WITH' },
        ]
        const formGoalReports = await Promise.all(
            FORM_PRESETS.map(preset =>
                fetchGA4Data({
                    propertyId,
                    dateRanges,
                    dimensions: [],
                    metrics: [{ name: 'activeUsers' }],
                    dimensionFilter: andFilter(
                        { filter: { fieldName: 'pagePath', stringFilter: { matchType: preset.matchType, value: preset.path } } },
                        devFilter,
                    ),
                    limit: 1,
                }, accessToken).catch(() => ({ rows: [] }))
            )
        )
        const formStats = FORM_PRESETS.map((preset, i) => {
            const gu = parseInt((formGoalReports[i] as { rows?: { metricValues?: { value?: string }[] }[] }).rows?.[0]?.metricValues?.[0]?.value ?? '0') || 0
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
        const internalDomain = domain.toLowerCase().replace(/^www\./, '')

        for (const row of pathReport.rows ?? []) {
            const channelRaw = row.dimensionValues[0]?.value ?? ''
            const pathRaw = row.dimensionValues[1]?.value ?? ''
            const referrerRaw = row.dimensionValues[2]?.value ?? ''
            const views = parseInt(row.metricValues[0]?.value ?? '0') || 0

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

        // Q2由来の3ステップパス (N-2→N-1→goal)
        const q2Paths = [...pathFlowMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 30)
            .map(([key, count]) => {
                const [channel, n2, n1] = key.split('|||')
                return { channel, n2, n1, count }
            })

        // Q2由来のURL版3ステップパス
        const q2RawPaths = [...rawPathFlowMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 50)
            .map(([key, count]) => {
                const [channel, n2, n1] = key.split('|||')
                return { channel, n2, n1, count }
            })

        // Q1由来の2ステップパス (channel→N-1→goal) — Q2が空の場合のフォールバック
        const q1Paths = [...flowMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 30)
            .map(([key, count]) => {
                const [channel, n1] = key.split('|||')
                return { channel, n2: channel, n1, count }
            })
            .filter(p => p.n1 !== '直接アクセス' && p.n1 !== p.channel)

        // Q1由来のURL版: rawN1Map から構築
        const q1RawPaths = [...rawN1Map.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 50)
            .map(([key, count]) => {
                const [channel, n1] = key.split('|||')
                return { channel, n2: channel, n1, count }
            })

        const topPaths = q2Paths.length > 0 ? q2Paths : q1Paths
        const rawTopPaths = q2RawPaths.length > 0 ? q2RawPaths : q1RawPaths

        // 離脱経路パターン（カテゴリ3ステップ）: N-2 → N-1 → 離脱
        const dropoutPaths = [...dropoutTripletMap.entries()]
            .map(([key, total]) => {
                const [channel, n2, n1] = key.split('|||')
                const goalViews = pathFlowMap.get(key) || 0
                const dropout = Math.max(0, total - goalViews)
                return { channel, n2, n1, dropout }
            })
            .filter(d => d.dropout > 0)
            .sort((a, b) => b.dropout - a.dropout)
            .slice(0, 30)

        // 離脱経路パターン（URL3ステップ）
        const rawDropoutPaths = [...rawPathFlowMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 50)
            .map(([key, dropout]) => {
                const [channel, n2, n1] = key.split('|||')
                return { channel, n2, n1, dropout }
            })

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
            ...[...referrerTotals.entries()].map(([from, sessions]) => ({
                from,
                to: goalLabel,
                sessions,
            })),
        ].filter(f => f.sessions >= 2)

        const referrerRanking = [...referrerTotals.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([page, views]) => ({
                page,
                views,
                rate: totalGoalViews > 0 ? views / totalGoalViews : 0,
            }))

        const channelRanking = [...channelTotals.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([channel, views]) => ({
                channel,
                views,
                rate: totalGoalViews > 0 ? views / totalGoalViews : 0,
            }))

        // ── Q4 処理: ページカテゴリ別離脱傾向（bounceRate を直接利用）──
        const exitMap = new Map<string, { pvTotal: number; bounceWeightedSum: number }>()
        for (const row of exitReport.rows ?? []) {
            const path = row.dimensionValues[0]?.value ?? ''
            const pv = parseInt(row.metricValues[0]?.value ?? '0') || 0
            const bounceRate = parseFloat(row.metricValues[1]?.value ?? '0') || 0
            const cat = categorizePath(path)
            if (cat === 'その他' || pv === 0) continue
            const existing = exitMap.get(cat) || { pvTotal: 0, bounceWeightedSum: 0 }
            exitMap.set(cat, {
                pvTotal: existing.pvTotal + pv,
                bounceWeightedSum: existing.bounceWeightedSum + bounceRate * pv,
            })
        }

        const pageExitRates: Record<string, number> = {}
        for (const [cat, d] of exitMap.entries()) {
            pageExitRates[cat] = d.pvTotal > 0 ? d.bounceWeightedSum / d.pvTotal : 0
        }

        return NextResponse.json({
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
            _debug: {
                exitQ4Rows: exitReport.rows?.length ?? 0,
                exitQ4Error,
                q2RawCount: q2RawPaths.length,
                q1RawCount: q1RawPaths.length,
                rawN1MapSize: rawN1Map.size,
                q2CatCount: q2Paths.length,
                q1CatCount: q1Paths.length,
                crossRows: crossReport.rows?.length ?? 0,
                internalBase,
                sampleReferrer: crossReport.rows?.[0]?.dimensionValues?.[1]?.value ?? '',
            },
        })
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
