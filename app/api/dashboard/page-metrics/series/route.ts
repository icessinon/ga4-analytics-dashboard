import { NextResponse } from 'next/server'
import { readGa4Body } from '@/lib/http/ga4Request'
import { HttpError, errorResponse } from '@/lib/http/errorResponse'
import { loadPageCvConfig } from '@/lib/services/dashboard/pageCvConfig'
import { parseGranularity, rangeForGranularity } from '@/lib/services/dashboard/pageMetricsPeriod'
import { runPageMetricsSeries } from '@/lib/services/dashboard/pageMetricsService'

const REQUIRED = 'propertyId and pagePath are required'
const RANGE_REQUIRED = 'Either month (YYYY-MM) or startDate and endDate (YYYY-MM-DD) are required'
const YMD = /^\d{4}-\d{2}-\d{2}$/

/**
 * ページパスの時系列（日別・週別・月別）。
 * startDate / endDate（YYYY-MM-DD）が揃っていればそれを、無ければ month から集計単位に応じた期間を作る。
 * 集計は lib/services/dashboard/pageMetricsService.ts
 */
export async function POST(request: Request) {
    try {
        const body = await readGa4Body(request, { propertyIdMissingMessage: REQUIRED })
        const { raw } = body
        const pagePath = raw.pagePath
        if (typeof pagePath !== 'string' || !pagePath) throw new HttpError(400, REQUIRED)

        const granularity = parseGranularity(raw.granularity)
        let range: { startDate: string; endDate: string }
        if (typeof raw.startDate === 'string' && typeof raw.endDate === 'string' && YMD.test(raw.startDate) && YMD.test(raw.endDate)) {
            range = { startDate: raw.startDate, endDate: raw.endDate }
        } else if (typeof raw.month === 'string' && /^\d{4}-\d{2}$/.test(raw.month)) {
            range = rangeForGranularity(raw.month, granularity)
        } else {
            throw new HttpError(400, RANGE_REQUIRED)
        }

        const cv = await loadPageCvConfig(raw.productId, pagePath)
        const series = await runPageMetricsSeries(body.reporter.withDateRanges([range]), pagePath, granularity, cv)
        return NextResponse.json({ success: true, series, granularity })
    } catch (error) {
        return errorResponse(error, '時系列の取得に失敗しました', 'Page metrics series API error', { withMessage: true })
    }
}
