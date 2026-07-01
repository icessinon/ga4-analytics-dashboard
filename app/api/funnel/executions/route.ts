/**
 * ファネル実行履歴API
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { insertFunnelExecutionLog, jstReportDate, jstReportMonth, nowIso } from '@/lib/bq/write'

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const productId = searchParams.get('productId')
        const page = parseInt(searchParams.get('page') || '1', 10)
        const limit = parseInt(searchParams.get('limit') || '10', 10)
        const skip = (page - 1) * limit

        let whereClause: any = {}
        if (productId) {
            whereClause.productId = parseInt(productId, 10)
        }

        const totalExecutions = await prisma.funnelExecution.count({
            where: whereClause,
        })

        const executions = await prisma.funnelExecution.findMany({
            where: whereClause,
            include: {
                product: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
            skip,
            take: limit,
        })

        const formattedExecutions = executions.map((exec) => ({
            id: exec.id,
            productId: exec.productId,
            productName: exec.product?.name || 'N/A',
            name: exec.name,
            startDate: exec.startDate,
            endDate: exec.endDate,
            status: exec.status,
            createdAt: exec.createdAt,
            hasResultData: !!exec.resultData,
        }))

        return NextResponse.json({
            success: true,
            executions: formattedExecutions,
            pagination: {
                total: totalExecutions,
                page,
                limit,
                totalPages: Math.ceil(totalExecutions / limit),
            },
        })
    } catch (error) {
        console.error('Funnel Executions API Error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json(
            {
                error: 'Failed to fetch funnel executions',
                message: errorMessage,
            },
            { status: 500 }
        )
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const {
            productId,
            name,
            funnelConfig,
            filterConfig,
            startDate,
            endDate,
            resultData,
        } = body

        if (!productId || !funnelConfig || !startDate || !endDate || !resultData) {
            return NextResponse.json(
                { error: 'productId, funnelConfig, startDate, endDate, and resultData are required' },
                { status: 400 }
            )
        }

        const execution = await prisma.funnelExecution.create({
            data: {
                productId: parseInt(productId, 10),
                name: name || `ファネル分析 ${new Date().toLocaleString('ja-JP')}`,
                funnelConfig,
                filterConfig: filterConfig || null,
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                resultData,
                status: 'completed',
            },
            include: {
                product: true,
            },
        })

        const now = new Date()
        void insertFunnelExecutionLog({
            execution_id:      execution.id,
            product_id:        execution.productId,
            execution_name:    execution.name,
            funnel_config:     JSON.stringify(funnelConfig),
            filter_config:     filterConfig ? JSON.stringify(filterConfig) : null,
            start_date:        typeof startDate === 'string' ? startDate.split('T')[0] : new Date(startDate).toISOString().split('T')[0],
            end_date:          typeof endDate === 'string' ? endDate.split('T')[0] : new Date(endDate).toISOString().split('T')[0],
            result_data:       JSON.stringify(resultData),
            gemini_evaluation: null,
            status:            'completed',
            error_message:     null,
            report_month:      jstReportMonth(now),
            report_date:       jstReportDate(now),
            synced_at:         nowIso(),
        })

        return NextResponse.json({
            success: true,
            execution: {
                id: execution.id,
                productId: execution.productId,
                productName: execution.product?.name || 'N/A',
                name: execution.name,
                startDate: execution.startDate,
                endDate: execution.endDate,
                status: execution.status,
                createdAt: execution.createdAt,
                hasResultData: !!execution.resultData,
            },
        }, { status: 201 })
    } catch (error) {
        console.error('Create Funnel Execution API Error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json(
            {
                error: 'Failed to create funnel execution',
                message: errorMessage,
            },
            { status: 500 }
        )
    }
}
