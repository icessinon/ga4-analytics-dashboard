import { NextResponse } from 'next/server'
import { gscQuery, type GscFilter } from '@/lib/api/gsc/client'
import { GSC_PAGE_CATEGORIES } from '@/lib/api/gsc/categories'

/**
 * SEOモニタ: Search Console の掲載順位・表示回数・CTR・クリックを
 * 全体日別・ページカテゴリ別・上位クエリで返す。
 * 施策（モザイク・モーダル・FV変更等）のSEO影響測定のベースライン＆前後比較用。
 * GSCデータは2〜3日遅れのため endDate は3日前を上限にする。
 */

const PAGE_CATEGORIES = GSC_PAGE_CATEGORIES

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
        const { days = 28, pathFilter = '', startDate = '', endDate = '' } = await request.json().catch(() => ({})) as {
            days?: number
            pathFilter?: string
            startDate?: string
            endDate?: string
        }
        const nDays = Math.min(180, Math.max(7, Number(days) || 28))
        // 任意のパス正規表現でURL群を絞り込む（例: /(driver)/media_.* や /search）。全体サマリー・日別・クエリ・URL表に適用
        const pathFilters: GscFilter[] = pathFilter && typeof pathFilter === 'string' && pathFilter.trim()
            ? [{ dimension: 'page', operator: 'includingRegex', expression: `^https://x-work\\.jp(${pathFilter.trim()})` }]
            : []
        // GSCは2〜3日ラグがあるため3日前を終端上限に
        const lagEnd = new Date()
        lagEnd.setDate(lagEnd.getDate() - 3)
        const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
        let start: Date
        let end: Date
        if (isYmd(startDate) && isYmd(endDate)) {
            // 具体日付指定（カスタム・今月・前月）。終端はラグ分だけ手前に丸める
            end = new Date(`${endDate}T00:00:00Z`)
            if (fmt(end) > fmt(lagEnd)) end = new Date(`${fmt(lagEnd)}T00:00:00Z`)
            start = new Date(`${startDate}T00:00:00Z`)
            if (start > end) start = new Date(end)
        } else {
            // 従来互換: 日数指定
            end = lagEnd
            start = new Date(end)
            start.setDate(start.getDate() - (nDays - 1))
        }
        // 前期間（同じ長さ）
        const lenDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1
        const prevEnd = new Date(start)
        prevEnd.setDate(prevEnd.getDate() - 1)
        const prevStart = new Date(prevEnd)
        prevStart.setDate(prevStart.getDate() - (lenDays - 1))

        const range = { startDate: fmt(start), endDate: fmt(end) }
        const prevRange = { startDate: fmt(prevStart), endDate: fmt(prevEnd) }

        // 全体日別 + 上位クエリ + 上位ページ(当期・前期) + 検索タイプ別(当期・前期) + カテゴリ別（当期・前期）を並列取得
        const [daily, topQueries, topPagesNow, topPagesPrev, totalNow, totalPrev, appearanceNow, appearancePrev, ...catResults] = await Promise.all([
            gscQuery({ ...range, dimensions: ['date'], rowLimit: 200, ...(pathFilters.length ? { filters: pathFilters } : {}) }),
            gscQuery({ ...range, dimensions: ['query'], rowLimit: 15, ...(pathFilters.length ? { filters: pathFilters } : {}) }),
            gscQuery({ ...range, dimensions: ['page'], rowLimit: 20, ...(pathFilters.length ? { filters: pathFilters } : {}) }),
            gscQuery({ ...prevRange, dimensions: ['page'], rowLimit: 500, ...(pathFilters.length ? { filters: pathFilters } : {}) }),
            gscQuery({ ...range, dimensions: [], ...(pathFilters.length ? { filters: pathFilters } : {}) }),
            gscQuery({ ...prevRange, dimensions: [], ...(pathFilters.length ? { filters: pathFilters } : {}) }),
            // 検索での見え方（しごと検索枠など）。searchAppearanceは他ディメンション・pageフィルタと併用不可のため常に全体
            gscQuery({ ...range, dimensions: ['searchAppearance'], rowLimit: 20 }),
            gscQuery({ ...prevRange, dimensions: ['searchAppearance'], rowLimit: 20 }),
            ...PAGE_CATEGORIES.flatMap((c) => [
                gscQuery({ ...range, dimensions: [], filters: c.filters }),
                gscQuery({ ...prevRange, dimensions: [], filters: c.filters }),
            ]),
        ])

        const APPEARANCE_LABELS: Record<string, string> = {
            JOB_LISTING: 'しごと検索（求人一覧枠）',
            JOB_DETAILS: 'しごと検索（求人詳細枠）',
        }
        const prevAppearance = new Map<string, { clicks: number; impressions: number }>()
        for (const r of appearancePrev) {
            prevAppearance.set(r.keys?.[0] ?? '', { clicks: r.clicks ?? 0, impressions: r.impressions ?? 0 })
        }
        const searchAppearance = appearanceNow.map((r) => {
            const type = r.keys?.[0] ?? ''
            const prev = prevAppearance.get(type)
            return {
                type,
                label: APPEARANCE_LABELS[type] ?? type,
                clicks: r.clicks ?? 0,
                impressions: r.impressions ?? 0,
                position: r.position ?? null,
                prevClicks: prev?.clicks ?? 0,
                prevImpressions: prev?.impressions ?? 0,
            }
        })

        const prevByPage = new Map<string, { clicks: number; position: number | null }>()
        for (const r of topPagesPrev) {
            prevByPage.set(r.keys?.[0] ?? '', { clicks: r.clicks ?? 0, position: r.position ?? null })
        }
        const topPages = topPagesNow.map((r) => {
            const url = r.keys?.[0] ?? ''
            const prev = prevByPage.get(url)
            return {
                path: url.replace(/^https:\/\/[^/]+/, '') || url,
                clicks: r.clicks ?? 0,
                impressions: r.impressions ?? 0,
                position: r.position ?? null,
                prevClicks: prev?.clicks ?? 0,
                prevPosition: prev?.position ?? null,
            }
        })

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
            pathFilter: pathFilter?.trim() || null,
            topPages,
            searchAppearance,
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
