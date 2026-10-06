/**
 * AbTest.ga4Config（JSON カラム）の型と正規化。
 * execute / current / daily / segment / test-execute の 5 route が同じ interface と
 * normalizeCvrConfig をコピーして持っていたのをここに集約した。
 *
 * ラベル・次元・指標は「配列」と「カンマ区切り文字列」の両方で保存されている
 * （古いテストは文字列、フォーム経由は配列）ので、読むときは必ずここを通す。
 */

import type { CvrConfig } from '@/lib/services/analytics/cvrService'

export interface GA4CvrConfig {
    denominatorDimension?: string
    denominatorLabels?: string[] | string
    denominatorFilters?: Array<{ dimension: string; operator: string; expression: string }>
    numeratorDimension?: string
    numeratorLabels?: string[] | string
    numeratorFilters?: Array<{ dimension: string; operator: string; expression: string }>
    metric?: string
    [key: string]: unknown
}

export interface GA4ConfigFilter {
    dimension?: string
    operator?: string
    expression?: string
}

export interface GA4Config {
    propertyId: string
    dimensions?: Array<{ name: string }> | string
    metrics?: Array<{ name: string }> | string
    limit?: number
    filter?: GA4ConfigFilter | null
    excludeFilter?: GA4ConfigFilter | null
    cvrA?: GA4CvrConfig
    cvrB?: GA4CvrConfig
    cvrC?: GA4CvrConfig
    cvrD?: GA4CvrConfig
    funnelSteps?: unknown[]
    geminiConfig?: { enabled?: boolean; apiKey?: string }
    abTestEvaluationConfig?: Record<string, unknown>
}

export const VARIANT_KEYS = ['A', 'B', 'C', 'D'] as const
export type VariantKey = (typeof VARIANT_KEYS)[number]
export type CvrSlotKey = `cvr${VariantKey}`
export type CvrDataKey = `data${VariantKey}`

/** 設定があるバリアント（cvrA〜cvrD の順） */
export function activeVariantKeys(config: GA4Config): VariantKey[] {
    return VARIANT_KEYS.filter((v) => !!config[`cvr${v}`])
}

/** 'a, b' → ['a', 'b']。配列ならそのまま。dropEmpty で空要素を落とす */
export function splitLabels(value: string[] | string | undefined, opts: { dropEmpty?: boolean } = {}): string[] {
    const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',').map((l) => l.trim()) : []
    return opts.dropEmpty ? list.filter((l) => l.length > 0) : list
}

/** 'date,eventName' → [{ name: 'date' }, { name: 'eventName' }]。配列ならそのまま */
export function toNameList(value: Array<{ name: string }> | string | undefined): Array<{ name: string }> {
    if (Array.isArray(value)) return value
    if (typeof value === 'string') return value.split(',').map((s) => ({ name: s.trim() }))
    return []
}

/** calculateCVR に渡せる形へ（ラベルを配列に）。それ以外のキーは温存する */
export function normalizeCvrConfig(cvrConfig: GA4CvrConfig): CvrConfig {
    return {
        ...cvrConfig,
        denominatorLabels: splitLabels(cvrConfig.denominatorLabels),
        numeratorLabels: splitLabels(cvrConfig.numeratorLabels),
    } as CvrConfig
}
