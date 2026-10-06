import { NextResponse } from 'next/server'
import { readGa4Body } from '@/lib/http/ga4Request'
import { HttpError, errorResponse } from '@/lib/http/errorResponse'
import { runPageFlowReport } from '@/lib/services/journey/pageFlowService'

const REQUIRED = 'propertyId と pagePath（/で始まる）が必要です'

/** 指定ページの直前・直後ページ。集計は lib/services/journey/pageFlowService.ts */
export async function POST(request: Request) {
    try {
        const { reporter, raw, startDate, endDate } = await readGa4Body(request, { propertyIdMissingMessage: REQUIRED })
        const pagePath = raw.pagePath
        if (typeof pagePath !== 'string' || !pagePath.startsWith('/')) throw new HttpError(400, REQUIRED)
        const report = await runPageFlowReport(reporter, pagePath.trim())
        return NextResponse.json({ ...report, startDate, endDate })
    } catch (error) {
        return errorResponse(error, 'Failed to fetch page flow', 'PageFlow API Error')
    }
}
