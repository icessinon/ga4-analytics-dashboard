import { NextResponse } from 'next/server'
import { GA4_EXPORT_START } from '@/lib/bq/ga4EventsClient'
import { clampToExportWindow, toDisplay, toSuffix, yesterdayJstSuffix } from '@/lib/bq/ga4EventsSql'
import { errorResponse } from '@/lib/http/errorResponse'
import { runListPerformanceReport } from '@/lib/services/listPerformance/listPerformanceService'

const YMD = /^\d{4}-\d{2}-\d{2}$/

/**
 * 求人一覧パフォーマンス（BigQuery）。
 * データソースは x-work.jp のエクスポート固定のため propertyId は不要。集計は listPerformanceService。
 */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}))
        const startDate: string = YMD.test(body?.startDate) ? body.startDate : ''
        const endDate: string = YMD.test(body?.endDate) ? body.endDate : ''
        if (!startDate || !endDate) {
            return NextResponse.json({ error: 'startDate / endDate (YYYY-MM-DD) が必要です' }, { status: 400 })
        }

        // 丸めた結果、開始がエクスポート範囲の終端を越えるなら対象データなし
        const effectiveStart = toSuffix(new Date(startDate)) < GA4_EXPORT_START ? GA4_EXPORT_START : toSuffix(new Date(startDate))
        const effectiveEnd = toSuffix(new Date(endDate)) > yesterdayJstSuffix() ? yesterdayJstSuffix() : toSuffix(new Date(endDate))
        if (effectiveStart > effectiveEnd) {
            return NextResponse.json({ error: `対象期間にBQデータがありません（エクスポートは${toDisplay(GA4_EXPORT_START)}開始）` }, { status: 400 })
        }

        const report = await runListPerformanceReport(clampToExportWindow(startDate, endDate))
        return NextResponse.json({ success: true, ...report, fetchedAt: new Date().toISOString() })
    } catch (error) {
        return errorResponse(error, '求人一覧パフォーマンスの集計に失敗しました', 'List Performance API Error', { withMessage: true })
    }
}
