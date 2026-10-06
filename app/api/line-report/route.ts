import { NextResponse } from 'next/server'
import { readGa4Body } from '@/lib/http/ga4Request'
import { errorResponse } from '@/lib/http/errorResponse'
import { runLineReport } from '@/lib/services/channel/lineReportService'
import { parseDateString } from '@/lib/utils/date'

/** LINE 経由の再訪・CV（GA4）と配信実績（BQ）。集計は lib/services/channel/lineReportService.ts */
export async function POST(request: Request) {
    try {
        const { reporter, startDate, endDate } = await readGa4Body(request, {
            propertyIdMissingMessage: 'propertyId が必要です',
            resolveDates: (s, e) => ({ startDate: parseDateString(s), endDate: parseDateString(e) }),
        })
        const report = await runLineReport(reporter)
        return NextResponse.json({ success: true, startDate, endDate, ...report, fetchedAt: new Date().toISOString() })
    } catch (error) {
        return errorResponse(error, 'LINEレポートの集計に失敗しました', 'LINE Report API Error', { withMessage: true })
    }
}
