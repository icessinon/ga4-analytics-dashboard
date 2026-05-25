import { NextResponse } from 'next/server'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { parseDateString } from '@/lib/utils/date'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const {
            propertyId,
            startDate,
            endDate,
            accessToken: customToken,
            // セグメント条件
            deviceCategory,
            browser,
            operatingSystem,
            country,
            sessionSource,
            sessionMedium,
        } = body

        if (!propertyId) {
            return NextResponse.json({ error: 'propertyId is required' }, { status: 400 })
        }

        const accessToken = await getGA4AccessToken(customToken)
        const parsedStart = parseDateString(startDate || '30daysAgo')
        const parsedEnd   = parseDateString(endDate   || 'today')

        // セグメント条件からdimensionFilterを構築
        const filterExpressions: Record<string, unknown>[] = []
        const addFilter = (field: string, value: string) => {
            if (value && value !== '(not set)') {
                filterExpressions.push({
                    filter: { fieldName: field, stringFilter: { matchType: 'EXACT', value } },
                })
            }
        }
        addFilter('deviceCategory',   deviceCategory   ?? '')
        addFilter('browser',          browser          ?? '')
        addFilter('operatingSystem',  operatingSystem  ?? '')
        addFilter('country',          country          ?? '')
        addFilter('sessionSource',    sessionSource    ?? '')
        addFilter('sessionMedium',    sessionMedium    ?? '')

        const dimensionFilter = filterExpressions.length > 0
            ? filterExpressions.length === 1
                ? filterExpressions[0]
                : { andGroup: { expressions: filterExpressions } }
            : undefined

        const report = await fetchGA4Data(
            {
                propertyId,
                dateRanges: [{ startDate: parsedStart, endDate: parsedEnd }],
                dimensions: ['date', 'hour', 'eventName', 'pagePath', 'pageTitle', 'sessionSource', 'deviceCategory'],
                metrics: ['eventCount', 'activeUsers'],
                ...(dimensionFilter ? { dimensionFilter } : {}),
                limit: 10000,
            },
            accessToken
        )

        const events = (report.rows ?? [])
            .map((row) => {
                const d = row.dimensionValues
                const date         = d[0]?.value ?? ''
                const hour         = d[1]?.value ?? '0'
                const eventName    = d[2]?.value ?? ''
                const pagePath     = d[3]?.value ?? ''
                const pageTitle    = d[4]?.value ?? ''
                const sessionSource = d[5]?.value ?? ''
                const deviceCategory = d[6]?.value ?? ''
                const eventCount   = parseInt(row.metricValues[0]?.value ?? '0', 10)
                const userCount    = parseInt(row.metricValues[1]?.value ?? '0', 10)

                const dateLabel = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`
                const timeLabel = `${String(hour).padStart(2,'0')}:00`
                const sortKey   = `${date}${String(hour).padStart(2,'0')}`

                return { sortKey, date: dateLabel, time: timeLabel, eventName, pagePath, pageTitle, sessionSource, deviceCategory, eventCount, userCount }
            })
            .sort((a, b) => a.sortKey.localeCompare(b.sortKey))

        return NextResponse.json({ success: true, events, total: events.length })
    } catch (error) {
        console.error('User Timeline API Error:', error)
        return NextResponse.json(
            { error: 'Failed to fetch timeline', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
