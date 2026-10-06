/**
 * ページ別指標の期間計算。サーバー（route）とクライアント（app/dashboard/utils.ts）で同じ式を使う。
 * 日付文字列はローカル日時の年月日で作る（以前は toISOString で UTC に切っており、JST では 1 日前にずれていた）。
 */

import type { Granularity } from './pageMetricsTypes'

export interface IsoDateRange {
    startDate: string
    endDate: string
}

const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** 'YYYY-MM' → その月の 1 日〜末日 */
export function monthToRange(month: string): IsoDateRange {
    const [y, m] = month.split('-').map(Number)
    return { startDate: fmt(new Date(y, m - 1, 1)), endDate: fmt(new Date(y, m, 0)) }
}

/**
 * 集計単位に応じた期間。daily はその月、weekly は月末から 84 日前、monthly は前年同月から
 */
export function rangeForGranularity(month: string, granularity: Granularity): IsoDateRange {
    const [y, m] = month.split('-').map(Number)
    if (granularity === 'monthly') {
        return { startDate: fmt(new Date(y - 1, m - 1, 1)), endDate: fmt(new Date(y, m, 0)) }
    }
    if (granularity === 'weekly') {
        const end = new Date(y, m, 0)
        const start = new Date(end)
        start.setDate(start.getDate() - 84)
        return { startDate: fmt(start), endDate: fmt(end) }
    }
    return monthToRange(month)
}

export function parseGranularity(value: unknown): Granularity {
    return value === 'weekly' ? 'weekly' : value === 'monthly' ? 'monthly' : 'daily'
}
