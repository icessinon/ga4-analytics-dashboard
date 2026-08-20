import { NextResponse } from 'next/server'
import { runUserFlowReport } from '@/lib/services/userFlow/userFlowService'

/**
 * CVセッション解剖（BigQuery events_* 直接集計）。
 * データソースは x-work.jp のGA4 BQエクスポート固定のため propertyId は不要。
 */
const YMD = /^\d{4}-\d{2}-\d{2}$/

// 'NdaysAgo' 形式や旧 { days } 指定を YYYY-MM-DD に解決する（終端は昨日）
function daysAgoYmd(days: number): string {
    const d = new Date(Date.now() + 9 * 3600 * 1000)
    d.setUTCDate(d.getUTCDate() - days)
    return d.toISOString().slice(0, 10)
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}))
        let startDate: string
        let endDate: string
        if (typeof body?.startDate === 'string' && YMD.test(body.startDate) && typeof body?.endDate === 'string' && YMD.test(body.endDate)) {
            startDate = body.startDate
            endDate = body.endDate
        } else {
            // 旧形式 { days } との後方互換
            const days = [7, 14, 28].includes(body?.days) ? body.days : 7
            startDate = daysAgoYmd(days)
            endDate = daysAgoYmd(1)
        }
        const report = await runUserFlowReport(startDate, endDate)
        return NextResponse.json({ success: true, ...report, fetchedAt: new Date().toISOString() })
    } catch (error) {
        console.error('User Flow API Error:', error)
        return NextResponse.json(
            { error: 'ユーザー行動フローの集計に失敗しました', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
