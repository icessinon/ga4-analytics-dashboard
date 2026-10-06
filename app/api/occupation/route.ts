import { NextResponse } from 'next/server'
import { readGa4Body } from '@/lib/http/ga4Request'
import { errorResponse } from '@/lib/http/errorResponse'
import { runOccupationReport } from '@/lib/services/cv/occupationService'

/** 職種別 会員登録CV・登録率・LP応募CV。集計は lib/services/cv/occupationService.ts */
export async function POST(request: Request) {
    try {
        const { reporter, startDate, endDate } = await readGa4Body(request, {
            propertyIdMissingMessage: 'propertyId is required',
        })
        const report = await runOccupationReport(reporter)
        return NextResponse.json({ ...report, startDate, endDate })
    } catch (error) {
        return errorResponse(error, 'Failed to fetch occupation data', 'Occupation API Error')
    }
}
