import { NextResponse } from 'next/server'
import { gscQuery, type GscFilter } from '@/lib/api/gsc/client'

/**
 * SEOモニタ: Search Console の掲載順位・表示回数・CTR・クリックを
 * 全体日別・ページカテゴリ別・上位クエリで返す。
 * 施策（モザイク・モーダル・FV変更等）のSEO影響測定のベースライン＆前後比較用。
 * GSCデータは2〜3日遅れのため endDate は3日前を上限にする。
 */

const INDUSTRY_ALT = 'driver|sekokan|sekkei|soko|shokunin|seibi|hoshu|setsubi-sagyo|keibi|unkan|kojo-sagyo|food|unyu-sagyo|others'

const PAGE_CATEGORIES: Array<{ key: string; label: string; filters: GscFilter[] }> = [
    {
        key: 'detail',
        label: '求人詳細',
        filters: [{ dimension: 'page', operator: 'includingRegex', expression: `^https://x-work\\.jp/(${INDUSTRY_ALT})/media_[0-9]+` }],
    },
    {
        key: 'list',
        label: '検索・一覧',
        filters: [
            { dimension: 'page', operator: 'includingRegex', expression: `^https://x-work\\.jp/(search|(${INDUSTRY_ALT})(/|$))` },
            { dimension: 'page', operator: 'excludingRegex', expression: 'media_' },
        ],
    },
    {
        key: 'cond',
        label: '資格条件',
        filters: [{ dimension: 'page', operator: 'includingRegex', expression: '^https://x-work\\.jp/cond/' }],
    },
    {
        key: 'top',
        label: 'TOP',
        filters: [{ dimension: 'page', operator: 'equals', expression: 'https://x-work.jp/' }],
    },
    {
        key: 'journal',
        label: 'コラム',
        filters: [{ dimension: 'page', operator: 'contains', expression: '/journal' }],
    },
]

function fmt(d: Date): string {
    return d.toISOString().slice(0, 10)
}

interface CategoryStat {
    key: string
    label: string
    clicks: number
    impressions: number
    ctr: number | null
    position: number | null
    prevClicks: number
    prevImpressions: number
    prevPosition: number | null
}

export async function POST(request: Request) {
    try {
        const { days = 28 } = await request.json().catch(() => ({}))
        const nDays = Math.min(180, Math.max(7, Number(days) || 28))
        // GSCは2〜3日ラグがあるため3日前を終端に
        const end = new Date()
        end.setDate(end.getDate() - 3)
        const start = new Date(end)
        start.setDate(start.getDate() - (nDays - 1))
        // 前期間（同じ長さ）
        const prevEnd = new Date(start)
        prevEnd.setDate(prevEnd.getDate() - 1)
        const prevStart = new Date(prevEnd)
        prevStart.setDate(prevStart.getDate() - (nDays - 1))

        const range = { startDate: fmt(start), endDate: fmt(end) }
        const prevRange = { startDate: fmt(prevStart), endDate: fmt(prevEnd) }

        // 全体日別 + 上位クエリ + カテゴリ別（当期・前期）を並列取得
        const [daily, topQueries, totalNow, totalPrev, ...catResults] = await Promise.all([
            gscQuery({ ...range, dimensions: ['date'], rowLimit: 200 }),
            gscQuery({ ...range, dimensions: ['query'], rowLimit: 15 }),
            gscQuery({ ...range, dimensions: [] }),
            gscQuery({ ...prevRange, dimensions: [] }),
            ...PAGE_CATEGORIES.flatMap((c) => [
                gscQuery({ ...range, dimensions: [], filters: c.filters }),
                gscQuery({ ...prevRange, dimensions: [], filters: c.filters }),
            ]),
        ])

        const categories: CategoryStat[] = PAGE_CATEGORIES.map((c, i) => {
            const now = catResults[i * 2]?.[0]
            const prev = catResults[i * 2 + 1]?.[0]
            return {
                key: c.key,
                label: c.label,
                clicks: now?.clicks ?? 0,
                impressions: now?.impressions ?? 0,
                ctr: now?.ctr ?? null,
                position: now?.position ?? null,
                prevClicks: prev?.clicks ?? 0,
                prevImpressions: prev?.impressions ?? 0,
                prevPosition: prev?.position ?? null,
            }
        })

        return NextResponse.json({
            success: true,
            range,
            prevRange,
            total: {
                clicks: totalNow[0]?.clicks ?? 0,
                impressions: totalNow[0]?.impressions ?? 0,
                ctr: totalNow[0]?.ctr ?? null,
                position: totalNow[0]?.position ?? null,
                prevClicks: totalPrev[0]?.clicks ?? 0,
                prevImpressions: totalPrev[0]?.impressions ?? 0,
                prevPosition: totalPrev[0]?.position ?? null,
            },
            daily: daily
                .map((r) => ({
                    date: r.keys?.[0] ?? '',
                    clicks: r.clicks ?? 0,
                    impressions: r.impressions ?? 0,
                    position: r.position ?? null,
                }))
                .sort((a, b) => a.date.localeCompare(b.date)),
            categories,
            topQueries: topQueries.map((r) => ({
                query: r.keys?.[0] ?? '',
                clicks: r.clicks ?? 0,
                impressions: r.impressions ?? 0,
                position: r.position ?? null,
            })),
            fetchedAt: new Date().toISOString(),
        })
    } catch (error) {
        console.error('SEO Report API Error:', error)
        return NextResponse.json(
            { error: 'SEOレポートの集計に失敗しました', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
