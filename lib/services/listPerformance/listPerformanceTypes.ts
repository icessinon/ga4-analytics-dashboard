/** 求人一覧パフォーマンス（/api/list-performance）の型 */

export interface ListSegmentRow {
    /** 職種スラッグ or 'search'（日次は 'industry_list' | 'search'） */
    segment: string
    pv: number
    sessions: number
    toDetail: number
}

export interface ListDailyRow extends ListSegmentRow {
    /** 'YYYY-MM-DD' */
    date: string
}

export interface ListPerformanceReport {
    startDate: string
    endDate: string
    clamped: boolean
    summary: ListSegmentRow[]
    daily: ListDailyRow[]
    scannedBytes: number
}

export interface ListPerformanceResponse extends ListPerformanceReport {
    success: true
    fetchedAt: string
}
