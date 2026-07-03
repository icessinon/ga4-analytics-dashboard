import { NextResponse } from 'next/server'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'

const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const MONTHS_IN_TREND = 12

function parseBaseMonth(input?: string): { year: number; month: number } {
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

function emptyCvCount(): Record<CvKey, number> {
    return { applyCv: 0, lpApplyCv: 0, signupCv: 0 }
}

function cvDimensionFilter() {
    return {
        orGroup: {
            expressions: Object.values(CV_PAGE_PREFIXES).map((prefix) => ({
                filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: prefix } },
            })),
        },
    }
}

function cvKeyForPath(path: string): CvKey | null {
    for (const [key, prefix] of Object.entries(CV_PAGE_PREFIXES) as Array<[CvKey, string]>) {
        if (path.startsWith(prefix)) return key
    }
    return null
}

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

async function fetchMonthMetrics(propertyId: string, startDate: string, endDate: string, accessToken: string) {
    const [summary, pages, cvReport] = await Promise.all([
        fetchGA4Data({
            propertyId, dateRanges: [{ startDate, endDate }], dimensions: [],
            metrics: [
                { name: 'activeUsers' }, { name: 'newUsers' }, { name: 'sessions' },
                { name: 'engagementRate' }, { name: 'averageSessionDuration' }, { name: 'screenPageViews' }
            ], limit: 1
        }, accessToken),
        fetchGA4Data(Object.assign({
            propertyId, dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: 'pagePath' }],
            metrics: [{ name: 'screenPageViews' }],
            limit: 10
        }, { orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }] }), accessToken),
        fetchGA4Data(Object.assign({
            propertyId, dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: 'pagePath' }],
            metrics: [{ name: 'totalUsers' }, { name: 'screenPageViews' }],
            limit: 100
        }, { dimensionFilter: cvDimensionFilter() }), accessToken),
    ])

    const cv = { applyCv: { users: 0, pv: 0 }, lpApplyCv: { users: 0, pv: 0 }, signupCv: { users: 0, pv: 0 } }
    for (const r of cvReport.rows ?? []) {
        const key = cvKeyForPath(r.dimensionValues[0]?.value ?? '')
        if (!key) continue
        cv[key].users += parseInt(r.metricValues[0]?.value ?? '0', 10)
        cv[key].pv += parseInt(r.metricValues[1]?.value ?? '0', 10)
    }

    const row = summary.rows?.[0]
    return {
        startDate, endDate,
        activeUsers: parseInt(row?.metricValues[0]?.value ?? '0', 10),
        newUsers: parseInt(row?.metricValues[1]?.value ?? '0', 10),
        sessions: parseInt(row?.metricValues[2]?.value ?? '0', 10),
        engagementRate: parseFloat(row?.metricValues[3]?.value ?? '0'),
        avgSessionDuration: parseFloat(row?.metricValues[4]?.value ?? '0'),
        screenPageViews: parseInt(row?.metricValues[5]?.value ?? '0', 10),
        cv,
        topPages: (pages.rows ?? []).map((r) => ({
            path: r.dimensionValues[0]?.value ?? '',
            views: parseInt(r.metricValues[0]?.value ?? '0', 10),
        })),
    }
}

