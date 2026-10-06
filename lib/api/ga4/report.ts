/**
 * GA4 Data API を「propertyId / accessToken / 期間」を固定して何度も叩くための薄い包み。
 *
 * route では `fetchGA4Data({ propertyId, dateRanges, ... }, accessToken)` を同じ引数で
 * 3〜6 回繰り返していた。サービス層は reporter を受け取り、指標と次元だけを書く。
 * client.ts（fetchGA4Data）には手を入れない。
 */

import { fetchGA4Data, type GA4ReportRequest, type GA4ReportResponse } from './client'
import type { Ga4FilterExpression } from './filters'

export interface Ga4DateRange {
    startDate: string
    endDate: string
}

export interface Ga4ReportContext {
    propertyId: string
    accessToken: string
    dateRanges: Ga4DateRange[]
}

/** 1 回分のレポート指定。dateRanges を省くと context の期間 */
export interface Ga4ReportSpec {
    dimensions?: string[]
    metrics: string[]
    dimensionFilter?: Ga4FilterExpression
    orderBys?: GA4ReportRequest['orderBys']
    limit?: number
    dateRanges?: Ga4DateRange[]
    includeAllCountries?: boolean
}

export interface Ga4Reporter {
    readonly ctx: Ga4ReportContext
    run(spec: Ga4ReportSpec): Promise<GA4ReportResponse>
    /** 並列実行。同時実行数の上限は ga4Fetch 側（lib/api/ga4/concurrency.ts）が守る */
    runAll<const T extends readonly Ga4ReportSpec[]>(specs: T): Promise<{ [K in keyof T]: GA4ReportResponse }>
    /** 期間だけ差し替えた reporter（月次推移で複数期間を回すとき） */
    withDateRanges(dateRanges: Ga4DateRange[]): Ga4Reporter
}

export function createGa4Reporter(ctx: Ga4ReportContext): Ga4Reporter {
    const run = (spec: Ga4ReportSpec) =>
        fetchGA4Data(
            {
                propertyId: ctx.propertyId,
                dateRanges: spec.dateRanges ?? ctx.dateRanges,
                dimensions: spec.dimensions ?? [],
                metrics: spec.metrics,
                dimensionFilter: spec.dimensionFilter,
                orderBys: spec.orderBys,
                limit: spec.limit,
                includeAllCountries: spec.includeAllCountries,
            },
            ctx.accessToken,
        )
    return {
        ctx,
        run,
        runAll: ((specs: readonly Ga4ReportSpec[]) => Promise.all(specs.map(run))) as Ga4Reporter['runAll'],
        withDateRanges: (dateRanges) => createGa4Reporter({ ...ctx, dateRanges }),
    }
}
