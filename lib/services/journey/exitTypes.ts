/** 離脱分析（/api/exit）の型 */

export interface ExitFunnelStep {
    name: string
    sessions: number
    dropoff: number
    dropoffRate: number
    retentionFromFirst: number
}

export interface ExitCategory {
    page: string
    /** PV × (1 − エンゲージメント率) の推定値 */
    exits: number
    pageViews: number
    exitRate: number
    engagementRate: number
    avgEngagementSec: number
    scrollRate: number
}

export interface ExitReport {
    steps: ExitFunnelStep[]
    exitCategories: ExitCategory[]
}
