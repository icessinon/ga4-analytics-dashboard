import { NextResponse } from 'next/server'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'

const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function getMonthRange(offsetMonths: number) {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() - offsetMonths
    const first = new Date(year, month, 1)
    const last = offsetMonths === 0 ? now : new Date(year, month + 1, 0)
    return { startDate: fmt(first), endDate: fmt(last), year, month: ((month % 12) + 12) % 12 }
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
    const [summary, pages] = await Promise.all([
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
    ])
    const row = summary.rows?.[0]
    return {
        startDate, endDate,
        activeUsers: parseInt(row?.metricValues[0]?.value ?? '0', 10),
        newUsers: parseInt(row?.metricValues[1]?.value ?? '0', 10),
        sessions: parseInt(row?.metricValues[2]?.value ?? '0', 10),
        engagementRate: parseFloat(row?.metricValues[3]?.value ?? '0'),
        avgSessionDuration: parseFloat(row?.metricValues[4]?.value ?? '0'),
        screenPageViews: parseInt(row?.metricValues[5]?.value ?? '0', 10),
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

    const daily = await fetchGA4Data({
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
    }, accessToken)

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
        return {
            label: week.label,
            startDate: week.startDate,
            endDate: week.endDate,
            activeUsers: weekRows.reduce((s, r) => s + r.activeUsers, 0),
            sessions,
            engagementRate: sessions > 0 ? engagedSessions / sessions : 0,
            screenPageViews: weekRows.reduce((s, r) => s + r.screenPageViews, 0),
        }
    })
}

export async function POST(request: Request) {
    try {
        const { propertyId, accessToken: customToken } = await request.json()
        if (!propertyId) return NextResponse.json({ error: 'propertyId is required' }, { status: 400 })
        const accessToken = await getGA4AccessToken(customToken)

        const curRange = getMonthRange(0)
        const prevRange = getMonthRange(1)

        const curWeeks = getWeekRangesForMonth(curRange.year, curRange.month, true)
        const prevWeeks = getWeekRangesForMonth(prevRange.year, prevRange.month, false)

        const [current, previous, curWeekly, prevWeekly] = await Promise.all([
            fetchMonthMetrics(propertyId, curRange.startDate, curRange.endDate, accessToken),
            fetchMonthMetrics(propertyId, prevRange.startDate, prevRange.endDate, accessToken),
            fetchWeeklyBreakdown(propertyId, curRange.startDate, curRange.endDate, curWeeks, accessToken),
            fetchWeeklyBreakdown(propertyId, prevRange.startDate, prevRange.endDate, prevWeeks, accessToken),
        ])

        return NextResponse.json({
            current,
            previous,
            weeklyBreakdown: { current: curWeekly, previous: prevWeekly },
        })
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
    }
}
