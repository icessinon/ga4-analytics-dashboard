import { NextResponse } from 'next/server'
import { readGa4Body } from '@/lib/http/ga4Request'
import { errorResponse } from '@/lib/http/errorResponse'
import { parseDateString } from '@/lib/utils/date'
import { runViewLabelsByDevice } from '@/lib/services/heatmap/heatmapService'

/**
 * view ラベル別イベント数（デバイス別）。ヒートマップページのデータソース。
 * 集計は lib/services/heatmap/heatmapService.ts
 */
export async function POST(request: Request) {
    try {
        const { reporter, raw, startDate, endDate } = await readGa4Body(request, {
            allowProductId: true,
            propertyIdMissingMessage: 'propertyId または productId を指定してください。',
            defaultStartDate: '28daysAgo',
            resolveDates: (s, e) => ({ startDate: parseDateString(s), endDate: parseDateString(e) }),
        })
        const pagePath = raw.pagePath != null ? String(raw.pagePath) : undefined
        const byDevice = await runViewLabelsByDevice(reporter, pagePath)
        return NextResponse.json({ success: true, byDevice, startDate, endDate })
    } catch (error) {
        return errorResponse(error, 'view ラベルデータの取得に失敗しました', 'Heatmap view-labels API error', { withMessage: true })
    }
}
