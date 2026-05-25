import { NextResponse } from 'next/server'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { parseDateString } from '@/lib/utils/date'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { propertyId, startDate, endDate, accessToken: customToken, limit = 10000 } = body

        if (!propertyId) {
            return NextResponse.json({ error: 'propertyId is required' }, { status: 400 })
        }

        const accessToken = await getGA4AccessToken(customToken)
        const parsedStart = parseDateString(startDate || '30daysAgo')
        const parsedEnd = parseDateString(endDate || 'today')

        const report = await fetchGA4Data(
            {
                propertyId,
                dateRanges: [{ startDate: parsedStart, endDate: parsedEnd }],
                dimensions: [
                    'deviceCategory',
                    'browser',
                    'operatingSystem',
                    'country',
                    'sessionSource',
                    'sessionMedium',
                    'date',
                ],
                metrics: ['activeUsers', 'sessions', 'screenPageViews', 'eventCount'],
                limit,
            },
            accessToken
        )

        // date ごとに集計し、セグメントごとの最新日・合計を計算
        type Segment = {
            deviceCategory: string
            browser: string
            operatingSystem: string
            country: string
            sessionSource: string
            sessionMedium: string
            lastDate: string
            totalUsers: number
            totalSessions: number
            totalPageViews: number
            totalEvents: number
        }

        const segmentMap = new Map<string, Segment>()

        for (const row of report.rows ?? []) {
            const d = row.dimensionValues
            const m = row.metricValues
            const device   = d[0]?.value ?? ''
            const browser  = d[1]?.value ?? ''
            const os       = d[2]?.value ?? ''
            const country  = d[3]?.value ?? ''
            const source   = d[4]?.value ?? ''
            const medium   = d[5]?.value ?? ''
            const date     = d[6]?.value ?? ''
            const users    = parseInt(m[0]?.value ?? '0', 10)
            const sessions = parseInt(m[1]?.value ?? '0', 10)
            const pvs      = parseInt(m[2]?.value ?? '0', 10)
            const events   = parseInt(m[3]?.value ?? '0', 10)

            const key = `${device}|${browser}|${os}|${country}|${source}|${medium}`
            const existing = segmentMap.get(key)

            if (!existing) {
                segmentMap.set(key, { deviceCategory: device, browser, operatingSystem: os, country, sessionSource: source, sessionMedium: medium, lastDate: date, totalUsers: users, totalSessions: sessions, totalPageViews: pvs, totalEvents: events })
            } else {
                existing.totalUsers    += users
                existing.totalSessions += sessions
                existing.totalPageViews += pvs
                existing.totalEvents   += events
                if (date > existing.lastDate) existing.lastDate = date
            }
        }

        const segments = [...segmentMap.values()]
            .sort((a, b) => b.totalUsers - a.totalUsers)
            .map((s) => ({
                ...s,
                lastDate: s.lastDate
                    ? `${s.lastDate.slice(0,4)}-${s.lastDate.slice(4,6)}-${s.lastDate.slice(6,8)}`
                    : '',
            }))

        return NextResponse.json({ success: true, segments, total: segments.length })
    } catch (error) {
        console.error('User List API Error:', error)
        return NextResponse.json(
            { error: 'Failed to fetch user list', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
