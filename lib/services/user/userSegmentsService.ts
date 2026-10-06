import { and, exact } from '@/lib/api/ga4/filters'
import type { Ga4Reporter } from '@/lib/api/ga4/report'
import { dim, metricInt, rowsOf } from '@/lib/api/ga4/rows'
import type { UserSegment, UserSegmentFilter, UserTimelineEvent } from './userSegmentsTypes'

const SEGMENT_DIMENSIONS = ['deviceCategory', 'browser', 'operatingSystem', 'country', 'sessionSource', 'sessionMedium'] as const

/** デバイス × ブラウザ × OS × 国 × 流入元 のセグメント一覧（日別行を畳んで合計・最終日を出す） */
export async function runUserSegmentList(reporter: Ga4Reporter, limit: number): Promise<UserSegment[]> {
    const report = await reporter.run({
        dimensions: [...SEGMENT_DIMENSIONS, 'date'],
        metrics: ['activeUsers', 'sessions', 'screenPageViews', 'eventCount'],
        limit,
    })

    const segmentMap = new Map<string, UserSegment>()
    for (const row of rowsOf(report)) {
        const [device, browser, os, country, source, medium, date] = SEGMENT_DIMENSIONS.map((_, i) => dim(row, i)).concat(dim(row, 6))
        const users = metricInt(row, 0)
        const sessions = metricInt(row, 1)
        const pvs = metricInt(row, 2)
        const events = metricInt(row, 3)

        const key = `${device}|${browser}|${os}|${country}|${source}|${medium}`
        const existing = segmentMap.get(key)
        if (!existing) {
            segmentMap.set(key, {
                deviceCategory: device, browser, operatingSystem: os, country, sessionSource: source, sessionMedium: medium,
                lastDate: date, totalUsers: users, totalSessions: sessions, totalPageViews: pvs, totalEvents: events,
            })
        } else {
            existing.totalUsers += users
            existing.totalSessions += sessions
            existing.totalPageViews += pvs
            existing.totalEvents += events
            if (date > existing.lastDate) existing.lastDate = date
        }
    }

    return [...segmentMap.values()]
        .sort((a, b) => b.totalUsers - a.totalUsers)
        .map((s) => ({
            ...s,
            lastDate: s.lastDate ? `${s.lastDate.slice(0, 4)}-${s.lastDate.slice(4, 6)}-${s.lastDate.slice(6, 8)}` : '',
        }))
}

/** GA4 Data API は 1 リクエストあたり（出力＋フィルタで）9 ディメンションまで */
const GA4_MAX_DIMENSIONS = 9

/**
 * セグメント条件に一致するイベントを日時順に。国を指定したときは既定の country=Japan を外す。
 *
 * 6 属性すべてが埋まったセグメントだと出力 7 列＋条件 6 で 11 ディメンションになり GA4 に弾かれる
 * （以前からの不具合）。9 に収まるときはリクエストを変えず、超えるときだけ
 * pageTitle → sessionMedium 条件 → hour の順に落として収める。
 */
export async function runUserTimeline(reporter: Ga4Reporter, filter: UserSegmentFilter): Promise<UserTimelineEvent[]> {
    const activeFilters = SEGMENT_DIMENSIONS.filter((field) => {
        const value = filter[field] ?? ''
        return value && value !== '(not set)'
    })
    const outputDims = ['date', 'hour', 'eventName', 'pagePath', 'pageTitle', 'sessionSource', 'deviceCategory']
    const dropOrder: Array<{ kind: 'dim' | 'filter'; name: string }> = [
        { kind: 'dim', name: 'pageTitle' },
        { kind: 'filter', name: 'sessionMedium' },
        { kind: 'dim', name: 'hour' },
    ]
    const filters = [...activeFilters] as string[]
    const dims = [...outputDims]
    const uniqueCount = () => new Set([...dims, ...filters]).size
    for (const d of dropOrder) {
        if (uniqueCount() <= GA4_MAX_DIMENSIONS) break
        if (d.kind === 'dim') dims.splice(dims.indexOf(d.name), dims.indexOf(d.name) >= 0 ? 1 : 0)
        else if (filters.includes(d.name)) filters.splice(filters.indexOf(d.name), 1)
    }

    const expressions = filters.map((field) => exact(field, filter[field as keyof UserSegmentFilter] as string))
    const dimensionFilter = expressions.length > 0 ? and(...expressions) : undefined

    const report = await reporter.run({
        dimensions: dims,
        metrics: ['eventCount', 'activeUsers'],
        dimensionFilter,
        includeAllCountries: Boolean(filter.country && filter.country !== '(not set)'),
        limit: 10000,
    })

    const at = (row: Parameters<typeof dim>[0], name: string) => {
        const i = dims.indexOf(name)
        return i >= 0 ? dim(row, i) : ''
    }

    return rowsOf(report)
        .map((row) => {
            const date = at(row, 'date')
            const hour = at(row, 'hour') || '0'
            const hh = String(hour).padStart(2, '0')
            return {
                sortKey: `${date}${hh}`,
                date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
                time: `${hh}:00`,
                eventName: at(row, 'eventName'),
                pagePath: at(row, 'pagePath'),
                pageTitle: at(row, 'pageTitle'),
                sessionSource: at(row, 'sessionSource'),
                deviceCategory: at(row, 'deviceCategory'),
                eventCount: metricInt(row, 0),
                userCount: metricInt(row, 1),
            }
        })
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
}
