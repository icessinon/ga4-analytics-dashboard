import { NextResponse } from 'next/server'
import { readGa4Body } from '@/lib/http/ga4Request'
import { errorResponse } from '@/lib/http/errorResponse'
import { runApplyFunnelReport } from '@/lib/services/apply/applyFunnelService'
import { parseDateString } from '@/lib/utils/date'

/** 求人一覧→詳細→応募フォーム→完了のセッション単位の遷移率（BigQuery・手動実行） */
export async function POST(request: Request) {
    try {
        const { startDate, endDate } = await readGa4Body(request, {
            propertyIdMissingMessage: 'propertyId が必要です',
            resolveDates: (s, e) => ({ startDate: parseDateString(s), endDate: parseDateString(e) }),
        })
        const report = await runApplyFunnelReport(startDate, endDate)
        return NextResponse.json({ success: true, ...report, fetchedAt: new Date().toISOString() })
    } catch (error) {
        return errorResponse(error, '応募ファネルの集計に失敗しました', 'Apply Funnel API Error', { withMessage: true })
    }
}
