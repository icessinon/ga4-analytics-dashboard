import { NextResponse } from 'next/server'
import { readGa4Body } from '@/lib/http/ga4Request'
import { errorResponse } from '@/lib/http/errorResponse'
import { runScoutFunnelReport } from '@/lib/services/scout/scoutFunnelService'
import { parseDateString } from '@/lib/utils/date'

/** スカウト送信（DynamoDB）→ 閲覧 → 応募（GA4）のファネル。集計は lib/services/scout/scoutFunnelService.ts */
export async function POST(request: Request) {
    try {
        const { reporter, startDate, endDate } = await readGa4Body(request, {
            propertyIdMissingMessage: 'propertyId が必要です',
            resolveDates: (s, e) => ({ startDate: parseDateString(s), endDate: parseDateString(e) }),
        })
        const report = await runScoutFunnelReport(reporter, startDate, endDate)
        return NextResponse.json({ success: true, startDate, endDate, ...report, fetchedAt: new Date().toISOString() })
    } catch (error) {
        return errorResponse(error, 'スカウトファネルの集計に失敗しました', 'Scout Funnel API Error', { withMessage: true })
    }
}
