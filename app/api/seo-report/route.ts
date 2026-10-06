import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/http/errorResponse'
import { runSeoReport } from '@/lib/services/seo/seoReportService'

/** Search Console の掲載順位・表示・CTR・クリック（カテゴリ別・前期間比）。集計は lib/services/seo/seoReportService.ts */
export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as { days?: number; pathFilter?: string; startDate?: string; endDate?: string }
        const report = await runSeoReport({ days: body.days, pathFilter: body.pathFilter, startDate: body.startDate, endDate: body.endDate })
        return NextResponse.json({ success: true, ...report, fetchedAt: new Date().toISOString() })
    } catch (error) {
        return errorResponse(error, 'SEOレポートの集計に失敗しました', 'SEO Report API Error', { withMessage: true })
    }
}
