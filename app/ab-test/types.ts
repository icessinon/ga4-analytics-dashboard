export interface AbTest {
    id: number
    name: string
    description: string | null
    hypothesis?: string | null
    expectedImprovement?: number | string | null
    startDate: string
    endDate: string | null
    status: string
    ga4Config?: {
        cvrC?: { denominatorDimension?: string }
        cvrD?: { denominatorDimension?: string }
    }
    autoExecute?: boolean
    scheduleConfig?: Record<string, unknown> | null
    evaluationConfig?: unknown
    product: { id: number; name: string }
    variantAName?: string
    variantBName?: string
    _count?: { reportExecutions: number }
}
