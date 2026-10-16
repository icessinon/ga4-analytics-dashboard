import { NextResponse } from 'next/server'
import { readGa4Body } from '@/lib/http/ga4Request'
import { errorResponse } from '@/lib/http/errorResponse'
import { runApplyTrendReport } from '@/lib/services/apply/applyTrendService'
import { parseDateString } from '@/lib/utils/date'

/** 応募数の推移（日次・週次・月次を契約種別で分解＋施策の年表）。集計は lib/services/apply */
export async function POST(request: Request) {
    try {
        const { propertyId, startDate, endDate } = await readGa4Body(request, {
            propertyIdMissingMessage: 'propertyId が必要です',
            resolveDates: (s, e) => ({ startDate: parseDateString(s), endDate: parseDateString(e) }),
        })
        const report = await runApplyTrendReport(propertyId, startDate, endDate)
        return NextResponse.json({ success: true, startDate, endDate, ...report, fetchedAt: new Date().toISOString() })
    } catch (error) {
        return errorResponse(error, '応募推移の集計に失敗しました', 'Apply Trend API Error', { withMessage: true })
    }
}
