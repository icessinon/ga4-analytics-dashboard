/**
 * ページパスの時系列（日別・週別・月別）を返す
 */

import { NextResponse } from 'next/server'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { fetchEngagementExitRateSeries } from '@/lib/services/funnel/engagementFunnelService'
import { createErrorResponse } from '@/lib/utils/error'

function parseMonth(month: string): { y: number; m: number } {
    const [y, m] = month.split('-').map(Number)
    return { y, m }
}

function getRangeForGranularity(month: string, granularity: string): { startDate: string; endDate: string } {
    const { y, m } = parseMonth(month)
    const format = (d: Date) => d.toISOString().slice(0, 10)
    if (granularity === 'monthly') {
        const start = new Date(y - 1, m - 1, 1)
        const end = new Date(y, m, 0)
        return { startDate: format(start), endDate: format(end) }
    }
    if (granularity === 'weekly') {
        const end = new Date(y, m, 0)
        const start = new Date(end)
        start.setDate(start.getDate() - 84)
        return { startDate: format(start), endDate: format(end) }
    }
    const start = new Date(y, m - 1, 1)
    const end = new Date(y, m, 0)
    return { startDate: format(start), endDate: format(end) }
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}))
        const {
            propertyId,
            productId,
            pagePath,
            month,
            startDate: startParam,
            endDate: endParam,
            granularity,
            accessToken: customToken,
        } = body

        if (!propertyId || !pagePath) {
            return NextResponse.json(
                { error: 'propertyId and pagePath are required' },
                { status: 400 }
            )
        }

        const token = await getGA4AccessToken(customToken)
        const gran = granularity === 'weekly' ? 'weekly' : granularity === 'monthly' ? 'monthly' : 'daily'
        let startDate: string
        let endDate: string
        if (startParam && endParam && /^\d{4}-\d{2}-\d{2}$/.test(startParam) && /^\d{4}-\d{2}-\d{2}$/.test(endParam)) {
            startDate = startParam
            endDate = endParam
        } else if (month && /^\d{4}-\d{2}$/.test(month)) {
            const range = getRangeForGranularity(month, gran)
            startDate = range.startDate
            endDate = range.endDate
        } else {
            return NextResponse.json(
                { error: 'Either month (YYYY-MM) or startDate and endDate (YYYY-MM-DD) are required' },
                { status: 400 }
            )
        }

        let cvEventName: string | null = null
        let cvDimension = 'eventName'
        if (productId != null) {
            try {
                const { prisma } = await import('@/lib/db/client')
                const pageCvConfig = prisma ? (prisma as unknown as { pageCvConfig: { findUnique: (args: { where: { productId_pagePath: { productId: number; pagePath: string } } }) => Promise<{ cvEventName: string; cvDimension: string | null } | null> } }).pageCvConfig : null
                if (pageCvConfig) {
                    const config = await pageCvConfig.findUnique({
                        where: { productId_pagePath: { productId: Number(productId), pagePath } },
                    })
                    cvEventName = config?.cvEventName ?? null
                    if (config?.cvDimension && ['eventName', 'customEvent:click_label', 'customEvent:view_label'].includes(config.cvDimension)) {
                        cvDimension = config.cvDimension
                    }
                }
            } catch {
            }
        }

        const dimensionFilter = {
            filter: {
                fieldName: 'pagePath',
                stringFilter: { matchType: 'EXACT' as const, value: pagePath },
            },
        }

        const dimName = gran === 'monthly' ? 'yearMonth' : 'date'
        const fullMetrics = [
            { name: 'screenPageViews' },
            { name: 'conversions' },
            { name: 'sessions' },
            { name: 'newUsers' },
            { name: 'bounceRate' },
            { name: 'averageSessionDuration' },
            { name: 'engagementRate' },
        ]
        const baseMetrics = [
            { name: 'screenPageViews' },
            { name: 'conversions' },
            { name: 'sessions' },
            { name: 'newUsers' },
            { name: 'averageSessionDuration' },
        ]
        let report: Awaited<ReturnType<typeof fetchGA4Data>>
        try {
            report = await fetchGA4Data(
                {
                    propertyId,
                    dateRanges: [{ startDate, endDate }],
                    dimensions: [{ name: 'pagePath' }, { name: dimName }],
                    metrics: fullMetrics,
                    dimensionFilter,
                    limit: 366,
                },
                token
            )
        } catch {
            report = await fetchGA4Data(
                {
                    propertyId,
                    dateRanges: [{ startDate, endDate }],
                    dimensions: [{ name: 'pagePath' }, { name: dimName }],
                    metrics: baseMetrics,
                    dimensionFilter,
                    limit: 366,
                },
                token
            )
        }

        const rows = report.rows ?? []
        const metricHeaders = report.metricHeaders ?? []
        const pvIdx = metricHeaders.findIndex((h) => h.name === 'screenPageViews')
        const cvIdx = metricHeaders.findIndex((h) => h.name === 'conversions')
        const sessIdx = metricHeaders.findIndex((h) => h.name === 'sessions')
        const newUsersIdx = metricHeaders.findIndex((h) => h.name === 'newUsers')
        const bounceRateIdx = metricHeaders.findIndex((h) => h.name === 'bounceRate')
        const avgDurIdx = metricHeaders.findIndex((h) => h.name === 'averageSessionDuration')
        const engagementIdx = metricHeaders.findIndex((h) => h.name === 'engagementRate')

        type PeriodAgg = { pv: number; cv: number; sessions: number; newUsers: number; bounceRateSessionSum: number; avgDurSessionSum: number; engagementSessionSum: number; exitRate?: number }
        const byPeriod: Record<string, PeriodAgg> = {}

        for (const row of rows) {
            const periodVal = row.dimensionValues?.[1]?.value ?? ''
            if (!periodVal) continue
            let periodKey = periodVal
            if (gran === 'weekly' && dimName === 'date') {
                const d = periodVal
                const year = parseInt(d.slice(0, 4), 10)
                const month = parseInt(d.slice(4, 6), 10)
                const day = parseInt(d.slice(6, 8), 10)
                const date = new Date(year, month - 1, day)
                const sun = new Date(date)
                sun.setDate(date.getDate() - date.getDay())
                periodKey = `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, '0')}-${String(sun.getDate()).padStart(2, '0')}`
            }
            if (!byPeriod[periodKey]) byPeriod[periodKey] = { pv: 0, cv: 0, sessions: 0, newUsers: 0, bounceRateSessionSum: 0, avgDurSessionSum: 0, engagementSessionSum: 0 }
            const pv = Math.round(parseFloat(row.metricValues?.[pvIdx]?.value ?? '0') || 0)
            const cv = Math.round(parseFloat(row.metricValues?.[cvIdx]?.value ?? '0') || 0)
            const sessions = Math.round(parseFloat(row.metricValues?.[sessIdx]?.value ?? '0') || 0)
            byPeriod[periodKey].pv += pv
            byPeriod[periodKey].cv += cv
            byPeriod[periodKey].sessions += sessions
            if (newUsersIdx >= 0) byPeriod[periodKey].newUsers += Math.round(parseFloat(row.metricValues?.[newUsersIdx]?.value ?? '0') || 0)
            if (bounceRateIdx >= 0 && sessions > 0) {
                const br = parseFloat(row.metricValues?.[bounceRateIdx]?.value ?? '0') || 0
                byPeriod[periodKey].bounceRateSessionSum += (br / 100) * sessions
            }
            if (avgDurIdx >= 0 && sessions > 0) {
                const ad = parseFloat(row.metricValues?.[avgDurIdx]?.value ?? '0') || 0
                byPeriod[periodKey].avgDurSessionSum += ad * sessions
            }
            if (engagementIdx >= 0 && sessions > 0) {
                const er = parseFloat(row.metricValues?.[engagementIdx]?.value ?? '0') || 0
                byPeriod[periodKey].engagementSessionSum += (er / 100) * sessions
            }
        }

        // 離脱率: 10秒以上滞在のうち30秒未満で離脱（エンゲージメントファネル）を日・週・月で取得
        try {
            const engagementExitRates = await fetchEngagementExitRateSeries(propertyId, startDate, endDate, pagePath, gran, token)
            for (const [periodKey, rate] of Object.entries(engagementExitRates)) {
                if (byPeriod[periodKey]) byPeriod[periodKey].exitRate = rate
            }
        } catch {
        }

        if (cvEventName && token) {
            for (const k of Object.keys(byPeriod)) byPeriod[k].cv = 0
            try {
                const cvReport = await fetchGA4Data(
                    {
                        propertyId,
                        dateRanges: [{ startDate, endDate }],
                        dimensions: [{ name: 'pagePath' }, { name: dimName }],
                        metrics: [{ name: 'eventCount' }],
                        dimensionFilter: {
                            andGroup: {
                                expressions: [
                                    { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'EXACT', value: pagePath } } },
                                    { filter: { fieldName: cvDimension, stringFilter: { matchType: 'EXACT', value: cvEventName } } },
                                ],
                            },
                        },
                        limit: 366,
                    },
                    token
                )
                const cvRows = cvReport.rows ?? []
                const evIdx = cvReport.metricHeaders?.findIndex((h) => h.name === 'eventCount') ?? 0
                for (const row of cvRows) {
                    const periodVal = row.dimensionValues?.[1]?.value ?? ''
                    if (!periodVal) continue
                    let periodKey = periodVal
                    if (gran === 'weekly' && dimName === 'date') {
                        const d = periodVal
                        const year = parseInt(d.slice(0, 4), 10)
                        const month = parseInt(d.slice(4, 6), 10)
                        const day = parseInt(d.slice(6, 8), 10)
                        const date = new Date(year, month - 1, day)
                        const sun = new Date(date)
                        sun.setDate(date.getDate() - date.getDay())
                        periodKey = `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, '0')}-${String(sun.getDate()).padStart(2, '0')}`
                    }
                    const val = Math.round(parseFloat(row.metricValues?.[evIdx]?.value ?? '0') || 0)
                    if (!byPeriod[periodKey]) byPeriod[periodKey] = { pv: 0, cv: 0, sessions: 0, newUsers: 0, bounceRateSessionSum: 0, avgDurSessionSum: 0, engagementSessionSum: 0 }
                    byPeriod[periodKey].cv += val
                }
            } catch {
            }
        }

        const sortedKeys = Object.keys(byPeriod).sort()
        const series = sortedKeys.map((key) => {
            const v = byPeriod[key]
            const sessions = v.sessions || 0
            const bounceRate = sessions > 0 ? (v.bounceRateSessionSum / sessions) * 100 : 0
            const averageSessionDuration = sessions > 0 ? v.avgDurSessionSum / sessions : 0
            const engagementRate = sessions > 0 ? (v.engagementSessionSum / sessions) * 100 : 0
            const cvr = v.pv > 0 ? (v.cv / v.pv) * 100 : 0
            const newUserRate = sessions > 0 ? (v.newUsers / sessions) * 100 : 0
            const bounceCount = Math.round(sessions * (bounceRate / 100))
            let label = key
            if (key.length === 8 && gran === 'daily') {
                label = `${key.slice(4, 6)}/${key.slice(6, 8)}`
            } else if (key.length === 6 && gran === 'monthly') {
                label = `${key.slice(0, 4)}/${key.slice(4, 6)}`
            } else if (key.length === 10 && gran === 'weekly') {
                label = `Wk ${key.slice(5, 7)}/${key.slice(8, 10)}`
            }
            return {
                period: key,
                label,
                pv: v.pv,
                cv: v.cv,
                sessions: v.sessions,
                cvr,
                newUsers: v.newUsers,
                newUserRate,
                bounceRate,
                bounceCount,
                averageSessionDuration,
                engagementRate,
                ...(v.exitRate != null && { exitRate: v.exitRate }),
            }
        })

        return NextResponse.json({ success: true, series, granularity: gran })
    } catch (error) {
        console.error('Page metrics series API error:', error)
        return NextResponse.json(
            createErrorResponse(error, '時系列の取得に失敗しました'),
            { status: 500 }
        )
    }
}
