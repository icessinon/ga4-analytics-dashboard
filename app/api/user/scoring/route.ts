import { NextResponse } from 'next/server'
import { readGa4Body } from '@/lib/http/ga4Request'
import { errorResponse } from '@/lib/http/errorResponse'
import { fmtLocalDate, runScoringReport } from '@/lib/services/user/scoringService'
import { parseDateString } from '@/lib/utils/date'

/**
 * セグメント軸別の活動スコア。
 * 期間は startDate / endDate 優先、無ければ periodDays（既定 30）から今日までを使う。
 */
export async function POST(request: Request) {
    try {
        const today = new Date()
        const body = await readGa4Body(request, {
            propertyIdMissingMessage: 'propertyId is required',
            defaultStartDate: '',
            defaultEndDate: fmtLocalDate(today),
            resolveDates: (s, e) => ({ startDate: s ? parseDateString(s) : '', endDate: parseDateString(e) }),
        })
        const segmentDimension = typeof body.raw.segmentDimension === 'string' && body.raw.segmentDimension ? body.raw.segmentDimension : 'deviceCategory'
        const periodDays = typeof body.raw.periodDays === 'number' ? body.raw.periodDays : 30
        let startDate = body.startDate
        if (!startDate) {
            const fullStart = new Date(today)
            fullStart.setDate(today.getDate() - periodDays)
            startDate = parseDateString(fmtLocalDate(fullStart))
        }

        const reporter = body.reporter.withDateRanges([{ startDate, endDate: body.endDate }])
        const { segments, summary } = await runScoringReport(reporter, segmentDimension)
        if (segments.length === 0) {
            return NextResponse.json({ success: true, segments: [], summary })
        }
        return NextResponse.json({ success: true, segments, summary, periodDays, segmentDimension })
    } catch (error) {
        return errorResponse(error, 'スコアリングに失敗しました', 'Scoring API Error', { withMessage: true })
    }
}
