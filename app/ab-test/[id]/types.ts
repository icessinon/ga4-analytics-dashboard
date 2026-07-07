export interface AbTestScheduleConfig {
    enabled: boolean
    executionType: 'on_end' | 'on_end_delayed' | 'scheduled' | 'recurring'
    delayDays?: number
    scheduledDate?: string
    recurringPattern?: {
        frequency: 'daily' | 'weekly' | 'monthly'
        time: string
        daysOfWeek?: number[]
        dayOfMonth?: number
    }
}

export interface Ga4CvrConfig {
    denominatorDimension?: string
    denominatorLabels?: string | string[]
    numeratorDimension?: string
    numeratorLabels?: string | string[]
    metric?: string
}

export interface AbTestFunnelStep {
    stepName: string
    dimension: string
    labels: Partial<Record<'A' | 'B' | 'C' | 'D', string[]>>
}

export interface AbTest {
    id: number
    name: string
    description: string | null
    hypothesis?: string | null
    expectedImprovement?: number | string | null
    startDate: string
    endDate: string | null
    status: string
    winnerVariant?: string | null
    ga4Config?: {
        dimensions?: string | Array<{ name?: string }>
        filter?: { dimension?: string; operator?: string; expression?: string }
        cvrA?: Ga4CvrConfig
        cvrB?: Ga4CvrConfig
        cvrC?: Ga4CvrConfig
        cvrD?: Ga4CvrConfig
        funnelSteps?: AbTestFunnelStep[]
    }
    autoExecute?: boolean
    scheduleConfig?: AbTestScheduleConfig | null
    lastExecutedAt?: string | null
    victoryFactors?: string | null
    defeatFactors?: string | null
    finalAiReport?: string | null
    finalAiReportAt?: string | null
    product: {
        id: number
        name: string
    }
}

export interface AbTestReportExecution {
    id: number
    abTestId: number
    reportExecutionId: number | null
    status: string
    startedAt: string | null
    completedAt: string | null
    errorMessage: string | null
    createdAt: string
}
