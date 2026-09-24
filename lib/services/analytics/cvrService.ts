/**
 * CVR計算サービス
 * 元のGASコードのcalculateCVR関数を参考に実装
 * ラベルは完全一致に加え * ワイルドカードに対応（labelMatcher.ts）
 */

import { createLabelMatcher, type LabelMatcher } from './labelMatcher'

export interface CvrConfig {
    denominatorDimension: string
    denominatorLabels: string[]
    denominatorFilters?: Array<{
        dimension: string
        operator: string
        expression: string
    }>
    numeratorDimension: string
    numeratorLabels: string[]
    numeratorFilters?: Array<{
        dimension: string
        operator: string
        expression: string
    }>
    metric: string
}

export interface LabelCount {
    label: string
    value: number
}

export interface CvrResult {
    pv: number
    cv: number
    cvr: number
    /** ラベル別内訳（設定順。複数ラベル指定時にどのラベルが何件かを見るため） */
    pvByLabel: LabelCount[]
    cvByLabel: LabelCount[]
}

export interface GA4ReportRow {
    dimensionValues: Array<{ value: string }>
    metricValues: Array<{ value: string }>
}

export interface GA4Report {
    dimensionHeaders: Array<{ name: string }>
    metricHeaders: Array<{ name: string; type: string }>
    rows: GA4ReportRow[]
}

/**
 * CVRを計算
 * GA4レポートデータから分母（PV）と分子（CV）を抽出し、CVRを計算する
 * @param report - GA4レポートデータ
 * @param cvrConfig - CVR計算設定（分母/分子ディメンション、ラベル、フィルタなど）
 * @param dimensionHeaders - ディメンションヘッダー
 * @param metricHeaders - メトリクスヘッダー
 * @returns CVR計算結果（PV、CV、CVR）
 */
export function calculateCVR(
    report: GA4Report,
    cvrConfig: CvrConfig,
    dimensionHeaders: Array<{ name: string }>,
    metricHeaders: Array<{ name: string; type: string }>
): CvrResult {
    const result: CvrResult = { pv: 0, cv: 0, cvr: 0, pvByLabel: [], cvByLabel: [] }

    if (!report || !report.rows || report.rows.length === 0) {
        return result
    }

    const denDimIndex = dimensionHeaders.findIndex((h) => h.name === cvrConfig.denominatorDimension)
    const numDimIndex = dimensionHeaders.findIndex((h) => h.name === cvrConfig.numeratorDimension)
    const metricIndex = metricHeaders.findIndex((h) => h.name === cvrConfig.metric)

    if (denDimIndex === -1 || numDimIndex === -1 || metricIndex === -1) {
        return result
    }

    const normalize = (val: string) => {
        if (val === '' || val === '(not set)') return '(not set)'
        return val.trim()
    }
    const denMatcher = createLabelMatcher(cvrConfig.denominatorLabels.map(normalize))
    const numMatcher = createLabelMatcher(cvrConfig.numeratorLabels.map(normalize))

    const applyFilters = (row: GA4ReportRow, filters?: Array<{ dimension: string; operator: string; expression: string }>) => {
        if (!filters || filters.length === 0) return true
        for (const filter of filters) {
            const dimIndex = dimensionHeaders.findIndex((h) => h.name === filter.dimension)
            if (dimIndex === -1) continue
            const dimValue = row.dimensionValues[dimIndex]?.value || ''
            const normalizedValue = normalize(dimValue)
            const filterExpressions = filter.expression.split(',').map((e) => e.trim())
            if (filter.operator === 'EXACT') {
                if (!filterExpressions.includes(normalizedValue)) return false
            } else if (filter.operator === 'CONTAINS') {
                const matches = filterExpressions.some((exp) => normalizedValue.includes(exp))
                if (!matches) return false
            }
        }
        return true
    }

    // 完全一致ラベルのみ0件シード（ワイルドカード一致分は実ラベルで動的に追加）
    const pvByLabel = new Map<string, number>(denMatcher.exactLabels.map((l) => [l, 0]))
    const cvByLabel = new Map<string, number>(numMatcher.exactLabels.map((l) => [l, 0]))

    for (const row of report.rows) {
        const denValue = normalize(row.dimensionValues[denDimIndex]?.value || '')
        const numValue = normalize(row.dimensionValues[numDimIndex]?.value || '')
        const metricValue = parseFloat(row.metricValues[metricIndex]?.value || '0')

        if (denMatcher.match(denValue)) {
            if (applyFilters(row, cvrConfig.denominatorFilters)) {
                result.pv += metricValue
                pvByLabel.set(denValue, (pvByLabel.get(denValue) ?? 0) + metricValue)
            }
        }

        if (numMatcher.match(numValue)) {
            if (applyFilters(row, cvrConfig.numeratorFilters)) {
                result.cv += metricValue
                cvByLabel.set(numValue, (cvByLabel.get(numValue) ?? 0) + metricValue)
            }
        }
    }

    result.cvr = result.pv > 0 ? result.cv / result.pv : 0
    result.pvByLabel = toLabelCounts(pvByLabel, denMatcher)
    result.cvByLabel = toLabelCounts(cvByLabel, numMatcher)
    return result
}

/**
 * 内訳Mapを配列化する。
 * 完全一致ラベル（シード分）は設定順を維持し、ワイルドカード一致で動的に増えた
 * 実ラベルは名前昇順で後置。1行も拾えなかったワイルドカードパターンは
 * 0件エントリとして末尾に追加し「何も一致していない」ことを可視化する。
 */
function toLabelCounts(byLabel: Map<string, number>, matcher: LabelMatcher): LabelCount[] {
    const exactSet = new Set(matcher.exactLabels)
    const seeded: LabelCount[] = []
    const dynamic: LabelCount[] = []
    for (const [label, value] of byLabel.entries()) {
        if (exactSet.has(label)) {
            seeded.push({ label, value })
        } else {
            dynamic.push({ label, value })
        }
    }
    dynamic.sort((a, b) => a.label.localeCompare(b.label, 'ja'))
    const matched = [...seeded, ...dynamic]
    const unmatched = matcher.wildcardPatterns
        .filter((p) => !matched.some((d) => p.regexp.test(d.label)))
        .map((p) => ({ label: p.pattern, value: 0 }))
    return [...matched, ...unmatched]
}
