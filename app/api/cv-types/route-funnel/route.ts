import { NextResponse } from 'next/server'
import { getGA4AccessToken } from '@/lib/api/ga4/client'
import { parseDateString } from '@/lib/utils/date'

/**
 * 経路別ファネル: 一覧経由 vs 直接着地。
 * GA4クローズドファネル（v1alpha runFunnelReport・順序付き）で
 *   A: 一覧 → 求人詳細 → 応募フォーム → 応募完了
 *   B: 求人詳細 → 応募フォーム → 応募完了（全体）
 * を実行し、直接着地 = B - A の差分推定で返す。
 * v1alphaは国フィルタが自動適用されないため、各ステップに country=Japan をANDで差し込む（bot対策）。
 */

const LIST_PATHS = [
    'search', 'driver', 'sekokan', 'sekkei', 'soko', 'shokunin', 'seibi', 'hoshu',
    'setsubi-sagyo', 'keibi', 'unkan', 'kojo-sagyo', 'food', 'unyu-sagyo', 'others',
]

const jpFilter = { funnelFieldFilter: { fieldName: 'country', stringFilter: { matchType: 'EXACT', value: 'Japan' } } }
const pageFilter = (matchType: string, value: string) => ({
    funnelFieldFilter: { fieldName: 'unifiedPagePathScreen', stringFilter: { matchType, value } },
})
const withJapan = (expr: Record<string, unknown>) => ({ andGroup: { expressions: [jpFilter, expr] } })

const listStep = {
    name: '一覧',
    filterExpression: withJapan({
        andGroup: {
            expressions: [
                { orGroup: { expressions: LIST_PATHS.map((p) => pageFilter('BEGINS_WITH', `/${p}`)) } },
                { notExpression: pageFilter('CONTAINS', '/media_') },
            ],
        },
    }),
}
const JOB_TYPES = [
    { key: 'JobR', label: '人材紹介', btn: '話を聞いてみる' },
    { key: 'JobA', label: '求人広告', btn: '応募する' },
    { key: 'JobH', label: 'ハローワーク', btn: '話を聞いてみる' },
] as const

const detailStepFor = (key: string) => ({
    name: '求人詳細',
    filterExpression: withJapan({
        funnelFieldFilter: { fieldName: 'customEvent:view_label', stringFilter: { matchType: 'EXACT', value: `DL__Media__Area__${key}` } },
    }),
})
const formStepFor = (key: string) => ({
    name: '応募フォーム',
    filterExpression: withJapan({
        funnelFieldFilter: { fieldName: 'customEvent:view_label', stringFilter: { matchType: 'EXACT', value: `EF__${key}__Area__Header` } },
    }),
})

const completeStepFor = (key: string, btn: string) => ({
    name: '応募完了',
    filterExpression: withJapan({
        andGroup: {
            expressions: [
                { funnelEventFilter: { eventName: 'data_click_label' } },
                { funnelFieldFilter: { fieldName: 'customEvent:click_label', stringFilter: { matchType: 'EXACT', value: `EF__${key}__Btn__${btn}` } } },
            ],
        },
    }),
})

async function runFunnel(propertyId: string, accessToken: string, dateRanges: Array<{ startDate: string; endDate: string }>, steps: unknown[]): Promise<number[]> {
    const res = await fetch(`https://analyticsdata.googleapis.com/v1alpha/properties/${propertyId}:runFunnelReport`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateRanges, funnelVisualizationType: 'STANDARD_FUNNEL', funnel: { isOpenFunnel: false, steps } }),
    })
    if (!res.ok) {
        const err = await res.json().catch(() => null) as { error?: { message?: string } } | null
        throw new Error(`GA4 Funnel API Error: ${err?.error?.message || res.statusText}`)
    }
    const data = await res.json() as { funnelTable?: { rows?: Array<{ metricValues: Array<{ value?: string }> }> } }
    return (data.funnelTable?.rows ?? []).map((r) => parseInt(r.metricValues?.[0]?.value ?? '0', 10))
}

export async function POST(request: Request) {
    try {
        const { propertyId, startDate = '30daysAgo', endDate = 'yesterday' } = await request.json()
        if (!propertyId) {
            return NextResponse.json({ error: 'propertyId が必要です' }, { status: 400 })
        }
        const accessToken = await getGA4AccessToken()
        const dateRanges = [{ startDate: parseDateString(startDate), endDate: parseDateString(endDate) }]

        // 種別ごとに 一覧経由/全体 の2本ずつ。全ステップ種別付き（ビューラベル基準）。
        // v1alphaファネルAPIは同時実行クォータが小さいため逐次実行する
        let listUsers = 0
        const types: Array<{
            key: string; label: string
            viaList: { detail: number; form: number; complete: number }
            direct: { detail: number; form: number; complete: number }
        }> = []
        for (const t of JOB_TYPES) {
            const via = await runFunnel(propertyId, accessToken, dateRanges, [listStep, detailStepFor(t.key), formStepFor(t.key), completeStepFor(t.key, t.btn)])
            const all = await runFunnel(propertyId, accessToken, dateRanges, [detailStepFor(t.key), formStepFor(t.key), completeStepFor(t.key, t.btn)])
            listUsers = Math.max(listUsers, via[0] ?? 0)
            types.push({
                key: t.key,
                label: t.label,
                viaList: { detail: via[1] ?? 0, form: via[2] ?? 0, complete: via[3] ?? 0 },
                direct: {
                    detail: Math.max(0, (all[0] ?? 0) - (via[1] ?? 0)),
                    form: Math.max(0, (all[1] ?? 0) - (via[2] ?? 0)),
                    complete: Math.max(0, (all[2] ?? 0) - (via[3] ?? 0)),
                },
            })
        }

        const totals = {
            viaList: {
                detail: types.reduce((a, t) => a + t.viaList.detail, 0),
                form: types.reduce((a, t) => a + t.viaList.form, 0),
                complete: types.reduce((a, t) => a + t.viaList.complete, 0),
            },
            direct: {
                detail: types.reduce((a, t) => a + t.direct.detail, 0),
                form: types.reduce((a, t) => a + t.direct.form, 0),
                complete: types.reduce((a, t) => a + t.direct.complete, 0),
            },
        }

        return NextResponse.json({
            success: true,
            startDate: dateRanges[0].startDate,
            endDate: dateRanges[0].endDate,
            listUsers,
            types,
            totals,
            fetchedAt: new Date().toISOString(),
        })
    } catch (error) {
        console.error('Route Funnel API Error:', error)
        return NextResponse.json(
            { error: '経路別ファネルの集計に失敗しました', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
