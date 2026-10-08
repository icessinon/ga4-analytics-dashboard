import { NextResponse } from 'next/server'
import { createGa4Reporter } from '@/lib/api/ga4/report'
import { getGA4AccessToken } from '@/lib/api/ga4/client'
import { errorResponse } from '@/lib/http/errorResponse'
import { clampMonths, runBusinessKpiReport, startMonthOf } from '@/lib/services/kpi/businessKpiService'

/**
 * 応募数・会員登録数の月次（プロダクトDBが正）。propertyId を渡すとフォーム完了率（GA4）も付く。
 * 集計は lib/services/kpi/businessKpiService.ts
 */
export async function POST(request: Request) {
    try {
        const { months, propertyId } = (await request.json().catch(() => ({}))) as { months?: unknown; propertyId?: unknown }
        const pid = propertyId != null && propertyId !== '' ? String(propertyId) : null
        const reporter = pid
            ? createGa4Reporter({
                  propertyId: pid,
                  accessToken: await getGA4AccessToken(),
                  dateRanges: [{ startDate: `${startMonthOf(clampMonths(months))}`, endDate: 'yesterday' }],
              })
            : null
        const report = await runBusinessKpiReport(months, reporter)
        return NextResponse.json({ success: true, ...report })
    } catch (error) {
        return errorResponse(error, '事業KPIの集計に失敗しました', 'Business KPI API Error', { withMessage: true })
    }
}
