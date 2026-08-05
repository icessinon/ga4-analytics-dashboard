import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'

function getMonthRange(month: string): { start: Date; end: Date } {
    const [y, m] = month.split('-').map(Number)
    const start = new Date(y, m - 1, 1, 0, 0, 0, 0)
    const end = new Date(y, m, 0, 23, 59, 59, 999)
    return { start, end }
}

function toDateKey(d: Date): string {
    return d.toISOString().slice(0, 10)
}

export async function GET(request: Request) {
    try {
        await prisma.$connect()

        const { searchParams } = new URL(request.url)
        const productIdParam = searchParams.get('productId')
        const productId = productIdParam ? parseInt(productIdParam, 10) : null
        const monthParam = searchParams.get('month')
        const now = new Date()
        const month = monthParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        const { start: monthStart, end: monthEnd } = getMonthRange(month)

        const productCount = await prisma.product.count({
            where: { isActive: true },
        })

        const abTestBaseWhere: any = productId ? { productId } : {}
        const monthOverlapWhere = {
            startDate: { lte: monthEnd },
            OR: [{ endDate: null }, { endDate: { gte: monthStart } }],
        }
        // 完了テストの月次帰属はテスト期間の終了日（endDate）基準。
        // updatedAt基準だと過去テストを編集しただけで編集月の完了数・勝利数に化ける
        const completedInMonthWhere = {
            ...abTestBaseWhere,
            status: 'completed',
            OR: [
                { endDate: { gte: monthStart, lte: monthEnd } },
                { endDate: null, updatedAt: { gte: monthStart, lte: monthEnd } },
            ],
        }

        const [abTestRunning, abTestPaused, abTestCompleted, abTestVictoryCount, abTestDefeatCount, abTestAddedThisMonth] = await Promise.all([
            prisma.abTest.count({ where: { ...abTestBaseWhere, status: 'running', ...monthOverlapWhere } }),
            prisma.abTest.count({ where: { ...abTestBaseWhere, status: 'paused', ...monthOverlapWhere } }),
            prisma.abTest.count({ where: completedInMonthWhere }),
            prisma.abTest.count({ where: { ...completedInMonthWhere, winnerVariant: { in: ['B', 'C', 'D'] } } }),
            prisma.abTest.count({ where: { ...completedInMonthWhere, winnerVariant: 'A' } }),
            prisma.abTest.count({ where: { ...abTestBaseWhere, createdAt: { gte: monthStart, lte: monthEnd } } }),
        ])

        const abTestCount = abTestRunning
        const abTestCountByStatus = { running: abTestRunning, paused: abTestPaused, completed: abTestCompleted }
        const abTestCompletedOutcome = { victory: abTestVictoryCount, defeat: abTestDefeatCount }

        const funnelConfigWhere: any = { isActive: true }
        if (productId) funnelConfigWhere.productId = productId
        const funnelConfigCount = await prisma.funnelConfig.count({
            where: funnelConfigWhere,
        })

        const sessionWhere: any = {
            startedAt: { gte: monthStart, lte: monthEnd },
        }
        if (productId) sessionWhere.productId = productId
        const recentSessionCount = await prisma.session.count({
            where: sessionWhere,
        })

        const heatmapEventWhere: any = {
            timestamp: { gte: monthStart, lte: monthEnd },
        }
        if (productId) heatmapEventWhere.productId = productId
        const recentHeatmapEventCount = await prisma.heatmapEvent.count({
            where: heatmapEventWhere,
        })

        const reportExecutionWhere: any = {
            createdAt: { gte: monthStart, lte: monthEnd },
        }
        if (productId) {
            reportExecutionWhere.report = { productId }
        }
        const recentReportExecutionCount = await prisma.reportExecution.count({
            where: reportExecutionWhere,
        })

        const funnelExecutionWhere: any = {
            createdAt: { gte: monthStart, lte: monthEnd },
        }
        if (productId) funnelExecutionWhere.productId = productId
        const funnelExecutionCount = await prisma.funnelExecution.count({
            where: funnelExecutionWhere,
        })

        const [y, m] = month.split('-').map(Number)
        const dailyDates: string[] = []
        for (let d = 1; d <= new Date(y, m, 0).getDate(); d++) {
            dailyDates.push(`${month}-${String(d).padStart(2, '0')}`)
        }

        const reportExecs = await prisma.reportExecution.findMany({
            where: reportExecutionWhere,
            select: { createdAt: true },
        })
        const funnelExecs = await prisma.funnelExecution.findMany({
            where: funnelExecutionWhere,
            select: { createdAt: true },
        })
        const sessionsInMonth = await prisma.session.findMany({
            where: sessionWhere,
            select: { startedAt: true },
        })
        const heatmapInMonth = await prisma.heatmapEvent.findMany({
            where: heatmapEventWhere,
            select: { timestamp: true },
        })

        const dailyReport: Record<string, number> = {}
        const dailyFunnel: Record<string, number> = {}
        const dailySession: Record<string, number> = {}
        const dailyHeatmap: Record<string, number> = {}
        dailyDates.forEach((d) => {
            dailyReport[d] = 0
            dailyFunnel[d] = 0
            dailySession[d] = 0
            dailyHeatmap[d] = 0
        })
        reportExecs.forEach((r) => {
            const key = toDateKey(r.createdAt)
            if (dailyReport[key] !== undefined) dailyReport[key]++
        })
        funnelExecs.forEach((f) => {
            const key = toDateKey(f.createdAt)
            if (dailyFunnel[key] !== undefined) dailyFunnel[key]++
        })
        sessionsInMonth.forEach((s) => {
            const key = toDateKey(s.startedAt)
            if (dailySession[key] !== undefined) dailySession[key]++
        })
        heatmapInMonth.forEach((h) => {
            const key = toDateKey(h.timestamp)
            if (dailyHeatmap[key] !== undefined) dailyHeatmap[key]++
        })

        const dailyStats = dailyDates.map((date) => ({
            date,
            reportExecutions: dailyReport[date] ?? 0,
            funnelExecutions: dailyFunnel[date] ?? 0,
            sessions: dailySession[date] ?? 0,
            heatmapEvents: dailyHeatmap[date] ?? 0,
        }))

        return NextResponse.json({
            month,
            productCount,
            abTestCount,
            abTestVictoryCount,
            abTestAddedThisMonth,
            abTestCountByStatus,
            abTestCompletedOutcome,
            funnelConfigCount,
            recentSessionCount,
            recentHeatmapEventCount,
            funnelExecutionCount: funnelExecutionCount,
            recentReportExecutionCount,
            dailyStats,
        })
    } catch (error) {
        console.error('Dashboard API Error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        const errorStack = error instanceof Error ? error.stack : undefined

        return NextResponse.json(
            {
                error: 'Failed to fetch dashboard data',
                message: errorMessage,
                details: process.env.NODE_ENV === 'development' ? errorStack : undefined
            },
            { status: 500 }
        )
    }
}
