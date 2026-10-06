import type { Ga4Reporter } from '@/lib/api/ga4/report'
import { dim, metricInt, rowsOf } from '@/lib/api/ga4/rows'
import type { CohortRow, CohortWeekData } from './cohortTypes'

export function fmtLocalDate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(d: Date, n: number): Date {
    const r = new Date(d)
    r.setDate(r.getDate() + n)
    return r
}

// YYYYMMDD → Date
function parseGA4Date(s: string): Date {
    return new Date(parseInt(s.slice(0, 4)), parseInt(s.slice(4, 6)) - 1, parseInt(s.slice(6, 8)))
}

// Date → その週の月曜日
function getMondayOf(d: Date): Date {
    const day = d.getDay()
    const diff = day === 0 ? -6 : 1 - day
    return addDays(d, diff)
}

// Date → "YYYY-Www" ラベル
function weekLabel(d: Date): string {
    const monday = getMondayOf(d)
    const y = monday.getFullYear()
    const jan4 = new Date(y, 0, 4)
    const firstMonday = getMondayOf(jan4)
    const weekNo = Math.round((monday.getTime() - firstMonday.getTime()) / (7 * 86400000)) + 1
    return `${y}-W${String(weekNo).padStart(2, '0')}`
}

/**
 * 初回訪問週ごとの週次リテンション。
 * firstSessionDate × date で取得し、週（月曜起点）は自前で計算する。最大 12 コホート。
 */
export async function runCohortReport(reporter: Ga4Reporter, periods: number): Promise<CohortRow[]> {
    const report = await reporter.run({
        dimensions: ['firstSessionDate', 'date'],
        metrics: ['activeUsers'],
        limit: 50000,
    })

    type CohortEntry = { label: string; weekStart: string; monday: Date; weeks: Map<number, number> }
    const cohortMap = new Map<string, CohortEntry>()

    for (const row of rowsOf(report)) {
        const firstSessionDateStr = dim(row, 0)
        const dateStr = dim(row, 1)
        const users = metricInt(row)
        if (!firstSessionDateStr || !dateStr) continue

        const cohortMonday = getMondayOf(parseGA4Date(firstSessionDateStr))
        const cohortKey = fmtLocalDate(cohortMonday)
        const activityMonday = getMondayOf(parseGA4Date(dateStr))
        const relativeWeeks = Math.round((activityMonday.getTime() - cohortMonday.getTime()) / (7 * 86400000))

        // 範囲外は無視
        if (relativeWeeks < 0 || relativeWeeks > periods) continue

        if (!cohortMap.has(cohortKey)) {
            cohortMap.set(cohortKey, { label: weekLabel(cohortMonday), weekStart: cohortKey, monday: cohortMonday, weeks: new Map() })
        }
        const entry = cohortMap.get(cohortKey)!
        entry.weeks.set(relativeWeeks, (entry.weeks.get(relativeWeeks) ?? 0) + users)
    }

    // 最大 12 コホートに絞り、週次でソート
    const sorted = [...cohortMap.values()]
        .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
        .slice(-12)

    return sorted.map((entry) => {
        const totalUsers = entry.weeks.get(0) ?? 0
        const weeks: Record<number, CohortWeekData> = {}
        for (let w = 0; w <= periods; w++) {
            const active = entry.weeks.get(w)
            if (active !== undefined) {
                weeks[w] = { activeUsers: active, totalUsers, rate: totalUsers > 0 ? active / totalUsers : 0 }
            }
        }
        return { cohortName: entry.weekStart, label: entry.label, weekStart: entry.weekStart, weeks }
    })
}
