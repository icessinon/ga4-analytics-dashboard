/** 月次インサイト（/api/insights）の型 */

export interface CvCount {
    users: number
    pv: number
}

export interface CvBreakdown {
    applyCv: CvCount
    lpApplyCv: CvCount
    signupCv: CvCount
}

export interface MonthMetrics {
    startDate: string
    endDate: string
    activeUsers: number
    newUsers: number
    sessions: number
    engagementRate: number
    avgSessionDuration: number
    screenPageViews: number
    cv: CvBreakdown
    topPages: Array<{ path: string; views: number }>
}

export interface WeekSummary {
    label: string
    startDate: string
    endDate: string
    activeUsers: number
    sessions: number
    engagementRate: number
    screenPageViews: number
    applyCv: number
    lpApplyCv: number
    signupCv: number
}

export interface MonthlyTrendPoint {
    /** 'YYYY-MM' */
    label: string
    year: number
    month: number
    activeUsers: number
    newUsers: number
    sessions: number
    engagementRate: number
    screenPageViews: number
    applyCv: number
    lpApplyCv: number
    signupCv: number
}

export interface InsightsReport {
    /** 'YYYY-MM' */
    baseMonth: string
    isCurrentMonth: boolean
    current: MonthMetrics
    previous: MonthMetrics
    weeklyBreakdown: { current: WeekSummary[]; previous: WeekSummary[] }
    monthlyTrend: MonthlyTrendPoint[]
}
