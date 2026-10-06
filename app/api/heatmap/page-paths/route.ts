import { NextResponse } from 'next/server'
import { readGa4Body } from '@/lib/http/ga4Request'
import { errorResponse } from '@/lib/http/errorResponse'
import { parseDateString } from '@/lib/utils/date'
import { runHeatmapPagePaths } from '@/lib/services/heatmap/heatmapService'

/** view_label が付いたイベントのあるページパス一覧。集計は lib/services/heatmap/heatmapService.ts */
export async function POST(request: Request) {
    try {
        const { reporter } = await readGa4Body(request, {
            allowProductId: true,
            propertyIdMissingMessage: 'propertyId または productId を指定してください。',
            defaultStartDate: '28daysAgo',
            resolveDates: (s, e) => ({ startDate: parseDateString(s), endDate: parseDateString(e) }),
        })
        const pagePaths = await runHeatmapPagePaths(reporter)
        return NextResponse.json({ success: true, pagePaths })
    } catch (error) {
        return errorResponse(error, 'ページパス一覧の取得に失敗しました', 'Heatmap page-paths API error', { withMessage: true })
    }
}
