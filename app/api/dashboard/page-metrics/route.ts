/**
 * 指定ページパスのGA4指標を取得（PV, CV, CVR, 離脱率, 新規訪問率, 直帰数, 平均滞在時間 など）
 */

import { NextResponse } from 'next/server'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { fetchEngagementFunnelData } from '@/lib/services/funnel/engagementFunnelService'
import { createErrorResponse } from '@/lib/utils/error'

function parseDateRange(month: string): { startDate: string; endDate: string } {
    const [y, m] = month.split('-').map(Number)
    const start = new Date(y, m - 1, 1)
    const end = new Date(y, m, 0)
    const format = (d: Date) => d.toISOString().slice(0, 10)
    return { startDate: format(start), endDate: format(end) }
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}))
        const {
            propertyId,
            productId,
            pagePath,
            startDate: startParam,
            endDate: endParam,
            month,
            accessToken: customToken,
        } = body

        if (!propertyId || pagePath === undefined || pagePath === '') {
            return NextResponse.json(
                { error: 'propertyId and pagePath are required' },
                { status: 400 }
            )
        }

        const token = await getGA4AccessToken(customToken)

        let cvEventName: string | null = null
        let cvDimension = 'eventName'
        if (productId != null && pagePath) {
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

        let startDate: string
        let endDate: string
        if (month && /^\d{4}-\d{2}$/.test(month)) {
            const range = parseDateRange(month)
            startDate = range.startDate
            endDate = range.endDate
        } else {
            startDate = startParam || '28daysAgo'
            endDate = endParam || 'yesterday'
        }

        const dimensionFilter = {
            filter: {
                fieldName: 'pagePath',
                stringFilter: { matchType: 'EXACT' as const, value: pagePath },
            },
        }

        const fullMetrics = [
            { name: 'screenPageViews' },
            { name: 'conversions' },
            { name: 'sessions' },
            { name: 'totalUsers' },
            { name: 'newUsers' },
            { name: 'engagementRate' },
            { name: 'bounceRate' },
            { name: 'averageSessionDuration' },
        ]
        const baseMetrics = [
            { name: 'screenPageViews' },
            { name: 'conversions' },
            { name: 'sessions' },
            { name: 'totalUsers' },
            { name: 'newUsers' },
            { name: 'averageSessionDuration' },
        ]

        let report: Awaited<ReturnType<typeof fetchGA4Data>>
        try {
            report = await fetchGA4Data(
                {
                    propertyId,
                    dateRanges: [{ startDate, endDate }],
                    dimensions: [{ name: 'pagePath' }],
                    metrics: fullMetrics,
                    dimensionFilter,
                    limit: 1,
                },
                token
            )
        } catch (firstErr) {
            report = await fetchGA4Data(
                {
                    propertyId,
                    dateRanges: [{ startDate, endDate }],
                    dimensions: [{ name: 'pagePath' }],
                    metrics: baseMetrics,
                    dimensionFilter,
                    limit: 1,
                },
                token
            )
        }

        const row = report.rows?.[0]
        const metricHeaders = report.metricHeaders ?? []

        let emptyCv = 0
        if (cvEventName && (!row || !row.metricValues?.length)) {
            try {
                const cvReport = await fetchGA4Data(
                    {
                        propertyId,
                        dateRanges: [{ startDate, endDate }],
                        dimensions: [{ name: 'pagePath' }],
                        metrics: [{ name: 'eventCount' }],
                        dimensionFilter: {
                            andGroup: {
                                expressions: [
                                    { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'EXACT', value: pagePath } } },
                                    { filter: { fieldName: cvDimension, stringFilter: { matchType: 'EXACT', value: cvEventName } } },
                                ],
                            },
                        },
                        limit: 1,
                    },
                    token
                )
                const cvRow = cvReport.rows?.[0]
                if (cvRow?.metricValues?.[0]) {
                    emptyCv = Math.round(parseFloat(cvRow.metricValues[0].value ?? '0') || 0)
                }
            } catch {
            }
        }

        if (!row || !row.metricValues?.length) {
            let emptyExitRate: number | null = null
            let emptyExitRateNote: string | undefined
            try {
                const engagementData = await fetchEngagementFunnelData(propertyId, startDate, endDate, token)
                const engagementRow = engagementData.rows.find((r) => r.pagePath === pagePath)
                if (engagementRow && engagementRow.baseUsers > 0) {
                    const baseUsers = engagementRow.baseUsers
                    const users30 = engagementRow.milestones['30秒以上滞在']?.users ?? 0
                    emptyExitRate = ((baseUsers - users30) / baseUsers) * 100
                    emptyExitRateNote = '10秒以上滞在のうち30秒未満で離脱'
                }
            } catch {
            }
            if (emptyExitRate === null) {
                try {
                    const exitReport = await fetchGA4Data(
                        {
                            propertyId,
                            dateRanges: [{ startDate, endDate }],
                            dimensions: [{ name: 'pagePath' }],
                            metrics: [{ name: 'exitRate' }],
                            dimensionFilter: {
                                filter: { fieldName: 'pagePath', stringFilter: { matchType: 'EXACT', value: pagePath } },
                            },
                            limit: 1,
                        },
                        token
                    )
                    const exitRow = exitReport.rows?.[0]
                    if (exitRow?.metricValues?.[0]) {
                        const raw = parseFloat(exitRow.metricValues[0].value ?? '0') || 0
                        emptyExitRate = raw <= 1 ? raw * 100 : raw
                    }
                } catch {
                }
            }
            return NextResponse.json({
                success: true,
                pagePath,
                startDate,
                endDate,
                pv: 0,
                cv: emptyCv,
                cvr: 0,
                sessions: 0,
                newUsers: 0,
                newUserRate: 0,
                bounceRate: 0,
                bounceCount: 0,
                exitRate: emptyExitRate,
                exitRateNote: emptyExitRateNote,
                averageSessionDurationSeconds: 0,
                averageSessionDurationLabel: '0秒',
                engagementRate: 0,
                cvEventName: cvEventName ?? undefined,
                cvDimension: cvEventName ? cvDimension : undefined,
            })
        }

        const values: Record<string, number> = {}
        metricHeaders.forEach((h, i) => {
            const name = h.name ?? ''
            values[name] = parseFloat(row.metricValues[i]?.value ?? '0') || 0
        })

        const pv = Math.round(values.screenPageViews ?? 0)
        let cv = Math.round(values.conversions ?? 0)

        if (cvEventName && token) {
            try {
                const cvReport = await fetchGA4Data(
                    {
                        propertyId,
                        dateRanges: [{ startDate, endDate }],
                        dimensions: [{ name: 'pagePath' }],
                        metrics: [{ name: 'eventCount' }],
                        dimensionFilter: {
                            andGroup: {
                                expressions: [
                                    { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'EXACT', value: pagePath } } },
                                    { filter: { fieldName: cvDimension, stringFilter: { matchType: 'EXACT', value: cvEventName } } },
                                ],
                            },
                        },
                        limit: 1,
                    },
                    token
                )
                const cvRow = cvReport.rows?.[0]
                if (cvRow?.metricValues?.[0]) {
                    cv = Math.round(parseFloat(cvRow.metricValues[0].value ?? '0') || 0)
                }
            } catch {
            }
        }
        const sessions = Math.round(values.sessions ?? 0)
        const totalUsers = Math.round(values.totalUsers ?? 0)
        const newUsers = Math.round(values.newUsers ?? 0)
        const avgSec = values.averageSessionDuration ?? 0

        const engagementRateRaw = values.engagementRate ?? 0
        const bounceRateRaw = values.bounceRate ?? 0
        const engagementRatePct = engagementRateRaw <= 1 ? engagementRateRaw * 100 : engagementRateRaw
        const bounceRatePct = bounceRateRaw <= 1 ? bounceRateRaw * 100 : bounceRateRaw
        const bounceCount = Math.round(sessions * (bounceRatePct / 100))

        const cvr = pv > 0 ? (cv / pv) * 100 : 0
        const newUserRate = totalUsers > 0 ? (newUsers / totalUsers) * 100 : 0

        let exitRate: number | null = null
        let exitRateNote: string | undefined
        try {
            const engagementData = await fetchEngagementFunnelData(propertyId, startDate, endDate, token)
            const engagementRow = engagementData.rows.find((r) => r.pagePath === pagePath)
            if (engagementRow && engagementRow.baseUsers > 0) {
                const baseUsers = engagementRow.baseUsers
                const users30 = engagementRow.milestones['30秒以上滞在']?.users ?? 0
                exitRate = ((baseUsers - users30) / baseUsers) * 100
                exitRateNote = '10秒以上滞在のうち30秒未満で離脱'
            }
        } catch {
        }
        if (exitRate === null) {
            try {
                const exitReport = await fetchGA4Data(
                    {
                        propertyId,
                        dateRanges: [{ startDate, endDate }],
                        dimensions: [{ name: 'pagePath' }],
                        metrics: [{ name: 'exitRate' }],
                        dimensionFilter: {
                            filter: { fieldName: 'pagePath', stringFilter: { matchType: 'EXACT', value: pagePath } },
                        },
                        limit: 1,
                    },
                    token
                )
                const exitRow = exitReport.rows?.[0]
                if (exitRow?.metricValues?.[0]) {
                    const raw = parseFloat(exitRow.metricValues[0].value ?? '0') || 0
                    exitRate = raw <= 1 ? raw * 100 : raw
                }
            } catch {
            }
        }

        const formatDuration = (sec: number) => {
            if (sec >= 3600) return `${Math.floor(sec / 3600)}時間${Math.floor((sec % 3600) / 60)}分`
            if (sec >= 60) return `${Math.floor(sec / 60)}分${Math.round(sec % 60)}秒`
            return `${Math.round(sec)}秒`
        }

        return NextResponse.json({
            success: true,
            pagePath,
            startDate,
            endDate,
            pv,
            cv,
            cvr,
            sessions,
            newUsers,
            newUserRate,
            bounceRate: bounceRatePct,
            bounceCount,
            exitRate,
            exitRateNote,
            averageSessionDurationSeconds: avgSec,
            averageSessionDurationLabel: formatDuration(avgSec),
            engagementRate: engagementRatePct,
            cvEventName: cvEventName ?? undefined,
            cvDimension: cvEventName ? cvDimension : undefined,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error('Dashboard page-metrics API error:', message, error)
        return NextResponse.json(
            createErrorResponse(error, 'ページ指標の取得に失敗しました'),
            { status: 500 }
        )
    }
}
