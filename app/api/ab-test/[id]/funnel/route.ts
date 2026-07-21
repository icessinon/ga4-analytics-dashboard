import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { computeAbTestFunnel, FunnelConfigError } from '@/lib/services/ab-test/abTestFunnelService'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const abTestId = parseInt(id, 10)
        if (isNaN(abTestId)) {
            return NextResponse.json({ error: 'Invalid AB test ID' }, { status: 400 })
        }
        // basis=view: view_label（50%×1秒表示。即通過ステップは取りこぼしあり）
        // basis=click: click_label のStepN_プレフィックス単位で「そのステップで何か操作した人」（表示条件なしで確実）
        const basis = new URL(request.url).searchParams.get('basis') === 'click' ? 'click' : 'view'

        const abTest = await prisma.abTest.findUnique({ where: { id: abTestId } })
        if (!abTest) {
            return NextResponse.json({ error: 'AB test not found' }, { status: 404 })
        }

        // 予約作成（開始日が未来）のテストはGA4に問い合わせず「開始前」を返す
        // サーバーはUTCのため、JST基準の当日で判定する
        const startDateStr = abTest.startDate.toISOString().split('T')[0]
        const jstToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().split('T')[0]
        if (startDateStr > jstToday) {
            return NextResponse.json({ notStarted: true, startDate: startDateStr })
        }

        const result = await computeAbTestFunnel(abTest, basis)

        return NextResponse.json({
            success: true,
            ...result,
            detectedSuffixes: result.mode === 'auto' ? result.detectedSuffixes : undefined,
            fetchedAt: new Date().toISOString(),
        })
    } catch (error) {
        if (error instanceof FunnelConfigError) {
            return NextResponse.json({ error: error.message }, { status: 400 })
        }
        console.error('AB Test Funnel API Error:', error)
        return NextResponse.json(
            { error: 'ファネル集計に失敗しました', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
