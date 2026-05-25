import { NextResponse } from 'next/server'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'

interface DailyPoint { date: string; dau: number; wau: number; mau: number }
interface StickinessResult {
    dailySeries: DailyPoint[]
    avgDAU: number
    totalMAU: number
    totalNewUsers: number
    avgSessionsPerUser: number
    stickinessDAUMAU: number
    stickinessWAUMAU: number
}

async function fetchStickiness(
    propertyId: string,
    startDate: string,
    endDate: string,
    accessToken: string
): Promise<StickinessResult> {
    const [q1, q2, q3] = await Promise.all([
        fetchGA4Data(
            { propertyId, dateRanges: [{ startDate, endDate }], dimensions: [{ name: 'date' }], metrics: [{ name: 'activeUsers' }], limit: 90 },
            accessToken
        ),
        fetchGA4Data(
            { propertyId, dateRanges: [{ startDate, endDate }], dimensions: [{ name: 'date' }], metrics: [{ name: 'active7DayUsers' }, { name: 'active28DayUsers' }], limit: 90 },
            accessToken
        ),
        fetchGA4Data(
            { propertyId, dateRanges: [{ startDate, endDate }], dimensions: [], metrics: [{ name: 'activeUsers' }, { name: 'newUsers' }, { name: 'sessions' }], limit: 1 },
            accessToken
        ),
    ])

    const dauMap = new Map<string, number>()
    for (const row of q1.rows ?? []) {
        const date = row.dimensionValues[0]?.value ?? ''
        const dau = parseInt(row.metricValues[0]?.value ?? '0', 10)
        if (date) dauMap.set(date, dau)
    }

    const rollingMap = new Map<string, { wau: number; mau: number }>()
    for (const row of q2.rows ?? []) {
        const date = row.dimensionValues[0]?.value ?? ''
        const wau = parseInt(row.metricValues[0]?.value ?? '0', 10)
        const mau = parseInt(row.metricValues[1]?.value ?? '0', 10)
        if (date) rollingMap.set(date, { wau, mau })
    }

    const allDates = new Set([...dauMap.keys(), ...rollingMap.keys()])
    const dailySeries = [...allDates].sort().map((rawDate) => {
        const date = rawDate.length === 8
            ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
            : rawDate
        const dau = dauMap.get(rawDate) ?? 0
        const rolling = rollingMap.get(rawDate)
        return { date, dau, wau: rolling?.wau ?? 0, mau: rolling?.mau ?? 0 }
    })

    const avgDAU = dailySeries.length > 0
        ? Math.round(dailySeries.reduce((s, d) => s + d.dau, 0) / dailySeries.length)
        : 0

    const q3Row = q3.rows?.[0]
    const totalMAU = parseInt(q3Row?.metricValues[0]?.value ?? '0', 10)
    const totalNewUsers = parseInt(q3Row?.metricValues[1]?.value ?? '0', 10)
    const totalSessions = parseInt(q3Row?.metricValues[2]?.value ?? '0', 10)
    const avgSessionsPerUser = totalMAU > 0 ? Math.round((totalSessions / totalMAU) * 10) / 10 : 0
    const stickinessDAUMAU = totalMAU > 0 ? avgDAU / totalMAU : 0
    const lastDay = dailySeries[dailySeries.length - 1]
    const stickinessWAUMAU = lastDay && lastDay.mau > 0 ? lastDay.wau / lastDay.mau : 0

    return { dailySeries, avgDAU, totalMAU, totalNewUsers, avgSessionsPerUser, stickinessDAUMAU, stickinessWAUMAU }
}

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { propertyId, startDate, endDate, compareStartDate, compareEndDate, accessToken: customToken } = body

        if (!propertyId) return NextResponse.json({ error: 'propertyId is required' }, { status: 400 })
        if (!startDate || !endDate) return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 })

        const accessToken = await getGA4AccessToken(customToken)

        const hasCompare = !!(compareStartDate && compareEndDate)

        const [current, compare] = await Promise.all([
            fetchStickiness(propertyId, startDate, endDate, accessToken),
            hasCompare ? fetchStickiness(propertyId, compareStartDate, compareEndDate, accessToken) : Promise.resolve(null),
        ])

        return NextResponse.json({ success: true, current, compare })
    } catch (error) {
        console.error('Stickiness API Error:', error)
        return NextResponse.json(
            { error: 'Failed to fetch stickiness data', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
