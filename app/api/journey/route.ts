import { NextResponse } from 'next/server'
import { readGa4Body } from '@/lib/http/ga4Request'
import { errorResponse } from '@/lib/http/errorResponse'
import { runJourneyReport } from '@/lib/services/journey/journeyService'

/** ゴール到達までの経路（チャネル → N-2 → N-1 → ゴール）。集計は lib/services/journey/journeyService.ts */
export async function POST(request: Request) {
    try {
        const { reporter, raw } = await readGa4Body(request, {
            propertyIdMissingMessage: 'propertyId is required',
            defaultEndDate: 'today',
        })
        const str = (v: unknown, fallback: string) => (typeof v === 'string' && v ? v : fallback)
        const report = await runJourneyReport(reporter, {
            goalPath: str(raw.goalPath, '/members/signup'),
            goalLabel: str(raw.goalLabel, '会員登録フォーム'),
            domain: str(raw.domain, 'x-work.jp'),
            deviceFilter: typeof raw.deviceFilter === 'string' && raw.deviceFilter ? raw.deviceFilter : undefined,
        })
        return NextResponse.json(report)
    } catch (error) {
        return errorResponse(error, 'Unknown error', 'Journey API Error')
    }
}
