/** セグメント行動分析（/api/user/list・/api/user/timeline）のレスポンス型 */

export interface UserSegment {
    deviceCategory: string
    browser: string
    operatingSystem: string
    country: string
    sessionSource: string
    sessionMedium: string
    /** 'YYYY-MM-DD'。期間内で最後に活動のあった日 */
    lastDate: string
    totalUsers: number
    totalSessions: number
    totalPageViews: number
    totalEvents: number
}

export interface UserSegmentListResponse {
    success: true
    segments: UserSegment[]
    total: number
}

/** timeline の絞り込み条件。'(not set)' と空は条件に含めない */
export type UserSegmentFilter = Partial<Pick<UserSegment, 'deviceCategory' | 'browser' | 'operatingSystem' | 'country' | 'sessionSource' | 'sessionMedium'>>

export interface UserTimelineEvent {
    /** 'YYYYMMDDHH'。並び替え用 */
    sortKey: string
    date: string
    time: string
    eventName: string
    pagePath: string
    pageTitle: string
    sessionSource: string
    deviceCategory: string
    eventCount: number
    userCount: number
}

export interface UserTimelineResponse {
    success: true
    events: UserTimelineEvent[]
    total: number
}
