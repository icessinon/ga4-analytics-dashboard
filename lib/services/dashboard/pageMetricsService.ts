/**
 * トップの「ページ別指標」。1 ページの PV / CV / 離脱率 / 新規訪問率 / 直帰数 / 平均滞在時間と、
 * その日別・週別・月別の推移を GA4 から集計する。
 *
 * 離脱率は GA4 の exitRate ではなく、エンゲージメントファネル（time_on_page）の
 * 「10 秒以上滞在のうち 30 秒未満で離脱」を優先し、取れないときだけ exitRate に倒す。
 * ※ サーバー専用。クライアントは pageMetricsTypes を参照すること
 */

import type { Ga4Reporter, Ga4ReportSpec } from '@/lib/api/ga4/report'
import type { GA4ReportResponse } from '@/lib/api/ga4/client'
import { and, exact } from '@/lib/api/ga4/filters'
import { dim, metricFloat, rowsOf } from '@/lib/api/ga4/rows'
import { fetchEngagementExitRateSeries, fetchEngagementFunnelData } from '@/lib/services/funnel/engagementFunnelService'
import type { ResolvedCvConfig } from './pageCvConfig'
import type { Granularity, PageMetrics, PageMetricsSeriesPoint } from './pageMetricsTypes'

const EXIT_RATE_NOTE = '10秒以上滞在のうち30秒未満で離脱'

/** 比率系はプロパティによって 0〜1 と 0〜100 のどちらでも返るので、1 以下なら百分率に直す */
const toPct = (raw: number) => (raw <= 1 ? raw * 100 : raw)

function formatDuration(sec: number): string {
    if (sec >= 3600) return `${Math.floor(sec / 3600)}時間${Math.floor((sec % 3600) / 60)}分`
    if (sec >= 60) return `${Math.floor(sec / 60)}分${Math.round(sec % 60)}秒`
    return `${Math.round(sec)}秒`
}

/** engagementRate / bounceRate が無効なプロパティ向けに、失敗したら比率抜きで取り直す */
async function runWithFallback(reporter: Ga4Reporter, full: Ga4ReportSpec, base: Ga4ReportSpec): Promise<GA4ReportResponse> {
    try {
        return await reporter.run(full)
    } catch {
        return reporter.run(base)
    }
}

/** 指標名 → 値（ヘッダ順に依存しない） */
function metricsByName(report: GA4ReportResponse, row: GA4ReportResponse['rows'][number]): Record<string, number> {
    const values: Record<string, number> = {}
    ;(report.metricHeaders ?? []).forEach((h, i) => {
        values[h.name ?? ''] = metricFloat(row, i)
    })
    return values
}

/** PageCvConfig で定義された CV イベントの件数。未設定・失敗・0 行は null */
async function countCvEvents(reporter: Ga4Reporter, pagePath: string, cv: ResolvedCvConfig, extraDims: string[] = [], limit = 1): Promise<GA4ReportResponse | null> {
    if (!cv.cvEventName) return null
    try {
        return await reporter.run({
            dimensions: ['pagePath', ...extraDims],
            metrics: ['eventCount'],
            dimensionFilter: and(exact('pagePath', pagePath), exact(cv.cvDimension, cv.cvEventName)),
            limit,
        })
    } catch {
        return null
    }
}

async function resolveExitRate(reporter: Ga4Reporter, pagePath: string): Promise<{ exitRate: number | null; exitRateNote?: string }> {
    const { propertyId, accessToken, dateRanges } = reporter.ctx
    const { startDate, endDate } = dateRanges[0]
    try {
        const engagement = await fetchEngagementFunnelData(propertyId, startDate, endDate, accessToken)
        const row = engagement.rows.find((r) => r.pagePath === pagePath)
        if (row && row.baseUsers > 0) {
            const users30 = row.milestones['30秒以上滞在']?.users ?? 0
            return { exitRate: ((row.baseUsers - users30) / row.baseUsers) * 100, exitRateNote: EXIT_RATE_NOTE }
        }
    } catch {
        /* エンゲージメントファネルが取れないときは GA4 の exitRate に倒す */
    }
    try {
        const report = await reporter.run({
            dimensions: ['pagePath'],
            metrics: ['exitRate'],
            dimensionFilter: exact('pagePath', pagePath),
            limit: 1,
        })
        const row = rowsOf(report)[0]
        if (row?.metricValues?.[0]) return { exitRate: toPct(metricFloat(row, 0)) }
    } catch {
        /* 取れなければ null */
    }
    return { exitRate: null }
}

