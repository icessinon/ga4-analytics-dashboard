/**
 * AbTest.ga4Config から GA4 リクエストを組み立て、バリアント別 CVR を出す定型。
 * execute / current / daily / segment / test-execute が同じ 40 行を持っていたのを集約。
 * ※ サーバー専用
 */

import type { GA4ReportRequest, GA4ReportResponse } from '@/lib/api/ga4/client'
import { calculateCVR, type CvrResult } from '@/lib/services/analytics/cvrService'
import { buildGa4ConfigDimensionFilter } from '@/lib/services/ab-test/ga4ConfigFilter'
import { activeVariantKeys, normalizeCvrConfig, toNameList, type CvrDataKey, type GA4Config, type VariantKey } from '@/lib/services/ab-test/ga4ConfigTypes'

/**
 * ワイルドカードラベルは職種横断で多数の行を拾うため、設定値が小さくても 50,000 行まで取る
 * （limit 到達＝サイレント欠測）
 */
export const DEFAULT_MIN_LIMIT = 50000

export interface AbTestGa4RequestOptions {
    /** 省略時は max(ga4Config.limit, 50000) */
    limit?: number
    /** 日別・セグメント別で 1 列足すとき。既に含まれていれば足さない */
    extraDimension?: string
    includeAllCountries?: boolean
}

export function buildAbTestGa4Request(
    config: GA4Config,
    range: { startDate: string; endDate: string },
    opts: AbTestGa4RequestOptions = {},
): GA4ReportRequest {
    const base = toNameList(config.dimensions)
    const dimensions = opts.extraDimension && !base.some((d) => d.name === opts.extraDimension)
        ? [...base, { name: opts.extraDimension }]
        : base
    const request: GA4ReportRequest = {
        propertyId: config.propertyId,
        dateRanges: [range],
        dimensions,
        metrics: toNameList(config.metrics),
        limit: opts.limit ?? Math.max(config.limit || 0, DEFAULT_MIN_LIMIT),
    }
    if (opts.includeAllCountries !== undefined) request.includeAllCountries = opts.includeAllCountries
    request.dimensionFilter = buildGa4ConfigDimensionFilter({ filter: config.filter ?? undefined, excludeFilter: config.excludeFilter ?? undefined })
    return request
}

/** 1 バリアントの CVR。report は行を差し替えたサブセットでもよい（日別・セグメント別） */
export function cvrForVariant(report: GA4ReportResponse, config: GA4Config, key: VariantKey): CvrResult {
    const cvrConfig = config[`cvr${key}`]
    if (!cvrConfig) throw new Error(`cvr${key} が設定されていません`)
    return calculateCVR(report, normalizeCvrConfig(cvrConfig), report.dimensionHeaders || [], report.metricHeaders || [])
}

/** 設定のあるバリアントすべての CVR を dataA〜dataD の形で */
export function computeVariantCvrs(report: GA4ReportResponse, config: GA4Config): Partial<Record<CvrDataKey, CvrResult>> {
    const out: Partial<Record<CvrDataKey, CvrResult>> = {}
    for (const key of activeVariantKeys(config)) out[`data${key}`] = cvrForVariant(report, config, key)
    return out
}
