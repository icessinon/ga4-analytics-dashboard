import { NextResponse } from 'next/server'
import { checkCvDropAndNotify } from '@/lib/services/alerts/cvDropAlertService'

export async function POST() {
    try {
        const results = await checkCvDropAndNotify()
        const alertCount = results.reduce((sum, r) => sum + r.alerts.length, 0)
        console.log(`[cvDropAlert] チェック完了: ${results.length}プロダクト / アラート${alertCount}件`)
        return NextResponse.json({ success: true, results })
    } catch (e) {
        console.error('[cvDropAlert] チェック失敗:', e)
        return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
    }
}