const FULL_METRICS = ['screenPageViews', 'conversions', 'sessions', 'totalUsers', 'newUsers', 'engagementRate', 'bounceRate', 'averageSessionDuration']
const BASE_METRICS = ['screenPageViews', 'conversions', 'sessions', 'totalUsers', 'newUsers', 'averageSessionDuration']

export async function runPageMetrics(reporter: Ga4Reporter, pagePath: string, cv: ResolvedCvConfig): Promise<PageMetrics> {
    const spec = (metrics: string[]): Ga4ReportSpec => ({
        dimensions: ['pagePath'],
        metrics,
        dimensionFilter: exact('pagePath', pagePath),
        limit: 1,
    })
    const report = await runWithFallback(reporter, spec(FULL_METRICS), spec(BASE_METRICS))
    const row = rowsOf(report)[0]
    const hasRow = !!row && (row.metricValues?.length ?? 0) > 0

    const cvReport = await countCvEvents(reporter, pagePath, cv)
    const cvRow = rowsOf(cvReport)[0]
    const cvFromEvent = cvRow?.metricValues?.[0] ? Math.round(metricFloat(cvRow, 0)) : null

    const { exitRate, exitRateNote } = await resolveExitRate(reporter, pagePath)
    const cvFields = {
        cvEventName: cv.cvEventName ?? undefined,
        cvDimension: cv.cvEventName ? cv.cvDimension : undefined,
    }

    if (!hasRow) {
        return {
            pv: 0,
            cv: cvFromEvent ?? 0,
            cvr: 0,
            sessions: 0,
            newUsers: 0,
            newUserRate: 0,
            bounceRate: 0,
            bounceCount: 0,
            exitRate,
            exitRateNote,
            averageSessionDurationSeconds: 0,
            averageSessionDurationLabel: '0秒',
            engagementRate: 0,
            ...cvFields,
        }
    }

    const values = metricsByName(report, row)
    const pv = Math.round(values.screenPageViews ?? 0)
    const cvCount = cvFromEvent ?? Math.round(values.conversions ?? 0)
    const sessions = Math.round(values.sessions ?? 0)
    const totalUsers = Math.round(values.totalUsers ?? 0)
    const newUsers = Math.round(values.newUsers ?? 0)
    const avgSec = values.averageSessionDuration ?? 0
    const engagementRate = toPct(values.engagementRate ?? 0)
    const bounceRate = toPct(values.bounceRate ?? 0)

    return {
        pv,
        cv: cvCount,
        cvr: pv > 0 ? (cvCount / pv) * 100 : 0,
        sessions,
        newUsers,
        newUserRate: totalUsers > 0 ? (newUsers / totalUsers) * 100 : 0,
        bounceRate,
        bounceCount: Math.round(sessions * (bounceRate / 100)),
        exitRate,
        exitRateNote,
        averageSessionDurationSeconds: avgSec,
        averageSessionDurationLabel: formatDuration(avgSec),
        engagementRate,
        ...cvFields,
    }
}

// ── 時系列 ──

const SERIES_FULL_METRICS = ['screenPageViews', 'conversions', 'sessions', 'newUsers', 'bounceRate', 'averageSessionDuration', 'engagementRate']
const SERIES_BASE_METRICS = ['screenPageViews', 'conversions', 'sessions', 'newUsers', 'averageSessionDuration']

interface PeriodAgg {
    pv: number
    cv: number
    sessions: number
    newUsers: number
    bounceRateSessionSum: number
    avgDurSessionSum: number
    engagementSessionSum: number
    exitRate?: number
}

const emptyAgg = (): PeriodAgg => ({ pv: 0, cv: 0, sessions: 0, newUsers: 0, bounceRateSessionSum: 0, avgDurSessionSum: 0, engagementSessionSum: 0 })

/** GA4 の date（YYYYMMDD）を、週別ならその週の日曜日（YYYY-MM-DD）に丸める */
function periodKeyOf(value: string, granularity: Granularity): string {
    if (granularity !== 'weekly' || value.length !== 8) return value
    const date = new Date(parseInt(value.slice(0, 4), 10), parseInt(value.slice(4, 6), 10) - 1, parseInt(value.slice(6, 8), 10))
    const sun = new Date(date)
    sun.setDate(date.getDate() - date.getDay())
    return `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, '0')}-${String(sun.getDate()).padStart(2, '0')}`
}

function labelOf(key: string, granularity: Granularity): string {
    if (key.length === 8 && granularity === 'daily') return `${key.slice(4, 6)}/${key.slice(6, 8)}`
    if (key.length === 6 && granularity === 'monthly') return `${key.slice(0, 4)}/${key.slice(4, 6)}`
    if (key.length === 10 && granularity === 'weekly') return `Wk ${key.slice(5, 7)}/${key.slice(8, 10)}`
    return key
}

