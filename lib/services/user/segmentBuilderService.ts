import { and, stringFilter, type Ga4FilterExpression, type Ga4MatchType } from '@/lib/api/ga4/filters'
import type { Ga4Reporter, Ga4ReportSpec } from '@/lib/api/ga4/report'
import type { GA4ReportResponse } from '@/lib/api/ga4/client'
import { dim, metricFloat, rowsOf, type Ga4Row } from '@/lib/api/ga4/rows'
import type { SegmentBuilderReport, SegmentCondition } from './segmentBuilderTypes'

function buildFilter(conditions: SegmentCondition[]): Ga4FilterExpression | undefined {
    if (!conditions.length) return undefined
    // NOT_EQUAL はここに来る前に EXACT へ読み替えられている
    return and(...conditions.map((c) => stringFilter(c.dimension, c.operator as Ga4MatchType, c.value, false)))
}

const BREAKDOWN_DIMENSIONS = [
    { key: 'deviceCategory', label: 'デバイス' },
    { key: 'sessionSource', label: '流入元' },
    { key: 'operatingSystem', label: 'OS' },
]

const METRICS = ['activeUsers', 'sessions', 'screenPageViews', 'eventCount', 'averageSessionDuration', 'engagementRate', 'bounceRate', 'newUsers']

const mv = (row: Ga4Row | undefined, idx: number) => (row ? metricFloat(row, idx) : 0)
const EMPTY: GA4ReportResponse = { dimensionHeaders: [], metricHeaders: [], rows: [], rowCount: 0 }

/**
 * AND 条件で絞ったセグメントの集計・内訳・日別推移。
 *
 * NOT_EQUAL は GA4 API が andGroup 内で拒否するため、
 * 「等値条件のみ」と「等値 + NOT_EQUAL を EXACT で絞ったもの」の 2 クエリの差分で近似する。
 */
export async function runSegmentBuilderReport(reporter: Ga4Reporter, conditions: SegmentCondition[]): Promise<SegmentBuilderReport> {
    const equalConds = conditions.filter((c) => c.operator !== 'NOT_EQUAL')
    const notEqualConds = conditions.filter((c) => c.operator === 'NOT_EQUAL')
    const hasNotEqual = notEqualConds.length > 0

    const equalFilter = buildFilter(equalConds)
    const excludeFilter = hasNotEqual
        ? buildFilter([...equalConds, ...notEqualConds.map((c) => ({ ...c, operator: 'EXACT' as const }))])
        : undefined

    // 条件に国が含まれる場合はデフォルトの country=Japan フィルタと競合させない
    const includeAllCountries = conditions.some((c) => c.dimension === 'country')
    const ga4 = (extra: Pick<Ga4ReportSpec, 'dimensions' | 'limit'>, dimensionFilter?: Ga4FilterExpression) =>
        reporter.run({ ...extra, metrics: METRICS, dimensionFilter, includeAllCountries })
    const none = Promise.resolve(EMPTY)

    // ── 全体集計 ──
    const [totalReport, excludedTotalReport, siteTotalReport] = await Promise.all([
        ga4({ limit: 1 }, equalFilter),
        hasNotEqual ? ga4({ limit: 1 }, excludeFilter) : none,
        // フィルターなしのサイト全体（セグメントの割合計算用）
        conditions.length > 0 ? ga4({ limit: 1 }, undefined) : none,
    ])

    const tRow = rowsOf(totalReport)[0]
    const eRow = hasNotEqual ? rowsOf(excludedTotalReport)[0] : undefined

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

    const siteRow = rowsOf(siteTotalReport)[0]
    const siteTotalUsers = siteRow ? Math.round(mv(siteRow, 0)) : null

    // ── ブレイクダウン ──
    const breakdowns: SegmentBuilderReport['breakdowns'] = {}
    await Promise.all(
        BREAKDOWN_DIMENSIONS.map(async ({ key, label }) => {
            const [report, exReport] = await Promise.all([
                ga4({ dimensions: [key], limit: 20 }, equalFilter),
                hasNotEqual ? ga4({ dimensions: [key], limit: 20 }, excludeFilter) : none,
            ])
            const exMap = new Map<string, Ga4Row>()
            for (const row of rowsOf(exReport)) exMap.set(dim(row) || '(not set)', row)

            breakdowns[label] = rowsOf(report)
                .map((row) => {
                    const name = dim(row) || '(not set)'
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
        ga4({ dimensions: ['date'], limit: 90 }, equalFilter),
        hasNotEqual ? ga4({ dimensions: ['date'], limit: 90 }, excludeFilter) : none,
    ])
    const exTrendMap = new Map<string, Ga4Row>()
    for (const row of rowsOf(exTrendReport)) exTrendMap.set(dim(row), row)

    const trend = rowsOf(trendReport)
        .map((row) => {
            const d = dim(row)
            const ex = exTrendMap.get(d)
            return {
                date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
                activeUsers: Math.max(0, Math.round(mv(row, 0)) - Math.round(mv(ex, 0))),
                sessions: Math.max(0, Math.round(mv(row, 1)) - Math.round(mv(ex, 1))),
            }
        })
        .sort((a, b) => a.date.localeCompare(b.date))

    return { total, siteTotalUsers, breakdowns, trend }
}
