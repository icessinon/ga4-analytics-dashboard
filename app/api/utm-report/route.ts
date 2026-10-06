import { NextResponse } from 'next/server'
import { readGa4Body } from '@/lib/http/ga4Request'
import { errorResponse } from '@/lib/http/errorResponse'
import { runUtmReport } from '@/lib/services/channel/utmReportService'
import { parseDateString } from '@/lib/utils/date'

/** UTM 4 軸別のセッション・ユーザー・CV。集計は lib/services/channel/utmReportService.ts */
export async function POST(request: Request) {
    try {
        const { reporter, startDate, endDate } = await readGa4Body(request, {
            propertyIdMissingMessage: 'propertyId が必要です',
            resolveDates: (s, e) => ({ startDate: parseDateString(s), endDate: parseDateString(e) }),
        })
        const report = await runUtmReport(reporter)
        return NextResponse.json({ success: true, startDate, endDate, ...report, fetchedAt: new Date().toISOString() })
    } catch (error) {
        return errorResponse(error, 'UTMレポートの集計に失敗しました', 'UTM Report API Error', { withMessage: true })
    }
}
