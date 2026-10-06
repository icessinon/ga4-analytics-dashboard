/**
 * GA4 Data API レスポンスの行の読み取り。
 *
 * `parseInt(r.metricValues[0]?.value ?? '0', 10)` の直書きが 19 route / 92 箇所にあった。
 * 読み方を 1 箇所にして、NaN（値が '(other)' 等）を 0 に潰す扱いも揃える。
 */

import type { GA4ReportResponse } from './client'

export type Ga4Row = GA4ReportResponse['rows'][number]

/** 行配列。rows が無いレスポンス（0 件）は [] */
export function rowsOf(report: GA4ReportResponse | null | undefined): Ga4Row[] {
    return report?.rows ?? []
}

/** i 番目の次元値。無ければ '' */
export function dim(row: Ga4Row, index = 0): string {
    return row.dimensionValues?.[index]?.value ?? ''
}

/** i 番目の指標を整数で。無い・数値でないときは 0 */
export function metricInt(row: Ga4Row, index = 0): number {
    const n = parseInt(row.metricValues?.[index]?.value ?? '0', 10)
    return Number.isFinite(n) ? n : 0
}

/** i 番目の指標を小数で。無い・数値でないときは 0 */
export function metricFloat(row: Ga4Row, index = 0): number {
    const n = parseFloat(row.metricValues?.[index]?.value ?? '0')
    return Number.isFinite(n) ? n : 0
}

/** 次元なし・1 行だけのレポート（合計取得）の指標 */
export function firstMetricInt(report: GA4ReportResponse | null | undefined, index = 0): number {
    const row = rowsOf(report)[0]
    return row ? metricInt(row, index) : 0
}

export function firstMetricFloat(report: GA4ReportResponse | null | undefined, index = 0): number {
    const row = rowsOf(report)[0]
    return row ? metricFloat(row, index) : 0
}

/** 全行の i 番目の指標の合計 */
export function sumMetric(report: GA4ReportResponse | null | undefined, index = 0): number {
    return rowsOf(report).reduce((sum, r) => sum + metricInt(r, index), 0)
}

/**
 * 次元値 → 指標合計の Map。同じ次元値が複数行に出る（他の次元も付けている・(other) 行）
 * ときは足し込む。
 */
export function sumByDim(
    report: GA4ReportResponse | null | undefined,
    opts: { dimIndex?: number; metricIndex?: number } = {},
): Map<string, number> {
    const { dimIndex = 0, metricIndex = 0 } = opts
    const map = new Map<string, number>()
    for (const r of rowsOf(report)) {
        const key = dim(r, dimIndex)
        map.set(key, (map.get(key) ?? 0) + metricInt(r, metricIndex))
    }
    return map
}

/** 次元値 → 指標値（最初に出た行を採用）。重複が無いと分かっているときの軽い版 */
export function indexByDim(
    report: GA4ReportResponse | null | undefined,
    opts: { dimIndex?: number; metricIndex?: number } = {},
): Map<string, number> {
    const { dimIndex = 0, metricIndex = 0 } = opts
    const map = new Map<string, number>()
    for (const r of rowsOf(report)) {
        const key = dim(r, dimIndex)
        if (!map.has(key)) map.set(key, metricInt(r, metricIndex))
    }
    return map
}
