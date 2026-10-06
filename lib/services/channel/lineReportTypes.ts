/** LINE配信レポート（/api/line-report）の型 */

import type { CvCounts } from '@/lib/services/cv/cvPages'

export interface LineSourceRow {
    source: string
    sessions: number
    users: number
}

export interface LineDailyRow {
    /** 'YYYYMMDD' */
    date: string
    users: number
    sessions: number
}

/** おすすめ求人 LINE 配信の 1 回分（週次） */
export interface LineDeliveryRow {
    unit: string
    /** 'YYYYMMDD' */
    date: string
    linked: number
    success: number
    optOut: number
    noJobs: number
    error: number
}

export interface LineReportReport {
    sources: LineSourceRow[]
    daily: LineDailyRow[]
    cv: CvCounts
    deliveries: LineDeliveryRow[]
    /** BQ の外部テーブルを読めたか（権限が無い間は静的スナップショット） */
    deliverySource: 'live' | 'snapshot'
    snapshotAsOf: string
}

export interface LineReportResponse extends LineReportReport {
    success: true
    startDate: string
    endDate: string
    fetchedAt: string
}