export async function runPageMetricsSeries(reporter: Ga4Reporter, pagePath: string, granularity: Granularity, cv: ResolvedCvConfig): Promise<PageMetricsSeriesPoint[]> {
    const periodDim = granularity === 'monthly' ? 'yearMonth' : 'date'
    const spec = (metrics: string[]): Ga4ReportSpec => ({
        dimensions: ['pagePath', periodDim],
        metrics,
        dimensionFilter: exact('pagePath', pagePath),
        limit: 366,
    })
    const report = await runWithFallback(reporter, spec(SERIES_FULL_METRICS), spec(SERIES_BASE_METRICS))

    const headers = report.metricHeaders ?? []
    const idx = (name: string) => headers.findIndex((h) => h.name === name)
    const pvIdx = idx('screenPageViews')
    const cvIdx = idx('conversions')
    const sessIdx = idx('sessions')
    const newUsersIdx = idx('newUsers')
    const bounceRateIdx = idx('bounceRate')
    const avgDurIdx = idx('averageSessionDuration')
    const engagementIdx = idx('engagementRate')

    const byPeriod: Record<string, PeriodAgg> = {}
    for (const row of rowsOf(report)) {
        const periodVal = dim(row, 1)
        if (!periodVal) continue
        const key = periodKeyOf(periodVal, granularity)
        const agg = (byPeriod[key] ??= emptyAgg())
        const sessions = Math.round(metricFloat(row, sessIdx))
        agg.pv += Math.round(metricFloat(row, pvIdx))
        agg.cv += Math.round(metricFloat(row, cvIdx))
        agg.sessions += sessions
        if (newUsersIdx >= 0) agg.newUsers += Math.round(metricFloat(row, newUsersIdx))
        if (sessions > 0) {
            // 比率はセッション加重で合算し、最後にセッション数で割る
            if (bounceRateIdx >= 0) agg.bounceRateSessionSum += (metricFloat(row, bounceRateIdx) / 100) * sessions
            if (avgDurIdx >= 0) agg.avgDurSessionSum += metricFloat(row, avgDurIdx) * sessions
            if (engagementIdx >= 0) agg.engagementSessionSum += (metricFloat(row, engagementIdx) / 100) * sessions
        }
    }

    // 離脱率: 10秒以上滞在のうち30秒未満で離脱（エンゲージメントファネル）を日・週・月で取得
    try {
        const { propertyId, accessToken, dateRanges } = reporter.ctx
        const exitRates = await fetchEngagementExitRateSeries(propertyId, dateRanges[0].startDate, dateRanges[0].endDate, pagePath, granularity, accessToken)
        for (const [key, rate] of Object.entries(exitRates)) {
            if (byPeriod[key]) byPeriod[key].exitRate = rate
        }
    } catch {
        /* 取れなければ exitRate なし */
    }

    if (cv.cvEventName) {
        for (const agg of Object.values(byPeriod)) agg.cv = 0
        const cvReport = await countCvEvents(reporter, pagePath, cv, [periodDim], 366)
        if (cvReport) {
            const evIdx = Math.max(0, cvReport.metricHeaders?.findIndex((h) => h.name === 'eventCount') ?? 0)
            for (const row of rowsOf(cvReport)) {
                const periodVal = dim(row, 1)
                if (!periodVal) continue
                const key = periodKeyOf(periodVal, granularity)
                const agg = (byPeriod[key] ??= emptyAgg())
                agg.cv += Math.round(metricFloat(row, evIdx))
            }
        }
    }

    return Object.keys(byPeriod).sort().map((key) => {
        const v = byPeriod[key]
        const sessions = v.sessions || 0
        const bounceRate = sessions > 0 ? (v.bounceRateSessionSum / sessions) * 100 : 0
        return {
            period: key,
            label: labelOf(key, granularity),
            pv: v.pv,
            cv: v.cv,
            sessions: v.sessions,
            cvr: v.pv > 0 ? (v.cv / v.pv) * 100 : 0,
            newUsers: v.newUsers,
            newUserRate: sessions > 0 ? (v.newUsers / sessions) * 100 : 0,
            bounceRate,
            bounceCount: Math.round(sessions * (bounceRate / 100)),
            averageSessionDuration: sessions > 0 ? v.avgDurSessionSum / sessions : 0,
            engagementRate: sessions > 0 ? (v.engagementSessionSum / sessions) * 100 : 0,
            ...(v.exitRate != null && { exitRate: v.exitRate }),
        }
    })
}
