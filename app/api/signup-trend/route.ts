import { NextResponse } from 'next/server'
import { readGa4Body } from '@/lib/http/ga4Request'
import { errorResponse } from '@/lib/http/errorResponse'
import { runSignupTrendReport } from '@/lib/services/signup/signupTrendService'
import { parseDateString } from '@/lib/utils/date'

/** 会員登録の推移（日次・週次・月次の登録数と登録率＋施策の年表）。集計は lib/services/signup */
export async function POST(request: Request) {
    try {
        const { reporter, startDate, endDate } = await readGa4Body(request, {
            propertyIdMissingMessage: 'propertyId が必要です',
            resolveDates: (s, e) => ({ startDate: parseDateString(s), endDate: parseDateString(e) }),
        })
        const report = await runSignupTrendReport(reporter, startDate, endDate)
        return NextResponse.json({ success: true, startDate, endDate, ...report, fetchedAt: new Date().toISOString() })
    } catch (error) {
        return errorResponse(error, '会員登録推移の集計に失敗しました', 'Signup Trend API Error', { withMessage: true })
    }
}
