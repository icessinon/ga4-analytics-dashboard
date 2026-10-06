import { NextResponse } from 'next/server'
import { readGa4Body } from '@/lib/http/ga4Request'
import { errorResponse } from '@/lib/http/errorResponse'
import { fmtLocalDate, runCohortReport } from '@/lib/services/user/cohortService'
import { parseDateString } from '@/lib/utils/date'

/** 初回訪問週ごとの週次リテンション。既定期間は今日までの 77 日（約 11 週） */
export async function POST(request: Request) {
    try {
        const today = new Date()
        const { reporter, raw } = await readGa4Body(request, {
            propertyIdMissingMessage: 'propertyId is required',
            defaultStartDate: fmtLocalDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 77)),
            defaultEndDate: fmtLocalDate(today),
            resolveDates: (startDate, endDate) => ({ startDate: parseDateString(startDate), endDate: parseDateString(endDate) }),
        })
        const periods = typeof raw.periods === 'number' ? raw.periods : 6
        const cohorts = await runCohortReport(reporter, periods)
        return NextResponse.json({ success: true, cohorts, maxPeriods: periods })
    } catch (error) {
        return errorResponse(error, 'Failed to fetch cohort data', 'Cohort API Error', { withMessage: true })
    }
}
