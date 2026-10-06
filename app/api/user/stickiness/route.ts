import { NextResponse } from 'next/server'
import { readGa4Body } from '@/lib/http/ga4Request'
import { HttpError, errorResponse } from '@/lib/http/errorResponse'
import { runStickinessReport } from '@/lib/services/user/stickinessService'

/** DAU / WAU / MAU とスティッキネス。compareStartDate / compareEndDate で比較期間も返す */
export async function POST(request: Request) {
    try {
        const { reporter, raw } = await readGa4Body(request, { propertyIdMissingMessage: 'propertyId is required' })
        if (!raw.startDate || !raw.endDate) throw new HttpError(400, 'startDate and endDate are required')

        const compareStartDate = typeof raw.compareStartDate === 'string' ? raw.compareStartDate : ''
        const compareEndDate = typeof raw.compareEndDate === 'string' ? raw.compareEndDate : ''
        const hasCompare = !!(compareStartDate && compareEndDate)

        const [current, compare] = await Promise.all([
            runStickinessReport(reporter),
            hasCompare
                ? runStickinessReport(reporter.withDateRanges([{ startDate: compareStartDate, endDate: compareEndDate }]))
                : Promise.resolve(null),
        ])

        return NextResponse.json({ success: true, current, compare })
    } catch (error) {
        return errorResponse(error, 'Failed to fetch stickiness data', 'Stickiness API Error', { withMessage: true })
    }
}
