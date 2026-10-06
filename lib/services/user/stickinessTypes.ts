/** スティッキネス分析（/api/user/stickiness）のレスポンス型 */

export interface StickinessDailyPoint {
    /** 'YYYY-MM-DD' */
    date: string
    dau: number
    wau: number
    mau: number
}

export interface StickinessResult {
    dailySeries: StickinessDailyPoint[]
    avgDAU: number
    /** 期間内ユニークユーザー */
    totalMAU: number
    totalNewUsers: number
    avgSessionsPerUser: number
    stickinessDAUMAU: number
    stickinessWAUMAU: number
}

export interface StickinessResponse {
    success: true
    current: StickinessResult
    /** compareStartDate / compareEndDate を渡したときだけ */
    compare: StickinessResult | null
}