async function fetchWeeklyBreakdown(
    propertyId: string,
    monthStart: string,
    monthEnd: string,
    weeks: Array<{ label: string; startDate: string; endDate: string }>,
    accessToken: string
) {
    if (!weeks.length) return []

    const [daily, dailyCv] = await Promise.all([
        fetchGA4Data({
            propertyId,
            dateRanges: [{ startDate: monthStart, endDate: monthEnd }],
            dimensions: [{ name: 'date' }],
            metrics: [
                { name: 'activeUsers' },
                { name: 'sessions' },
                { name: 'engagedSessions' },
                { name: 'screenPageViews' },
            ],
            limit: 31,
        }, accessToken),
        fetchGA4Data(Object.assign({
            propertyId,
            dateRanges: [{ startDate: monthStart, endDate: monthEnd }],
            dimensions: [{ name: 'date' }, { name: 'pagePath' }],
            metrics: [{ name: 'totalUsers' }],
            limit: 3100,
        }, { dimensionFilter: cvDimensionFilter() }), accessToken),
    ])

    const cvByDate = new Map<string, Record<CvKey, number>>()
    for (const r of dailyCv.rows ?? []) {
        const d = r.dimensionValues[0]?.value ?? ''
        if (d.length !== 8) continue
        const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
        const key = cvKeyForPath(r.dimensionValues[1]?.value ?? '')
        if (!key) continue
        const bucket = cvByDate.get(date) ?? emptyCvCount()
        bucket[key] += parseInt(r.metricValues[0]?.value ?? '0', 10)
        cvByDate.set(date, bucket)
    }

    // GA4 returns date as YYYYMMDD — normalize to YYYY-MM-DD
    const rows = (daily.rows ?? []).map((r) => {
        const d = r.dimensionValues[0]?.value ?? ''
        return {
            date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
            activeUsers: parseInt(r.metricValues[0]?.value ?? '0', 10),
            sessions: parseInt(r.metricValues[1]?.value ?? '0', 10),
            engagedSessions: parseInt(r.metricValues[2]?.value ?? '0', 10),
            screenPageViews: parseInt(r.metricValues[3]?.value ?? '0', 10),
        }
    })

    return weeks.map((week) => {
        const weekRows = rows.filter((r) => r.date >= week.startDate && r.date <= week.endDate)
        const sessions = weekRows.reduce((s, r) => s + r.sessions, 0)
        const engagedSessions = weekRows.reduce((s, r) => s + r.engagedSessions, 0)
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
            activeUsers: weekRows.reduce((s, r) => s + r.activeUsers, 0),
            sessions,
            engagementRate: sessions > 0 ? engagedSessions / sessions : 0,
            screenPageViews: weekRows.reduce((s, r) => s + r.screenPageViews, 0),
            ...weekCv,
        }
    })
}

