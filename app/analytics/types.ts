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
    cvrA: {
        denominatorDimension: string
        denominatorLabels: string
        numeratorDimension: string
        numeratorLabels: string
        metric: string
    }
    cvrB: {
        denominatorDimension: string
        denominatorLabels: string
        numeratorDimension: string
        numeratorLabels: string
        metric: string
    }
    cvrC: {
        denominatorDimension: string
        denominatorLabels: string
        numeratorDimension: string
        numeratorLabels: string
        metric: string
    }
    cvrD: {
        denominatorDimension: string
        denominatorLabels: string
        numeratorDimension: string
        numeratorLabels: string
        metric: string
    }
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
