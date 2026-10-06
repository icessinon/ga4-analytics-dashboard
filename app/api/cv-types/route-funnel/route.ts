import { NextResponse } from 'next/server'
import { readGa4Body } from '@/lib/http/ga4Request'
import { errorResponse } from '@/lib/http/errorResponse'
import { runRouteFunnelReport } from '@/lib/services/cv/routeFunnelService'
import { parseDateString } from '@/lib/utils/date'

/** 一覧経由 vs 直接着地の経路別ファネル（GA4 v1alpha）。集計は lib/services/cv/routeFunnelService.ts */
export async function POST(request: Request) {
    try {
        const { reporter, startDate, endDate } = await readGa4Body(request, {
            propertyIdMissingMessage: 'propertyId が必要です',
            resolveDates: (s, e) => ({ startDate: parseDateString(s), endDate: parseDateString(e) }),
        })
        const report = await runRouteFunnelReport(reporter)
        return NextResponse.json({ success: true, startDate, endDate, ...report, fetchedAt: new Date().toISOString() })
    } catch (error) {
        return errorResponse(error, '経路別ファネルの集計に失敗しました', 'Route Funnel API Error', { withMessage: true })
    }
}
