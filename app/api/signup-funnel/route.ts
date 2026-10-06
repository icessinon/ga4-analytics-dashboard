import { NextResponse } from 'next/server'
import { readGa4Body } from '@/lib/http/ga4Request'
import { errorResponse } from '@/lib/http/errorResponse'
import { runSignupFunnelReport } from '@/lib/services/signupFunnel/signupFunnelService'
import { parseDateString } from '@/lib/utils/date'

/** 会員登録フォームの質問別ファネル（ラベル自動復元）。集計は lib/services/signupFunnel */
export async function POST(request: Request) {
    try {
        const { reporter, raw, startDate, endDate } = await readGa4Body(request, {
            propertyIdMissingMessage: 'propertyId が必要です',
            resolveDates: (s, e) => ({ startDate: parseDateString(s), endDate: parseDateString(e) }),
        })
        const report = await runSignupFunnelReport(reporter, typeof raw.form === 'string' ? raw.form : undefined)
        if (!report) {
            return NextResponse.json({ error: '対象期間に会員登録フォームのラベルがありません' }, { status: 404 })
        }
        return NextResponse.json({ success: true, startDate, endDate, ...report, fetchedAt: new Date().toISOString() })
    } catch (error) {
        return errorResponse(error, '会員登録ファネルの集計に失敗しました', 'Signup Funnel API Error', { withMessage: true })
    }
}
