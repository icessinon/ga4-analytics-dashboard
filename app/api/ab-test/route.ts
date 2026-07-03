import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'

function parseImprovement(value: unknown): number | null {
    if (value === undefined || value === null || value === '') return null
    const n = typeof value === 'number' ? value : parseFloat(String(value))
    return Number.isFinite(n) ? n : null
}

/**
 * ABテスト一覧を取得（ページネーション対応: デフォルト5件/ページ）
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const productId = searchParams.get('productId')
        const status = searchParams.get('status')
        const pageParam = searchParams.get('page')
        const limitParam = searchParams.get('limit')
        const page = Math.max(1, parseInt(pageParam || '1', 10) || 1)
        const limit = Math.min(50, Math.max(1, parseInt(limitParam || '5', 10) || 5))
        const skip = (page - 1) * limit

        const where: any = {}
        if (productId) {
            where.productId = parseInt(productId, 10)
        }
        if (status) {
            where.status = status
        }

        const [abTests, total] = await Promise.all([
            prisma.abTest.findMany({
                where,
                include: {
                    product: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                    _count: {
                        select: {
                            reportExecutions: true,
                        },
                    },
                },
                orderBy: {
                    startDate: 'desc',
                },
                skip,
                take: limit,
            }),
            prisma.abTest.count({ where }),
        ])

        return NextResponse.json({
            success: true,
            abTests,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        })
    } catch (error) {
        console.error('AB Test List API Error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json(
            {
                error: 'Failed to fetch AB tests',
                message: errorMessage,
            },
            { status: 500 }
        )
    }
}

/**
 * ABテストを作成
 */
export async function POST(request: Request) {
    try {
        const body = await request.json()
        const {
            productId,
            name,
            description,
            hypothesis,
            expectedImprovement,
            startDate,
            endDate,
            status,
            ga4Config,
            autoExecute,
            scheduleConfig,
            evaluationConfig,
        } = body

        if (!productId || !name || !startDate) {
            return NextResponse.json(
                { error: 'Required fields are missing' },
                { status: 400 }
            )
        }

        const abTest = await prisma.abTest.create({
            data: {
                productId: parseInt(productId, 10),
                name,
                description,
                hypothesis: hypothesis || null,
                expectedImprovement: parseImprovement(expectedImprovement),
                variantAName: 'A', // 固定値
                variantBName: 'B', // 固定値
                startDate: new Date(startDate),
                endDate: endDate ? new Date(endDate) : null,
                status: status || 'running',
                ga4Config: ga4Config || null,
                autoExecute: autoExecute !== undefined ? autoExecute : true,
                scheduleConfig: scheduleConfig || null,
                evaluationConfig: evaluationConfig || null,
            },
            include: {
                product: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        })

        return NextResponse.json({
            success: true,
            abTest,
        })
    } catch (error) {
        console.error('AB Test Create API Error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json(
            {
                error: 'Failed to create AB test',
                message: errorMessage,
            },
            { status: 500 }
        )
    }
}

/**
 * ABテストを更新
 */
export async function PUT(request: Request) {
    try {
        const body = await request.json()
        const {
            id,
            name,
            description,
            hypothesis,
            expectedImprovement,
            startDate,
            endDate,
            status,
            ga4Config,
            autoExecute,
            scheduleConfig,
            evaluationConfig,
        } = body

        if (!id) {
            return NextResponse.json(
                { error: 'ID is required' },
                { status: 400 }
            )
        }

        const updateData: any = {}
        if (name !== undefined) updateData.name = name
        if (description !== undefined) updateData.description = description
        if (hypothesis !== undefined) updateData.hypothesis = hypothesis || null
        if (expectedImprovement !== undefined) updateData.expectedImprovement = parseImprovement(expectedImprovement)
        if (startDate !== undefined) updateData.startDate = new Date(startDate)
        if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null
        if (status !== undefined) updateData.status = status
        if (ga4Config !== undefined) updateData.ga4Config = ga4Config
        if (autoExecute !== undefined) updateData.autoExecute = autoExecute
        if (scheduleConfig !== undefined) updateData.scheduleConfig = scheduleConfig
        if (evaluationConfig !== undefined) updateData.evaluationConfig = evaluationConfig

        const abTest = await prisma.abTest.update({
            where: { id: parseInt(id, 10) },
            data: updateData,
            include: {
                product: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        })

        return NextResponse.json({
            success: true,
            abTest,
        })
    } catch (error) {
        console.error('AB Test Update API Error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json(
            {
                error: 'Failed to update AB test',
                message: errorMessage,
            },
            { status: 500 }
        )
    }
}

/**
 * ABテストを削除
 */
export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')

        if (!id) {
            return NextResponse.json(
                { error: 'ID is required' },
                { status: 400 }
            )
        }

        await prisma.abTest.delete({
            where: { id: parseInt(id, 10) },
        })

        return NextResponse.json({
            success: true,
        })
    } catch (error) {
        console.error('AB Test Delete API Error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json(
            {
                error: 'Failed to delete AB test',
                message: errorMessage,
            },
            { status: 500 }
        )
    }
}
