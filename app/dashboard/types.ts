/**
 * トップ（ダッシュボード）のクライアント側型。
 * ページ別指標系は lib/services/dashboard/pageMetricsTypes が正で、ここは再エクスポートのみ。
 */

export type {
    ChartMetric,
    Granularity,
    PageMetrics,
    PageMetricsResponse,
    PageMetricsSeriesPoint,
    PageMetricsSeriesResponse,
    SeriesDataPoint,
} from '@/lib/services/dashboard/pageMetricsTypes'

export interface DailyStat {
    date: string
    reportExecutions: number
    funnelExecutions: number
    sessions: number
    heatmapEvents: number
}

export interface AbTestCountByStatus {
    running: number
    paused: number
    completed: number
}

export interface AbTestCompletedOutcome {
    victory: number
    defeat: number
}

/** GET /api/dashboard */
export interface DashboardStats {
    month: string
    productCount: number
    abTestCount: number
    abTestVictoryCount: number
    abTestAddedThisMonth: number
    abTestCountByStatus: AbTestCountByStatus
    abTestCompletedOutcome: AbTestCompletedOutcome
    funnelConfigCount: number
    recentSessionCount: number
    recentHeatmapEventCount: number
    recentReportExecutionCount: number
    funnelExecutionCount: number
    dailyStats: DailyStat[]
}

export interface MonthOption {
    value: string
    label: string
}
