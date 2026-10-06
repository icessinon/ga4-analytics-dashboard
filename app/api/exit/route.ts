import { NextResponse } from 'next/server'
import { readGa4Body } from '@/lib/http/ga4Request'
import { HttpError, errorResponse } from '@/lib/http/errorResponse'
import { runExitReport } from '@/lib/services/journey/exitService'

const REQUIRED = 'propertyId and at least 2 steps are required'

/** ページカテゴリで組んだファネルの離脱状況。集計は lib/services/journey/exitService.ts */
export async function POST(request: Request) {
    try {
        const { reporter, raw } = await readGa4Body(request, { propertyIdMissingMessage: REQUIRED, defaultEndDate: 'today' })
        const steps = raw.steps
        if (!Array.isArray(steps) || steps.length < 2) throw new HttpError(400, REQUIRED)
        const deviceFilter = typeof raw.deviceFilter === 'string' && raw.deviceFilter ? raw.deviceFilter : undefined
        const report = await runExitReport(reporter, steps.map(String), deviceFilter)
        return NextResponse.json(report)
    } catch (error) {
        return errorResponse(error, 'Unknown error', 'Exit API Error')
    }
}
