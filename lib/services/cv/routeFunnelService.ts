import { ga4Fetch } from '@/lib/api/ga4/concurrency'
import type { Ga4Reporter } from '@/lib/api/ga4/report'
import { JOB_TYPES, LIST_PATHS, completeClickLabel, detailLabel, formLabel } from './jobTypeLabels'
import type { RouteFunnelReport, RouteFunnelSide, RouteFunnelType } from './routeFunnelTypes'

/**
 * 経路別ファネル: 一覧経由 vs 直接着地。
 * GA4クローズドファネル（v1alpha runFunnelReport・順序付き）で
 *   A: 一覧 → 求人詳細 → 応募フォーム → 応募完了
 *   B: 求人詳細 → 応募フォーム → 応募完了（全体）
 * を実行し、直接着地 = B - A の差分推定で返す。
 * v1alphaは国フィルタが自動適用されないため、各ステップに country=Japan をANDで差し込む（bot対策）。
 *
 * runReport と形が違う（funnelFieldFilter / funnelEventFilter）ので reporter.run ではなく
 * ctx の propertyId / accessToken / dateRanges を使って v1alpha を直接叩く。
 */

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

const viewStep = (name: string, label: string) => ({
    name,
    filterExpression: withJapan({
        funnelFieldFilter: { fieldName: 'customEvent:view_label', stringFilter: { matchType: 'EXACT', value: label } },
    }),
})
const completeStep = (label: string) => ({
    name: '応募完了',
    filterExpression: withJapan({
        andGroup: {
            expressions: [
                { funnelEventFilter: { eventName: 'data_click_label' } },
                { funnelFieldFilter: { fieldName: 'customEvent:click_label', stringFilter: { matchType: 'EXACT', value: label } } },
            ],
        },
    }),
})

async function runFunnel(reporter: Ga4Reporter, steps: unknown[]): Promise<number[]> {
    const { propertyId, accessToken, dateRanges } = reporter.ctx
    const res = await ga4Fetch(
        propertyId,
        `https://analyticsdata.googleapis.com/v1alpha/properties/${propertyId}:runFunnelReport`,
        { dateRanges, funnelVisualizationType: 'STANDARD_FUNNEL', funnel: { isOpenFunnel: false, steps } },
        accessToken,
    )
    if (!res.ok) {
        const err = await res.json().catch(() => null) as { error?: { message?: string } } | null
        throw new Error(`GA4 Funnel API Error: ${err?.error?.message || res.statusText}`)
    }
    const data = await res.json() as { funnelTable?: { rows?: Array<{ metricValues: Array<{ value?: string }> }> } }
    return (data.funnelTable?.rows ?? []).map((r) => parseInt(r.metricValues?.[0]?.value ?? '0', 10))
}

const sum = (types: RouteFunnelType[], side: 'viaList' | 'direct'): RouteFunnelSide => ({
    detail: types.reduce((a, t) => a + t[side].detail, 0),
    form: types.reduce((a, t) => a + t[side].form, 0),
    complete: types.reduce((a, t) => a + t[side].complete, 0),
})

export async function runRouteFunnelReport(reporter: Ga4Reporter): Promise<RouteFunnelReport> {
    // 種別ごとに 一覧経由/全体 の2本ずつ。全ステップ種別付き（ビューラベル基準）。
    // v1alphaファネルAPIは同時実行クォータが小さいため逐次実行する
    let listUsers = 0
    const types: RouteFunnelType[] = []
    for (const t of JOB_TYPES) {
        const detail = viewStep('求人詳細', detailLabel(t.key))
        const form = viewStep('応募フォーム', formLabel(t.key))
        const complete = completeStep(completeClickLabel(t.key))
        const via = await runFunnel(reporter, [listStep, detail, form, complete])
        const all = await runFunnel(reporter, [detail, form, complete])
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
    return { listUsers, types, totals: { viaList: sum(types, 'viaList'), direct: sum(types, 'direct') } }
}
