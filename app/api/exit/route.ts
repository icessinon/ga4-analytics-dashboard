import { NextResponse } from 'next/server'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'

const INDUSTRY_SLUGS = [
    'driver', 'sekokan', 'sekkei', 'soko', 'shokunin', 'seibi', 'hoshu',
    'setsubi-sagyo', 'keibi', 'unkan', 'kojo-sagyo', 'food', 'unyu-sagyo', 'others',
]
const IND = INDUSTRY_SLUGS.join('|')
const INDUSTRY_SET = new Set(INDUSTRY_SLUGS)

// ページカテゴリ → GA4フィルタパターン
const PAGE_PATTERNS: Record<string, { value: string; matchType: string }> = {
    'TOP': { value: '/', matchType: 'EXACT' },
    '大職種一覧': { value: `^/(${IND})/?$`, matchType: 'FULL_REGEXP' },
    '絞り込み検索': { value: `^/(${IND})/(?!media_)[^/]`, matchType: 'FULL_REGEXP' },
    '求人詳細': { value: `/(${IND})/media_`, matchType: 'PARTIAL_REGEXP' },
    '応募フォーム': { value: '/entry/media_', matchType: 'BEGINS_WITH' },
    '会員登録フォーム': { value: '/members/signup', matchType: 'BEGINS_WITH' },
    'ログイン': { value: '/members/login', matchType: 'BEGINS_WITH' },
    '検索結果': { value: '/search', matchType: 'BEGINS_WITH' },
    'コラム': { value: '/journal', matchType: 'BEGINS_WITH' },
    'featured': { value: '/featured', matchType: 'BEGINS_WITH' },
    'LP': { value: '/lp_', matchType: 'BEGINS_WITH' },
}

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
    if (parts.length >= 2 && INDUSTRY_SET.has(parts[0]) && /^media_\d+$/.test(parts[1])) return '求人詳細'
    if (parts.length >= 2 && INDUSTRY_SET.has(parts[0])) return '絞り込み検索'
    if (parts.length === 1 && INDUSTRY_SET.has(parts[0])) return '大職種一覧'
    return 'その他'
}

function makeFilter(category: string): Record<string, unknown> | null {
    const pattern = PAGE_PATTERNS[category]
    if (!pattern) return null
    return {
        filter: {
            fieldName: 'pagePath',
            stringFilter: { matchType: pattern.matchType, value: pattern.value },
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
            steps,
            startDate = '30daysAgo',
            endDate = 'today',
            deviceFilter,
            accessToken: customToken,
        } = await request.json()

        if (!propertyId || !Array.isArray(steps) || steps.length < 2) {
            return NextResponse.json({ error: 'propertyId and at least 2 steps are required' }, { status: 400 })
        }

        const accessToken = await getGA4AccessToken(customToken)
        const dateRanges = [{ startDate, endDate }]
        const devFilter: Record<string, unknown> | null = deviceFilter ? {
            filter: {
                fieldName: 'deviceCategory',
                stringFilter: { matchType: 'EXACT', value: deviceFilter },
            },
        } : null

        // ステップごとにセッション数を並列取得
        const stepQueries = steps.map((step: string) => {
            const stepFilter = makeFilter(step)
            if (!stepFilter) return Promise.resolve(null)
            return fetchGA4Data({
                propertyId,
                dateRanges,
                dimensions: [],
                metrics: [{ name: 'sessions' }],
                dimensionFilter: andFilter(stepFilter, devFilter),
                limit: 1,
            }, accessToken)
        })

        // ページ別バウンス率取得（exits は GA4 API 非対応のため代替）
        const exitQuery = fetchGA4Data({
            propertyId,
            dateRanges,
            dimensions: [{ name: 'pagePath' }],
            metrics: [{ name: 'screenPageViews' }, { name: 'bounceRate' }],
            ...(devFilter && { dimensionFilter: devFilter }),
            limit: 5000,
        }, accessToken)

        const [exitReport, ...stepResults] = await Promise.all([exitQuery, ...stepQueries])

        // ステップ処理
        const rawSteps: { name: string; sessions: number }[] = steps.map((name: string, i: number) => {
            const res = stepResults[i]
            const sessions = parseInt(res?.rows?.[0]?.metricValues?.[0]?.value ?? '0') || 0
            return { name, sessions }
        })

        const processedSteps = rawSteps.map((step, i) => {
            const prev = i > 0 ? rawSteps[i - 1].sessions : step.sessions
            const firstStep = rawSteps[0].sessions
            const dropoff = i > 0 ? Math.max(0, prev - step.sessions) : 0
            const dropoffRate = i > 0 && prev > 0 ? dropoff / prev : 0
            const retentionFromFirst = firstStep > 0 ? step.sessions / firstStep : 1
            return {
                name: step.name,
                sessions: step.sessions,
                dropoff,
                dropoffRate,
                retentionFromFirst,
            }
        })

        // 離脱ページ集計（カテゴリ別）
        // exitRate = 1 - engagementRate（低エンゲージ = 離脱しやすい）
        // estimatedExits = screenPageViews × (1 - engagementRate)
        const exitMap = new Map<string, { pageViews: number; bounceWeightedSum: number }>()
        for (const row of exitReport.rows ?? []) {
            const path = row.dimensionValues[0]?.value ?? ''
            const pageViews = parseInt(row.metricValues[0]?.value ?? '0') || 0
            const bounceRate = parseFloat(row.metricValues[1]?.value ?? '0') || 0

            if (pageViews === 0) continue
            const cat = categorizePath(path)
            if (cat === 'その他') continue
            const existing = exitMap.get(cat) || { pageViews: 0, bounceWeightedSum: 0 }
            exitMap.set(cat, {
                pageViews: existing.pageViews + pageViews,
                bounceWeightedSum: existing.bounceWeightedSum + bounceRate * pageViews,
            })
        }

        const exitCategories = [...exitMap.entries()]
            .map(([page, d]) => {
                const exitRate = d.pageViews > 0 ? d.bounceWeightedSum / d.pageViews : 0
                const engagementRate = 1 - exitRate
                const exits = Math.round(exitRate * d.pageViews)
                return { page, exits, pageViews: d.pageViews, exitRate, engagementRate }
            })
            .filter(d => d.pageViews >= 50)
            .sort((a, b) => b.exits - a.exits)
            .slice(0, 20)

        return NextResponse.json({
            steps: processedSteps,
            exitCategories,
        })
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
