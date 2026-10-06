import { NextResponse } from 'next/server'
import { readGa4Body } from '@/lib/http/ga4Request'
import { errorResponse } from '@/lib/http/errorResponse'
import { runInsightsReport } from '@/lib/services/insights/insightsService'

/** 月次インサイト（基準月の KPI・前月比・週次・12 ヶ月トレンド）。集計は lib/services/insights/insightsService.ts */
export async function POST(request: Request) {
    try {
        const { reporter, raw } = await readGa4Body(request, { propertyIdMissingMessage: 'propertyId is required' })
        const report = await runInsightsReport(reporter, typeof raw.baseMonth === 'string' ? raw.baseMonth : undefined)
        return NextResponse.json(report)
    } catch (error) {
        return errorResponse(error, 'error', 'Insights API Error')
    }
}
