import { NextResponse } from 'next/server'
import { sendWeeklySummary } from '@/lib/services/reports/weeklySummaryService'

export async function POST() {
    try {
        const results = await sendWeeklySummary()
        console.log(`[weeklySummary] 配信完了: ${results.length}プロダクト`)
        return NextResponse.json({ success: true, results })
    } catch (e) {
        console.error('[weeklySummary] 配信失敗:', e)
        return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
    }
}
