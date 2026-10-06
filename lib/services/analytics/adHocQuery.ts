/**
 * GA4 分析 / データ閲覧ページの「自由指定クエリ」。
 * 画面から来た metrics / dimensions / filter / limit を Ga4ReportSpec に直し、結果をテーブル行にする。
 * /api/analytics/data と /api/analytics/report が同じ組み立てを 2 重に持っていたのを 1 本にした。
 */

import type { GA4ReportResponse } from '@/lib/api/ga4/client'
import { or, stringFilter, type Ga4FilterExpression, type Ga4MatchType } from '@/lib/api/ga4/filters'
import type { Ga4ReportSpec } from '@/lib/api/ga4/report'
import type { AdHocFilter, AdHocRow, AdHocTable } from './adHocTypes'

export type { AdHocFilter, AdHocRow, AdHocTable } from './adHocTypes'

export interface AdHocQueryInput {
    /** 'eventCount' または { name: 'eventCount' } のどちらでも */
    metrics?: unknown
    dimensions?: unknown
    filter?: unknown
    limit?: unknown
}

export interface AdHocQuerySpec extends Ga4ReportSpec {
    dimensions: string[]
    metrics: string[]
    limit: number
}

function toNames(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value.map((v) => (typeof v === 'string' ? v : String((v as { name?: unknown })?.name ?? '')))
}

function toFilter(value: unknown): AdHocFilter | null {
    if (!value || typeof value !== 'object') return null
    const f = value as Partial<Record<keyof AdHocFilter, unknown>>
    if (!f.dimension || !f.operator || !f.expression) return null
    return { dimension: String(f.dimension), operator: String(f.operator), expression: String(f.expression) }
}

/** カンマ区切りの式を OR フィルタに。空白だけなら null（フィルタなし） */
export function adHocFilterExpression(filter: AdHocFilter | null): Ga4FilterExpression | undefined {
    if (!filter) return undefined
    const values = filter.expression.split(',').map((s) => s.trim()).filter(Boolean)
    if (values.length === 0) return undefined
    const matchType = filter.operator.toUpperCase() as Ga4MatchType
    return or(...values.map((v) => stringFilter(filter.dimension, matchType, v)))
}

export function buildAdHocSpec(input: AdHocQueryInput): AdHocQuerySpec {
    const dimensions = toNames(input.dimensions)
    const metrics = toNames(input.metrics)
    const filter = toFilter(input.filter)
    return {
        dimensions,
        metrics,
        dimensionFilter: adHocFilterExpression(filter),
        limit: input.limit === undefined ? 10000 : Number(input.limit),
        // 国ディメンションを扱うクエリでは既定の country=Japan フィルタを外す
        includeAllCountries: dimensions.includes('country') || filter?.dimension === 'country',
    }
}

/** GA4 の行をヘッダ名キーのオブジェクトに。表やエクスポートがそのまま使える形 */
export function toAdHocTable(report: GA4ReportResponse): AdHocTable {
    const dimensionHeaders = report.dimensionHeaders || []
    const metricHeaders = report.metricHeaders || []
    const rows: AdHocRow[] = (report.rows ?? []).map((row) => {
        const out: AdHocRow = {}
        dimensionHeaders.forEach((h, i) => { out[h.name] = row.dimensionValues?.[i]?.value || '' })
        metricHeaders.forEach((h, i) => { out[h.name] = row.metricValues?.[i]?.value || '0' })
        return out
    })
    return { dimensionHeaders, metricHeaders, rows, rowCount: report.rowCount || 0 }
}
