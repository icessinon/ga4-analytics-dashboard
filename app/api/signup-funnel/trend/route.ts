import { NextResponse } from 'next/server'
import { readGa4Body } from '@/lib/http/ga4Request'
import { errorResponse } from '@/lib/http/errorResponse'
import { runSignupTrendReport } from '@/lib/services/signupFunnel/signupFunnelTrendService'
import { parseDateString } from '@/lib/utils/date'

/** 会員登録フォームの日別推移（職種別×全体）。集計は lib/services/signupFunnel */
export async function POST(request: Request) {
    try {
        const { reporter, startDate, endDate } = await readGa4Body(request, {
            propertyIdMissingMessage: 'propertyId が必要です',
            resolveDates: (s, e) => ({ startDate: parseDateString(s), endDate: parseDateString(e) }),
        })
        const report = await runSignupTrendReport(reporter)
        return NextResponse.json({ success: true, startDate, endDate, ...report, fetchedAt: new Date().toISOString() })
    } catch (error) {
        return errorResponse(error, '会員登録推移の集計に失敗しました', 'Signup Funnel Trend API Error', { withMessage: true })
    }
}
