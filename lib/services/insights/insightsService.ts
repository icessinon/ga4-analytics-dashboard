import { anyOf } from '@/lib/api/ga4/filters'
import type { Ga4Reporter } from '@/lib/api/ga4/report'
import { dim, metricFloat, metricInt, rowsOf } from '@/lib/api/ga4/rows'
import type { InsightsReport, MonthMetrics, MonthlyTrendPoint, WeekSummary } from './insightsTypes'

/**
 * 月次インサイト: 基準月の KPI・前月比較・週次内訳・過去 12 ヶ月トレンド。
 * reporter の期間は使わず、月ごとに withDateRanges で期間を差し替えて叩く。
 */

const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const MONTHS_IN_TREND = 12

export function parseBaseMonth(input?: string): { year: number; month: number } {
    const now = new Date()
    const current = { year: now.getFullYear(), month: now.getMonth() }
    if (!input) return current
    const match = /^(\d{4})-(\d{2})$/.exec(input)
    if (!match) return current
    const year = Number(match[1])
    const month = Number(match[2]) - 1
    if (month < 0 || month > 11) return current
    // 未来月は startDate > endDate の逆転レンジになるため現在月へクランプ
    if (year > current.year || (year === current.year && month > current.month)) return current
    return { year, month }
}

function getMonthRangeAt(year: number, month: number) {
    const now = new Date()
    const first = new Date(year, month, 1)
    const monthEnd = new Date(year, month + 1, 0)
    const isCurrentOrFuture = year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth())
    const last = isCurrentOrFuture && monthEnd > now ? now : monthEnd
    return { startDate: fmt(first), endDate: fmt(last), year, month }
}

function shiftMonth(year: number, month: number, delta: number) {
    const d = new Date(year, month + delta, 1)
    return { year: d.getFullYear(), month: d.getMonth() }
}

// x-work.jpのサンクスページ定義: 応募CV / LP応募CV / 会員登録CV
const CV_PAGE_PREFIXES = {
    applyCv: '/entry/thanks',
    lpApplyCv: '/lp-thanks',
    signupCv: '/members/signup/thanks',
} as const
type CvKey = keyof typeof CV_PAGE_PREFIXES

const emptyCvCount = (): Record<CvKey, number> => ({ applyCv: 0, lpApplyCv: 0, signupCv: 0 })
const cvDimensionFilter = () => anyOf('pagePath', Object.values(CV_PAGE_PREFIXES), 'BEGINS_WITH')

function cvKeyForPath(path: string): CvKey | null {
    for (const [key, prefix] of Object.entries(CV_PAGE_PREFIXES) as Array<[CvKey, string]>) {
        if (path.startsWith(prefix)) return key
    }
    return null
}

