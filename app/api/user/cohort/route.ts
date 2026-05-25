import { NextResponse } from 'next/server'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { parseDateString } from '@/lib/utils/date'

function fmt(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(d: Date, n: number): Date {
    const r = new Date(d)
    r.setDate(r.getDate() + n)
    return r
}

// YYYYMMDD → Date
function parseGA4Date(s: string): Date {
    return new Date(
        parseInt(s.slice(0, 4)),
        parseInt(s.slice(4, 6)) - 1,
        parseInt(s.slice(6, 8))
    )
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


export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { propertyId, startDate, endDate, periods = 6, accessToken: customToken } = body

        if (!propertyId) {
            return NextResponse.json({ error: 'propertyId is required' }, { status: 400 })
        }

        const accessToken = await getGA4AccessToken(customToken)
        const parsedStart = parseDateString(startDate ?? (() => { const d = new Date(); d.setDate(d.getDate() - 77); return fmt(d) })())
        const parsedEnd   = parseDateString(endDate ?? fmt(new Date()))

        // firstSessionDate × date で取得 → 週を自前で計算
        const report = await fetchGA4Data(
            {
                propertyId,
                dateRanges: [{ startDate: parsedStart, endDate: parsedEnd }],
                dimensions: ['firstSessionDate', 'date'],
                metrics: ['activeUsers'],
                limit: 50000,
            },
            accessToken
        )

        console.log('[Cohort] rows:', report.rows?.length ?? 0)
        console.log('[Cohort] sample:', JSON.stringify(report.rows?.slice(0, 2)))

        // cohortMonday(Date) → { label, weekStart, weeks: Map<relativeWeek, users> }
        type CohortEntry = {
            label: string
            weekStart: string
            monday: Date
            weeks: Map<number, number>
        }
        const cohortMap = new Map<string, CohortEntry>()

        for (const row of report.rows ?? []) {
            const firstSessionDateStr = row.dimensionValues[0]?.value ?? ''
            const dateStr             = row.dimensionValues[1]?.value ?? ''
            const users               = parseInt(row.metricValues[0]?.value ?? '0', 10)

            if (!firstSessionDateStr || !dateStr) continue

            const firstDate      = parseGA4Date(firstSessionDateStr)
            const cohortMonday   = getMondayOf(firstDate)
            const cohortKey      = fmt(cohortMonday)

            const activityDate   = parseGA4Date(dateStr)
            const activityMonday = getMondayOf(activityDate)
            const relativeWeeks  = Math.round(
                (activityMonday.getTime() - cohortMonday.getTime()) / (7 * 86400000)
            )

            // 範囲外は無視
            if (relativeWeeks < 0 || relativeWeeks > periods) continue

            if (!cohortMap.has(cohortKey)) {
                cohortMap.set(cohortKey, {
                    label: weekLabel(cohortMonday),
                    weekStart: cohortKey,
                    monday: cohortMonday,
                    weeks: new Map(),
                })
            }
            const entry = cohortMap.get(cohortKey)!
            entry.weeks.set(relativeWeeks, (entry.weeks.get(relativeWeeks) ?? 0) + users)
        }

        // 最大 12 コホートに絞り、週次でソート
        const sorted = [...cohortMap.values()]
            .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
            .slice(-12)

        const result = sorted.map((entry) => {
            const totalUsers = entry.weeks.get(0) ?? 0
            const weeks: Record<number, { activeUsers: number; totalUsers: number; rate: number }> = {}
            for (let w = 0; w <= periods; w++) {
                const active = entry.weeks.get(w)
                if (active !== undefined) {
                    weeks[w] = {
                        activeUsers: active,
                        totalUsers,
                        rate: totalUsers > 0 ? active / totalUsers : 0,
                    }
                }
            }
            return {
                cohortName: entry.weekStart,
                label: entry.label,
                weekStart: entry.weekStart,
                weeks,
            }
        })

        return NextResponse.json({ success: true, cohorts: result, maxPeriods: periods })
    } catch (error) {
        console.error('Cohort API Error:', error)
        return NextResponse.json(
            { error: 'Failed to fetch cohort data', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
