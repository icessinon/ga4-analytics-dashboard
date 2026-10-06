import { NextResponse } from 'next/server'
import { readGa4Body } from '@/lib/http/ga4Request'
import { errorResponse } from '@/lib/http/errorResponse'
import { parseDateString } from '@/lib/utils/date'
import { buildAdHocSpec, toAdHocTable } from '@/lib/services/analytics/adHocQuery'

/** GA4 データ閲覧: 画面で指定した metrics / dimensions / filter をそのまま投げてテーブルで返す */
export async function POST(request: Request) {
    try {
        const { reporter, raw } = await readGa4Body(request, {
            defaultStartDate: 'yesterday',
            resolveDates: (s, e) => ({ startDate: parseDateString(s), endDate: parseDateString(e) }),
        })
        const report = await reporter.run(buildAdHocSpec(raw))
        return NextResponse.json({ success: true, data: toAdHocTable(report) })
    } catch (error) {
        return errorResponse(error, 'Failed to fetch GA4 data', 'GA4 Data API Error', { withMessage: true })
    }
}
