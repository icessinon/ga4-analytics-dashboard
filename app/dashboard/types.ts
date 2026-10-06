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

export interface PageMetrics {
    pv: number
    cv: number
    cvr: number
    sessions: number
    newUsers: number
    newUserRate: number
    bounceRate: number
    bounceCount: number
    exitRate: number | null
    exitRateNote?: string
    averageSessionDurationSeconds: number
    averageSessionDurationLabel: string
    engagementRate: number
    cvEventName?: string
    cvDimension?: string
}

export interface MonthOption {
    value: string
    label: string
}

/** ページ指標の時系列1点（API series の要素）。グラフ用に t を付与したものが SeriesDataPoint */
export interface SeriesDataPoint {
    period: string
    label: string
    t: number
    pv: number
    cv: number
    sessions: number
    cvr?: number
    newUsers?: number
    newUserRate?: number
    bounceRate?: number
    bounceCount?: number
    averageSessionDuration?: number
    engagementRate?: number
    exitRate?: number
}

/** API から返る series 1件（t なし） */
export type PageMetricsSeriesPoint = Omit<SeriesDataPoint, 't'>

/** 推移グラフで選択可能なメトリクス */
export type ChartMetric =
    | 'pv'
    | 'cv'
    | 'cvr'
    | 'sessions'
    | 'exitRate'
    | 'newUserRate'
    | 'bounceRate'
    | 'bounceCount'
    | 'averageSessionDuration'
    | 'engagementRate'
