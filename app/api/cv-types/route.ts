import { NextResponse } from 'next/server'
import { readGa4Body } from '@/lib/http/ga4Request'
import { errorResponse } from '@/lib/http/errorResponse'
import { runCvTypesReport } from '@/lib/services/cv/cvTypesService'

/** 求人種別（人材紹介 / 求人広告 / ハローワーク）× ステージの CV 分解。集計は lib/services/cv/cvTypesService.ts */
export async function POST(request: Request) {
    try {
        const { reporter, startDate, endDate } = await readGa4Body(request, {
            propertyIdMissingMessage: 'propertyId が必要です',
        })
        const report = await runCvTypesReport(reporter)
        return NextResponse.json({ ...report, startDate, endDate })
    } catch (error) {
        return errorResponse(error, 'Failed to fetch cv types', 'CV Types API Error')
    }
}
