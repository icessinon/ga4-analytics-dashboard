/** コホートリテンション（/api/user/cohort）のレスポンス型 */

export interface CohortWeekData {
    activeUsers: number
    /** Week 0 のユーザー数（分母） */
    totalUsers: number
    rate: number
}

export interface CohortRow {
    /** 'YYYY-MM-DD'（週の月曜） */
    cohortName: string
    /** 'YYYY-Www' */
    label: string
    weekStart: string
    /** 相対週 → 値。データが無い週はキーが無い */
    weeks: Record<number, CohortWeekData>
}

export interface CohortResponse {
    success: true
    cohorts: CohortRow[]
    maxPeriods: number
}
