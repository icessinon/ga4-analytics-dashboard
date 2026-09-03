/**
 * レポート履歴一覧取得API
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const productId = searchParams.get('productId')
        const reportId = searchParams.get('reportId')
        const search = searchParams.get('search') || ''
        const page = parseInt(searchParams.get('page') || '1', 10)
        const limit = parseInt(searchParams.get('limit') || '20', 10)
        const skip = (page - 1) * limit

        const where: any = {}

        if (reportId) {
            where.reportId = parseInt(reportId, 10)
        } else if (productId) {
            where.report = {
                productId: parseInt(productId, 10),
            }
        }

        if (search) {
            where.OR = [
                {
                    report: {
                        name: {
                            contains: search,
                            mode: 'insensitive',
                        },
                    },
                },
                {
                    report: {
                        product: {
                            name: {
                                contains: search,
                                mode: 'insensitive',
                            },
                        },
                    },
                },
                // ABテストレポートは施策名(ABテスト名)でも検索できるように
                {
                    abTestExecutions: {
                        some: {
                            abTest: {
                                name: {
                                    contains: search,
                                    mode: 'insensitive',
                                },
                            },
                        },
                    },
                },
            ]
        }

        const total = await prisma.reportExecution.count({ where })

        const executions = await prisma.reportExecution.findMany({
            where,
            include: {
                report: {
                    include: {
                        product: true,
                    },
                },
                // このレポート実行がABテストのものなら施策名(ABテスト名)を引く
                abTestExecutions: {
                    include: {
                        abTest: { select: { id: true, name: true } },
                    },
                    take: 1,
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
            skip,
            take: limit,
        })

        return NextResponse.json({
            success: true,
            executions: executions.map((exec) => {
                const abTest = exec.abTestExecutions[0]?.abTest
                return {
                    id: exec.id,
                    reportId: exec.reportId,
                    reportName: exec.report.name,
                    productName: exec.report.product?.name || 'N/A',
                    // ABテストレポートの場合はどの施策かを示す
                    abTestId: abTest?.id ?? null,
                    abTestName: abTest?.name ?? null,
                    status: exec.status,
                    startedAt: exec.startedAt,
                    completedAt: exec.completedAt,
                    createdAt: exec.createdAt,
                    hasResultData: !!exec.resultData,
                    errorMessage: exec.errorMessage,
                }
            }),
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        })
    } catch (error) {
        console.error('Report History API Error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json(
            {
                error: 'Failed to fetch report history',
                message: errorMessage,
            },
            { status: 500 }
        )
    }
}
