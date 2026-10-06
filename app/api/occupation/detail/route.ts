import { NextResponse } from 'next/server'
import { readGa4Body } from '@/lib/http/ga4Request'
import { HttpError, errorResponse } from '@/lib/http/errorResponse'
import { VALID_OCCUPATION_SLUG, runOccupationDetailReport } from '@/lib/services/cv/occupationDetailService'

const REQUIRED = 'propertyId と slug が必要です'

/** 職種 URL 配下のセッション内訳。集計は lib/services/cv/occupationDetailService.ts */
export async function POST(request: Request) {
    try {
        const { reporter, raw, startDate, endDate } = await readGa4Body(request, { propertyIdMissingMessage: REQUIRED })
        const slug = raw.slug
        if (typeof slug !== 'string' || !VALID_OCCUPATION_SLUG.test(slug)) throw new HttpError(400, REQUIRED)
        const report = await runOccupationDetailReport(reporter, slug)
        return NextResponse.json({ ...report, startDate, endDate })
    } catch (error) {
        return errorResponse(error, 'Failed to fetch occupation detail', 'Occupation Detail API Error')
    }
}
