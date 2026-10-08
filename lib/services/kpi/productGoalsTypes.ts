/** プロダクト目標（/api/product-goals）の型。クライアントは import type でここを参照する */

import type { GoalMetricKey } from '@/lib/constants/businessGoals'

export interface ProductGoal {
    id: number
    productId: number
    /** 自動カウントの対象。GOAL_METRICS のキー */
    metricKey: GoalMetricKey
    label: string
    note: string | null
    /** 期末の目標値 */
    target: number
    /** 比重（%）。使わないなら null */
    weight: number | null
    /** 月別の目安 { 'YYYY-MM': 値 } */
    milestones: Record<string, number>
    sortOrder: number
}

export interface ProductGoalsResponse {
    success: true
    goals: ProductGoal[]
    /** 目標が無かったので初期テンプレートから作った */
    seeded: boolean
}

/** 保存する 1 件。id があれば更新、無ければ新規 */
export interface ProductGoalInput {
    id?: number
    metricKey: string
    label: string
    note?: string | null
    target: number
    weight?: number | null
    milestones?: Record<string, number>
    sortOrder?: number
}
