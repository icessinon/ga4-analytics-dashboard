import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/http/errorResponse'
import { runDeliveryReport } from '@/lib/services/delivery/deliveryReportService'

/** SMS・メール・LINE の配信実績を施策別／件名別に横断集計（社内宛のテスト配信は既定で除外）。集計は lib/services/delivery/deliveryReportService.ts */
export async function POST(request: Request) {
    try {
        const { days, scope, excludeInternal } = (await request.json().catch(() => ({}))) as {
            days?: unknown; scope?: unknown; excludeInternal?: unknown
        }
        const report = await runDeliveryReport(days, scope, excludeInternal)
        return NextResponse.json({ success: true, ...report })
    } catch (error) {
        return errorResponse(error, '配信実績の集計に失敗しました', 'Delivery Report API Error', { withMessage: true })
    }
}