const ymd = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`

function getWeekRangesForMonth(year: number, month: number, capToday: boolean) {
    const now = new Date()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const weeks: Array<{ label: string; startDate: string; endDate: string }> = []

    for (let w = 0; w < 5; w++) {
        const startDay = w * 7 + 1
        if (startDay > daysInMonth) break
        const endDay = Math.min(startDay + 6, daysInMonth)
        const start = new Date(year, month, startDay)
        let end = new Date(year, month, endDay)
        if (capToday && end > now) end = now
        if (capToday && start > now) break
        weeks.push({ label: `第${w + 1}週`, startDate: fmt(start), endDate: fmt(end) })
    }
    return weeks
}

async function fetchMonthMetrics(reporter: Ga4Reporter, startDate: string, endDate: string): Promise<MonthMetrics> {
    const r = reporter.withDateRanges([{ startDate, endDate }])
    const [summary, pages, cvReport] = await r.runAll([
        { metrics: ['activeUsers', 'newUsers', 'sessions', 'engagementRate', 'averageSessionDuration', 'screenPageViews'], limit: 1 },
        { dimensions: ['pagePath'], metrics: ['screenPageViews'], limit: 10, orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }] },
        { dimensions: ['pagePath'], metrics: ['totalUsers', 'screenPageViews'], limit: 100, dimensionFilter: cvDimensionFilter() },
    ])

    const cv = { applyCv: { users: 0, pv: 0 }, lpApplyCv: { users: 0, pv: 0 }, signupCv: { users: 0, pv: 0 } }
    for (const row of rowsOf(cvReport)) {
        const key = cvKeyForPath(dim(row))
        if (!key) continue
        cv[key].users += metricInt(row, 0)
        cv[key].pv += metricInt(row, 1)
    }

    const row = rowsOf(summary)[0]
    return {
        startDate, endDate,
        activeUsers: row ? metricInt(row, 0) : 0,
        newUsers: row ? metricInt(row, 1) : 0,
        sessions: row ? metricInt(row, 2) : 0,
        engagementRate: row ? metricFloat(row, 3) : 0,
        avgSessionDuration: row ? metricFloat(row, 4) : 0,
        screenPageViews: row ? metricInt(row, 5) : 0,
        cv,
        topPages: rowsOf(pages).map((p) => ({ path: dim(p), views: metricInt(p) })),
    }
}

async function fetchWeeklyBreakdown(
    reporter: Ga4Reporter,
    monthStart: string,
    monthEnd: string,
    weeks: Array<{ label: string; startDate: string; endDate: string }>,
): Promise<WeekSummary[]> {
    if (!weeks.length) return []

    const r = reporter.withDateRanges([{ startDate: monthStart, endDate: monthEnd }])
    const [daily, dailyCv] = await r.runAll([
        { dimensions: ['date'], metrics: ['activeUsers', 'sessions', 'engagedSessions', 'screenPageViews'], limit: 31 },
        { dimensions: ['date', 'pagePath'], metrics: ['totalUsers'], limit: 3100, dimensionFilter: cvDimensionFilter() },
    ])

    const cvByDate = new Map<string, Record<CvKey, number>>()
    for (const row of rowsOf(dailyCv)) {
        const d = dim(row, 0)
        if (d.length !== 8) continue
        const key = cvKeyForPath(dim(row, 1))
        if (!key) continue
        const bucket = cvByDate.get(ymd(d)) ?? emptyCvCount()
        bucket[key] += metricInt(row)
        cvByDate.set(ymd(d), bucket)
    }

    // GA4 returns date as YYYYMMDD — normalize to YYYY-MM-DD
    const rows = rowsOf(daily).map((row) => ({
        date: ymd(dim(row)),
        activeUsers: metricInt(row, 0),
        sessions: metricInt(row, 1),
        engagedSessions: metricInt(row, 2),
        screenPageViews: metricInt(row, 3),
    }))

    return weeks.map((week) => {
        const weekRows = rows.filter((x) => x.date >= week.startDate && x.date <= week.endDate)
        const sessions = weekRows.reduce((s, x) => s + x.sessions, 0)
        const engagedSessions = weekRows.reduce((s, x) => s + x.engagedSessions, 0)
        const weekCv = emptyCvCount()
        for (const [date, bucket] of cvByDate) {
            if (date < week.startDate || date > week.endDate) continue
            weekCv.applyCv += bucket.applyCv
            weekCv.lpApplyCv += bucket.lpApplyCv
            weekCv.signupCv += bucket.signupCv
        }
        return {
            label: week.label,
            startDate: week.startDate,
            endDate: week.endDate,
            activeUsers: weekRows.reduce((s, x) => s + x.activeUsers, 0),
            sessions,
            engagementRate: sessions > 0 ? engagedSessions / sessions : 0,
            screenPageViews: weekRows.reduce((s, x) => s + x.screenPageViews, 0),
            ...weekCv,
        }
    })
}

async function fetchMonthlyTrend(reporter: Ga4Reporter, baseYear: number, baseMonth: number): Promise<MonthlyTrendPoint[]> {
    const oldest = shiftMonth(baseYear, baseMonth, -(MONTHS_IN_TREND - 1))
    const trendStart = fmt(new Date(oldest.year, oldest.month, 1))
    const baseRange = getMonthRangeAt(baseYear, baseMonth)

    const r = reporter.withDateRanges([{ startDate: trendStart, endDate: baseRange.endDate }])
    const [report, cvReport] = await r.runAll([
        {
            dimensions: ['yearMonth'],
            metrics: ['activeUsers', 'newUsers', 'sessions', 'engagedSessions', 'screenPageViews'],
            limit: MONTHS_IN_TREND + 1,
            orderBys: [{ dimension: { dimensionName: 'yearMonth' }, desc: false }],
        },
        { dimensions: ['yearMonth', 'pagePath'], metrics: ['totalUsers'], limit: (MONTHS_IN_TREND + 1) * 100, dimensionFilter: cvDimensionFilter() },
    ])

    const cvByMonth = new Map<string, Record<CvKey, number>>()
    for (const row of rowsOf(cvReport)) {
        const ym = dim(row, 0)
        if (ym.length !== 6) continue
        const key = cvKeyForPath(dim(row, 1))
        if (!key) continue
        const bucket = cvByMonth.get(ym) ?? emptyCvCount()
        bucket[key] += metricInt(row)
        cvByMonth.set(ym, bucket)
    }

    const byMonth = new Map<string, { activeUsers: number; newUsers: number; sessions: number; engagedSessions: number; screenPageViews: number }>()
    for (const row of rowsOf(report)) {
        const ym = dim(row)
        if (ym.length !== 6) continue
        byMonth.set(ym, {
            activeUsers: metricInt(row, 0),
            newUsers: metricInt(row, 1),
            sessions: metricInt(row, 2),
            engagedSessions: metricInt(row, 3),
            screenPageViews: metricInt(row, 4),
        })
    }

    const trend: MonthlyTrendPoint[] = []
    for (let i = MONTHS_IN_TREND - 1; i >= 0; i--) {
        const { year, month } = shiftMonth(baseYear, baseMonth, -i)
        const ymKey = `${year}${String(month + 1).padStart(2, '0')}`
        const bucket = byMonth.get(ymKey)
        const sessions = bucket?.sessions ?? 0
        const engaged = bucket?.engagedSessions ?? 0
        trend.push({
            label: `${year}-${String(month + 1).padStart(2, '0')}`,
            year,
            month: month + 1,
            activeUsers: bucket?.activeUsers ?? 0,
            newUsers: bucket?.newUsers ?? 0,
            sessions,
            engagementRate: sessions > 0 ? engaged / sessions : 0,
            screenPageViews: bucket?.screenPageViews ?? 0,
            ...(cvByMonth.get(ymKey) ?? emptyCvCount()),
        })
    }
    return trend
}

export async function runInsightsReport(reporter: Ga4Reporter, baseMonthInput?: string): Promise<InsightsReport> {
    const now = new Date()
    const base = parseBaseMonth(baseMonthInput)
    const isCurrentMonth = base.year === now.getFullYear() && base.month === now.getMonth()

    const curRange = getMonthRangeAt(base.year, base.month)
    const prev = shiftMonth(base.year, base.month, -1)
    const prevRange = getMonthRangeAt(prev.year, prev.month)

    const curWeeks = getWeekRangesForMonth(curRange.year, curRange.month, isCurrentMonth)
    const prevWeeks = getWeekRangesForMonth(prevRange.year, prevRange.month, false)

    const [current, previous, curWeekly, prevWeekly, monthlyTrend] = await Promise.all([
        fetchMonthMetrics(reporter, curRange.startDate, curRange.endDate),
        fetchMonthMetrics(reporter, prevRange.startDate, prevRange.endDate),
        fetchWeeklyBreakdown(reporter, curRange.startDate, curRange.endDate, curWeeks),
        fetchWeeklyBreakdown(reporter, prevRange.startDate, prevRange.endDate, prevWeeks),
        fetchMonthlyTrend(reporter, base.year, base.month),
    ])

    return {
        baseMonth: `${base.year}-${String(base.month + 1).padStart(2, '0')}`,
        isCurrentMonth,
        current,
        previous,
        weeklyBreakdown: { current: curWeekly, previous: prevWeekly },
        monthlyTrend,
    }
}
