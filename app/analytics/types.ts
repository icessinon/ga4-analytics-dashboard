/** GA4 分析（レポートビルダー）のフォーム状態。API に送るときは labels をカンマ区切り → 配列に変換する */

export interface CvrFormConfig {
    denominatorDimension: string
    denominatorLabels: string
    numeratorDimension: string
    numeratorLabels: string
    metric: string
}

export interface ReportConfig {
    reportName: string
    propertyId: string
    startDate: string
    endDate: string
    metrics: string
    dimensions: string
    filterDimension: string
    filterOperator: string
    filterExpression: string
    orderBy: string
    limit: number
    cvrA: CvrFormConfig
    cvrB: CvrFormConfig
    cvrC: CvrFormConfig
    cvrD: CvrFormConfig
    showCvrC: boolean
    showCvrD: boolean
    abTestStartDate: string
    abTestEndDate: string
    abTestEvaluationConfig: {
        minSignificance: number | null
        minPV: number
        minDays: number
        minImprovementRate: number
        minDifferencePt: number
    }
    geminiConfig: {
        enabled: boolean
    }
}

/** POST /api/analytics/report の結果のうち画面が使う部分 */
export interface ReportResult {
    executionId?: number
    reportId?: number
    cvrResults?: Partial<Record<'dataA' | 'dataB' | 'dataC' | 'dataD', { pv: number; cv: number; cvr: number }>>
    abTestEvaluation?: {
        recommendation: string
        aiEvaluation?: string
        checks: {
            significance: { value: number; passed: boolean }
            sampleSize: { passed: boolean }
            period: { days: number; passed: boolean }
            improvement: { passed: boolean }
        }
    } | null
}
