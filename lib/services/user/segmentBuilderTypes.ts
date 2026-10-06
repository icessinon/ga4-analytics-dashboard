/** ユーザーリスト抽出（/api/user/segment-builder）の型 */

export type SegmentOperator = 'EXACT' | 'CONTAINS' | 'BEGINS_WITH' | 'NOT_EQUAL'

export interface SegmentCondition {
    dimension: string
    operator: SegmentOperator
    value: string
}

export interface SegmentTotalStats {
    activeUsers: number
    sessions: number
    pageViews: number
    eventCount: number
    avgSessionDuration: number
    engagementRate: number
    bounceRate: number
    newUsers: number
}

export interface SegmentBreakdownRow {
    name: string
    activeUsers: number
    sessions: number
    pageViews: number
    engagementRate: number
}

export interface SegmentTrendRow {
    /** 'YYYY-MM-DD' */
    date: string
    activeUsers: number
    sessions: number
}

export interface SegmentBuilderReport {
    /** 条件に一致したユーザーがいなければ null */
    total: SegmentTotalStats | null
    /** 条件なし（サイト全体）のユーザー数。条件が 1 つもないときは null */
    siteTotalUsers: number | null
    /** 表示ラベル（デバイス / 流入元 / OS）→ 上位 20 件 */
    breakdowns: Record<string, SegmentBreakdownRow[]>
    trend: SegmentTrendRow[]
}

export interface SegmentBuilderResponse extends SegmentBuilderReport {
    success: true
    conditionCount: number
}
