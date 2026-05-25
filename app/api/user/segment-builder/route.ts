import { NextResponse } from 'next/server'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { parseDateString } from '@/lib/utils/date'

export interface SegmentCondition {
    dimension: string
    operator: 'EXACT' | 'CONTAINS' | 'BEGINS_WITH' | 'NOT_EQUAL'
    value: string
}

type GA4Row = { dimensionValues: { value?: string }[]; metricValues: { value?: string }[] }
type GA4Report = { rows?: GA4Row[] }

function buildFilter(conditions: SegmentCondition[]): Record<string, unknown> | undefined {
    if (!conditions.length) return undefined

    const expressions = conditions.map((c) => ({
        filter: {
            fieldName: c.dimension,
            stringFilter: {
                matchType: c.operator,
                value: c.value,
                caseSensitive: false,
            },
        },
    }))

    if (expressions.length === 1) return expressions[0]
    return { andGroup: { expressions } }
}

const BREAKDOWN_DIMENSIONS = [
    { key: 'deviceCategory', label: 'デバイス' },
    { key: 'sessionSource', label: '流入元' },
    { key: 'operatingSystem', label: 'OS' },
]

const mv = (row: GA4Row | undefined, idx: number) =>
    parseFloat(row?.metricValues?.[idx]?.value ?? '0')

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const {
            propertyId,
            conditions = [],
            startDate: reqStart,
            endDate: reqEnd,
            accessToken: customToken,
        } = body

        if (!propertyId) {
            return NextResponse.json({ error: 'propertyId is required' }, { status: 400 })
        }

        const accessToken = await getGA4AccessToken(customToken)

        const fmt = (d: Date) =>
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const defaultEnd = fmt(new Date())
        const defaultStart = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return fmt(d) })()

        const startDate = parseDateString(reqStart ?? defaultStart)
        const endDate = parseDateString(reqEnd ?? defaultEnd)

        const allConds = conditions as SegmentCondition[]
        const equalConds = allConds.filter((c) => c.operator !== 'NOT_EQUAL')
        const notEqualConds = allConds.filter((c) => c.operator === 'NOT_EQUAL')
        const hasNotEqual = notEqualConds.length > 0

        // NOT_EQUAL は GA4 API が andGroup 内で拒否するため、
        // 「等値条件のみ」と「等値+NOT_EQUALをEXACTで絞ったもの」の2クエリ差分で近似する
        const equalFilter = buildFilter(equalConds)
        const excludeFilter = hasNotEqual
            ? buildFilter([
                  ...equalConds,
                  ...notEqualConds.map((c) => ({ ...c, operator: 'EXACT' as const })),
              ])
            : undefined

        const baseMetrics = [
            { name: 'activeUsers' },
            { name: 'sessions' },
            { name: 'screenPageViews' },
            { name: 'eventCount' },
            { name: 'averageSessionDuration' },
            { name: 'engagementRate' },
            { name: 'bounceRate' },
            { name: 'newUsers' },
        ]

        const baseRequest = {
            propertyId,
            dateRanges: [{ startDate, endDate }],
            metrics: baseMetrics,
        }

        const ga4 = async (extra: Record<string, unknown>, filter?: Record<string, unknown>) =>
            fetchGA4Data({ ...baseRequest, ...extra, dimensionFilter: filter }, accessToken) as Promise<GA4Report>

        // ── 全体集計 ──
        const [totalReport, excludedTotalReport, siteTotalReport] = await Promise.all([
            ga4({ dimensions: [], limit: 1 }, equalFilter),
            hasNotEqual ? ga4({ dimensions: [], limit: 1 }, excludeFilter) : Promise.resolve({ rows: [] as GA4Row[] }),
            // フィルターなしのサイト全体（セグメントの割合計算用）
            allConds.length > 0 ? ga4({ dimensions: [], limit: 1 }, undefined) : Promise.resolve({ rows: [] as GA4Row[] }),
        ])

        const tRow = totalReport.rows?.[0]
        const eRow = hasNotEqual ? excludedTotalReport.rows?.[0] : undefined

        const netSessions = Math.max(0, Math.round(mv(tRow, 1)) - Math.round(mv(eRow, 1)))
        const netEngaged = mv(tRow, 5) * mv(tRow, 1) - mv(eRow, 5) * mv(eRow, 1)
        const netBounce = mv(tRow, 6) * mv(tRow, 1) - mv(eRow, 6) * mv(eRow, 1)
        const netDuration = mv(tRow, 4) * mv(tRow, 1) - mv(eRow, 4) * mv(eRow, 1)

        const total = tRow
            ? {
                  activeUsers: Math.max(0, Math.round(mv(tRow, 0)) - Math.round(mv(eRow, 0))),
                  sessions: netSessions,
                  pageViews: Math.max(0, Math.round(mv(tRow, 2)) - Math.round(mv(eRow, 2))),
                  eventCount: Math.max(0, Math.round(mv(tRow, 3)) - Math.round(mv(eRow, 3))),
                  avgSessionDuration: netSessions > 0 ? netDuration / netSessions : 0,
                  engagementRate: netSessions > 0 ? netEngaged / netSessions : 0,
                  bounceRate: netSessions > 0 ? netBounce / netSessions : 0,
                  newUsers: Math.max(0, Math.round(mv(tRow, 7)) - Math.round(mv(eRow, 7))),
              }
            : null

        const siteTotalUsers = siteTotalReport.rows?.[0]
            ? Math.round(mv(siteTotalReport.rows[0], 0))
            : null

        // ── ブレイクダウン ──
        const breakdowns: Record<string, Array<{ name: string; activeUsers: number; sessions: number; pageViews: number; engagementRate: number }>> = {}

        await Promise.all(
            BREAKDOWN_DIMENSIONS.map(async ({ key, label }) => {
                const [report, exReport] = await Promise.all([
                    ga4({ dimensions: [{ name: key }], limit: 20 }, equalFilter),
                    hasNotEqual
                        ? ga4({ dimensions: [{ name: key }], limit: 20 }, excludeFilter)
                        : Promise.resolve({ rows: [] as GA4Row[] }),
                ])

                const exMap = new Map<string, GA4Row>()
                for (const row of exReport.rows ?? []) {
                    exMap.set(row.dimensionValues[0]?.value ?? '(not set)', row)
                }

                breakdowns[label] = (report.rows ?? [])
                    .map((row) => {
                        const name = row.dimensionValues[0]?.value ?? '(not set)'
                        const ex = exMap.get(name)
                        const s = mv(row, 1)
                        const exS = mv(ex, 1)
                        const netS = Math.max(0, Math.round(s) - Math.round(exS))
                        const netEng = mv(row, 5) * s - mv(ex, 5) * exS
                        return {
                            name,
                            activeUsers: Math.max(0, Math.round(mv(row, 0)) - Math.round(mv(ex, 0))),
                            sessions: netS,
                            pageViews: Math.max(0, Math.round(mv(row, 2)) - Math.round(mv(ex, 2))),
                            engagementRate: netS > 0 ? netEng / netS : 0,
                        }
                    })
                    .filter((r) => r.activeUsers > 0)
                    .sort((a, b) => b.activeUsers - a.activeUsers)
            })
        )

        // ── 日別トレンド ──
        const [trendReport, exTrendReport] = await Promise.all([
            ga4({ dimensions: [{ name: 'date' }], limit: 90 }, equalFilter),
            hasNotEqual
                ? ga4({ dimensions: [{ name: 'date' }], limit: 90 }, excludeFilter)
                : Promise.resolve({ rows: [] as GA4Row[] }),
        ])

        const exTrendMap = new Map<string, GA4Row>()
        for (const row of exTrendReport.rows ?? []) {
            exTrendMap.set(row.dimensionValues[0]?.value ?? '', row)
        }

        const trend = (trendReport.rows ?? [])
            .map((row) => {
                const d = row.dimensionValues[0]?.value ?? ''
                const ex = exTrendMap.get(d)
                return {
                    date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
                    activeUsers: Math.max(0, Math.round(mv(row, 0)) - Math.round(mv(ex, 0))),
                    sessions: Math.max(0, Math.round(mv(row, 1)) - Math.round(mv(ex, 1))),
                }
            })
            .sort((a, b) => a.date.localeCompare(b.date))

        return NextResponse.json({
            success: true,
            total,
            siteTotalUsers,
            breakdowns,
            trend,
            conditionCount: conditions.length,
        })
    } catch (error) {
        console.error('Segment Builder API Error:', error)
        return NextResponse.json(
            { error: 'セグメント分析に失敗しました', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
