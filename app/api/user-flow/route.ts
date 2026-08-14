import { NextResponse } from 'next/server'
import { runUserFlowReport } from '@/lib/services/userFlow/userFlowService'

/**
 * CVセッション解剖（BigQuery events_* 直接集計）。
 * データソースは x-work.jp のGA4 BQエクスポート固定のため propertyId は不要。
 */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}))
        const days = [7, 14, 28].includes(body?.days) ? body.days : 7
        const report = await runUserFlowReport(days)
        return NextResponse.json({ success: true, days, ...report, fetchedAt: new Date().toISOString() })
    } catch (error) {
        console.error('User Flow API Error:', error)
        return NextResponse.json(
            { error: 'ユーザー行動フローの集計に失敗しました', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
