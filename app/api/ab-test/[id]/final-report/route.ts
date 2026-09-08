import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { generateAndStoreFinalReport } from '@/lib/services/ab-test/finalReportService'

/**
 * AI最終レポートを追加観点付きで再生成する。
 * body: { perspective?: string }  空文字/未指定なら観点をクリアして再生成
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> | { id: string } }
) {
    try {
        const resolvedParams = params instanceof Promise ? await params : params
        const id = parseInt(resolvedParams.id, 10)
        if (isNaN(id)) {
            return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
        }

        const body = await request.json().catch(() => ({}))
        const perspective = typeof body.perspective === 'string' ? body.perspective : ''

        const report = await generateAndStoreFinalReport(id, { force: true, additionalPerspective: perspective })
        if (!report) {
            return NextResponse.json(
                { error: 'レポートを生成できませんでした（実行結果が不足している可能性があります）' },
                { status: 422 }
            )
        }

        const abTest = await prisma.abTest.findUnique({
            where: { id },
            select: { finalAiReport: true, finalAiReportAt: true, finalReportPerspective: true },
        })

        return NextResponse.json({
            success: true,
            finalAiReport: abTest?.finalAiReport ?? report,
            finalAiReportAt: abTest?.finalAiReportAt ?? new Date(),
            finalReportPerspective: abTest?.finalReportPerspective ?? null,
        })
    } catch (error) {
        console.error('AB Test Final Report Regenerate API Error:', error)
        const message = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json({ error: 'Failed to regenerate final report', message }, { status: 500 })
    }
}
