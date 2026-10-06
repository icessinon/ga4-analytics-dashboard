import type { Ga4Reporter } from '@/lib/api/ga4/report'
import { dim, metricInt, rowsOf } from '@/lib/api/ga4/rows'
import type { StickinessResult } from './stickinessTypes'

/**
 * DAU / WAU / MAU の推移とスティッキネス（DAU÷MAU）。
 * 期間は reporter に入っているもの（比較期間は withDateRanges で別 reporter を作って呼ぶ）。
 */
export async function runStickinessReport(reporter: Ga4Reporter): Promise<StickinessResult> {
    const [q1, q2, q3] = await reporter.runAll([
        { dimensions: ['date'], metrics: ['activeUsers'], limit: 90 },
        { dimensions: ['date'], metrics: ['active7DayUsers', 'active28DayUsers'], limit: 90 },
        { metrics: ['activeUsers', 'newUsers', 'sessions'], limit: 1 },
    ])

    const dauMap = new Map<string, number>()
    for (const row of rowsOf(q1)) {
        const date = dim(row)
        if (date) dauMap.set(date, metricInt(row))
    }

    const rollingMap = new Map<string, { wau: number; mau: number }>()
    for (const row of rowsOf(q2)) {
        const date = dim(row)
        if (date) rollingMap.set(date, { wau: metricInt(row, 0), mau: metricInt(row, 1) })
    }

    const allDates = new Set([...dauMap.keys(), ...rollingMap.keys()])
    const dailySeries = [...allDates].sort().map((rawDate) => {
        const date = rawDate.length === 8
            ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
            : rawDate
        const rolling = rollingMap.get(rawDate)
        return { date, dau: dauMap.get(rawDate) ?? 0, wau: rolling?.wau ?? 0, mau: rolling?.mau ?? 0 }
    })

    const avgDAU = dailySeries.length > 0
        ? Math.round(dailySeries.reduce((s, d) => s + d.dau, 0) / dailySeries.length)
        : 0

    const q3Row = rowsOf(q3)[0]
    const totalMAU = q3Row ? metricInt(q3Row, 0) : 0
    const totalNewUsers = q3Row ? metricInt(q3Row, 1) : 0
    const totalSessions = q3Row ? metricInt(q3Row, 2) : 0
    const avgSessionsPerUser = totalMAU > 0 ? Math.round((totalSessions / totalMAU) * 10) / 10 : 0
    const stickinessDAUMAU = totalMAU > 0 ? avgDAU / totalMAU : 0
    const lastDay = dailySeries[dailySeries.length - 1]
    const stickinessWAUMAU = lastDay && lastDay.mau > 0 ? lastDay.wau / lastDay.mau : 0

    return { dailySeries, avgDAU, totalMAU, totalNewUsers, avgSessionsPerUser, stickinessDAUMAU, stickinessWAUMAU }
}
