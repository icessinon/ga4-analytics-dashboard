import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/http/errorResponse'
import { runBusinessKpiReport } from '@/lib/services/kpi/businessKpiService'

/** 応募数・会員登録数の月次（プロダクトDBが正）。集計は lib/services/kpi/businessKpiService.ts */
export async function POST(request: Request) {
    try {
        const { months } = (await request.json().catch(() => ({}))) as { months?: unknown }
        const report = await runBusinessKpiReport(months)
        return NextResponse.json({ success: true, ...report })
    } catch (error) {
        return errorResponse(error, '事業KPIの集計に失敗しました', 'Business KPI API Error', { withMessage: true })
    }
}