async function fetchMonthlyTrend(
    propertyId: string,
    baseYear: number,
    baseMonth: number,
    accessToken: string
) {
    const oldest = shiftMonth(baseYear, baseMonth, -(MONTHS_IN_TREND - 1))
    const trendStart = fmt(new Date(oldest.year, oldest.month, 1))
    const baseRange = getMonthRangeAt(baseYear, baseMonth)

    const [report, cvReport] = await Promise.all([
        fetchGA4Data(Object.assign({
            propertyId,
            dateRanges: [{ startDate: trendStart, endDate: baseRange.endDate }],
            dimensions: [{ name: 'yearMonth' }],
            metrics: [
                { name: 'activeUsers' },
                { name: 'newUsers' },
                { name: 'sessions' },
                { name: 'engagedSessions' },
                { name: 'screenPageViews' },
            ],
            limit: MONTHS_IN_TREND + 1,
        }, { orderBys: [{ dimension: { dimensionName: 'yearMonth' }, desc: false }] }), accessToken),
        fetchGA4Data(Object.assign({
            propertyId,
            dateRanges: [{ startDate: trendStart, endDate: baseRange.endDate }],
            dimensions: [{ name: 'yearMonth' }, { name: 'pagePath' }],
            metrics: [{ name: 'totalUsers' }],
            limit: (MONTHS_IN_TREND + 1) * 100,
        }, { dimensionFilter: cvDimensionFilter() }), accessToken),
    ])

    const cvByMonth = new Map<string, Record<CvKey, number>>()
    for (const r of cvReport.rows ?? []) {
        const ym = r.dimensionValues[0]?.value ?? ''
        if (ym.length !== 6) continue
        const key = cvKeyForPath(r.dimensionValues[1]?.value ?? '')
        if (!key) continue
        const bucket = cvByMonth.get(ym) ?? emptyCvCount()
        bucket[key] += parseInt(r.metricValues[0]?.value ?? '0', 10)
        cvByMonth.set(ym, bucket)
    }

    const byMonth = new Map<string, {
        activeUsers: number
        newUsers: number
        sessions: number
        engagedSessions: number
        screenPageViews: number
    }>()
    for (const row of report.rows ?? []) {
        const ym = row.dimensionValues[0]?.value ?? ''
        if (ym.length !== 6) continue
        byMonth.set(ym, {
            activeUsers: parseInt(row.metricValues[0]?.value ?? '0', 10),
            newUsers: parseInt(row.metricValues[1]?.value ?? '0', 10),
            sessions: parseInt(row.metricValues[2]?.value ?? '0', 10),
            engagedSessions: parseInt(row.metricValues[3]?.value ?? '0', 10),
            screenPageViews: parseInt(row.metricValues[4]?.value ?? '0', 10),
        })
    }

    const trend: Array<{
        label: string
        year: number
        month: number
        activeUsers: number
        newUsers: number
        sessions: number
        engagementRate: number
        screenPageViews: number
        applyCv: number
        lpApplyCv: number
        signupCv: number
    }> = []
    for (let i = MONTHS_IN_TREND - 1; i >= 0; i--) {
        const { year, month } = shiftMonth(baseYear, baseMonth, -i)
        const ymKey = `${year}${String(month + 1).padStart(2, '0')}`
        const label = `${year}-${String(month + 1).padStart(2, '0')}`
        const bucket = byMonth.get(ymKey)
        const cvBucket = cvByMonth.get(ymKey) ?? emptyCvCount()
        const sessions = bucket?.sessions ?? 0
        const engaged = bucket?.engagedSessions ?? 0
        trend.push({
            label,
            year,
            month: month + 1,
            activeUsers: bucket?.activeUsers ?? 0,
            newUsers: bucket?.newUsers ?? 0,
            sessions,
            engagementRate: sessions > 0 ? engaged / sessions : 0,
            screenPageViews: bucket?.screenPageViews ?? 0,
            ...cvBucket,
        })
    }
    return trend
}

export async function POST(request: Request) {
    try {
        const { propertyId, accessToken: customToken, baseMonth: baseMonthInput } = await request.json()
        if (!propertyId) return NextResponse.json({ error: 'propertyId is required' }, { status: 400 })
        const accessToken = await getGA4AccessToken(customToken)

        const now = new Date()
        const base = parseBaseMonth(baseMonthInput)
        const isCurrentMonth = base.year === now.getFullYear() && base.month === now.getMonth()

        const curRange = getMonthRangeAt(base.year, base.month)
        const prev = shiftMonth(base.year, base.month, -1)
        const prevRange = getMonthRangeAt(prev.year, prev.month)

        const curWeeks = getWeekRangesForMonth(curRange.year, curRange.month, isCurrentMonth)
        const prevWeeks = getWeekRangesForMonth(prevRange.year, prevRange.month, false)

        const [current, previous, curWeekly, prevWeekly, monthlyTrend] = await Promise.all([
            fetchMonthMetrics(propertyId, curRange.startDate, curRange.endDate, accessToken),
            fetchMonthMetrics(propertyId, prevRange.startDate, prevRange.endDate, accessToken),
            fetchWeeklyBreakdown(propertyId, curRange.startDate, curRange.endDate, curWeeks, accessToken),
            fetchWeeklyBreakdown(propertyId, prevRange.startDate, prevRange.endDate, prevWeeks, accessToken),
            fetchMonthlyTrend(propertyId, base.year, base.month, accessToken),
        ])

        return NextResponse.json({
            baseMonth: `${base.year}-${String(base.month + 1).padStart(2, '0')}`,
            isCurrentMonth,
            current,
            previous,
            weeklyBreakdown: { current: curWeekly, previous: prevWeekly },
            monthlyTrend,
        })
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
    }
}
