import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/http/errorResponse'
import { runSignupStepMailsReport } from '@/lib/services/signupStepMails/signupStepMailsService'

/** 会員登録後ステップメールの送信数・開封率。集計は lib/services/signupStepMails/signupStepMailsService.ts */
export async function POST(request: Request) {
    try {
        const { days } = (await request.json().catch(() => ({}))) as { days?: unknown }
        const report = await runSignupStepMailsReport(days)
        return NextResponse.json({ success: true, ...report })
    } catch (error) {
        return errorResponse(error, 'ステップメール実績の集計に失敗しました', 'Signup Step Mails API Error', { withMessage: true })
    }
}
