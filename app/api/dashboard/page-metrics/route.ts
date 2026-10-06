import { NextResponse } from 'next/server'
import { readGa4Body } from '@/lib/http/ga4Request'
import { HttpError, errorResponse } from '@/lib/http/errorResponse'
import { loadPageCvConfig } from '@/lib/services/dashboard/pageCvConfig'
import { monthToRange } from '@/lib/services/dashboard/pageMetricsPeriod'
import { runPageMetrics } from '@/lib/services/dashboard/pageMetricsService'

const REQUIRED = 'propertyId and pagePath are required'

/**
 * 指定ページパスの GA4 指標（PV, CV, CVR, 離脱率, 新規訪問率, 直帰数, 平均滞在時間 など）。
 * month（YYYY-MM）があればその月、無ければ startDate / endDate（既定 28daysAgo〜yesterday）。
 * 集計は lib/services/dashboard/pageMetricsService.ts
 */
export async function POST(request: Request) {
    try {
        const body = await readGa4Body(request, { propertyIdMissingMessage: REQUIRED, defaultStartDate: '28daysAgo' })
        const pagePath = body.raw.pagePath
        if (typeof pagePath !== 'string' || pagePath === '') throw new HttpError(400, REQUIRED)

        const month = typeof body.raw.month === 'string' && /^\d{4}-\d{2}$/.test(body.raw.month) ? body.raw.month : null
        const range = month ? monthToRange(month) : { startDate: body.startDate, endDate: body.endDate }
        const reporter = month ? body.reporter.withDateRanges([range]) : body.reporter

        const cv = await loadPageCvConfig(body.raw.productId, pagePath)
        const metrics = await runPageMetrics(reporter, pagePath, cv)
        return NextResponse.json({ success: true, pagePath, ...range, ...metrics })
    } catch (error) {
        return errorResponse(error, 'ページ指標の取得に失敗しました', 'Dashboard page-metrics API error', { withMessage: true })
    }
}
