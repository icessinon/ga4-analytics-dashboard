export interface FunnelStep {
    stepName: string
    customEventLabel: string
    description?: string
}

export interface FunnelConfig {
    steps: FunnelStep[]
    geminiConfig?: GeminiConfig
}

export interface FunnelFilterConfig {
    dimension: string
    operator: string
    expression: string
}

export interface FunnelStepData {
    stepName: string
    customEventLabel: string
    users: number
    clickUsers: number
    viewUsers: number
    conversionRate: number
    dropoffRate: number
}

export interface FunnelData {
    steps: FunnelStepData[]
    totalUsers: number
    geminiEvaluation?: string
}

export interface Period {
    label: string
    startDate: string
    endDate: string
}

export interface PeriodData {
    label: string
    startDate: string
    endDate: string
    data: FunnelData
}

export interface ComparisonStep {
    stepName: string
    periods: {
        [periodLabel: string]: FunnelStepData
    }
    periodA?: FunnelStepData
    periodB?: FunnelStepData | null
    difference?: {
        users: number
        usersPercent: number
        conversionRate: number
        dropoffRate: number
    } | null
}

export interface ComparisonData {
    periods: PeriodData[]
    comparison: {
        steps: ComparisonStep[]
    }
    periodA?: PeriodData
    periodB?: PeriodData
    geminiEvaluation?: string | null
}

export interface FunnelExecution {
    id: number
    productId: number
    productName: string
    name: string
    funnelConfig: FunnelConfig
    filterConfig: FunnelFilterConfig | null
    startDate: string
    endDate: string
    resultData: FunnelData | ComparisonData
    geminiEvaluation?: string | null
    status: string
    errorMessage: string | null
    createdAt: string
}

export interface GeminiConfig {
    enabled: boolean
    apiKey?: string
}

export type FunnelMode = 'single' | 'compare'

export interface FunnelPageConfig {
    propertyId: string
    startDate: string
    endDate: string
    filterDimension: string
    filterOperator: string
    filterExpression: string
}

export interface GeminiConfigState {
    enabled: boolean
}

export interface PeriodFormData extends Period {
    startDate: string
    endDate: string
}
