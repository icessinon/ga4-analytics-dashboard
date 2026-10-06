import { NextResponse } from 'next/server'
import { readGa4Body } from '@/lib/http/ga4Request'
import { errorResponse } from '@/lib/http/errorResponse'
import { runSegmentBuilderReport } from '@/lib/services/user/segmentBuilderService'
import type { SegmentCondition } from '@/lib/services/user/segmentBuilderTypes'
import { parseDateString } from '@/lib/utils/date'

export type { SegmentCondition }

function fmtLocalDate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** AND 条件で定義したセグメントの集計。既定期間は今日までの 30 日 */
export async function POST(request: Request) {
    try {
        const today = new Date()
        const { reporter, raw } = await readGa4Body(request, {
            propertyIdMissingMessage: 'propertyId is required',
            defaultStartDate: fmtLocalDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30)),
            defaultEndDate: fmtLocalDate(today),
            resolveDates: (s, e) => ({ startDate: parseDateString(s), endDate: parseDateString(e) }),
        })
        const conditions = (Array.isArray(raw.conditions) ? raw.conditions : []) as SegmentCondition[]
        const report = await runSegmentBuilderReport(reporter, conditions)
        return NextResponse.json({ success: true, ...report, conditionCount: conditions.length })
    } catch (error) {
        return errorResponse(error, 'セグメント分析に失敗しました', 'Segment Builder API Error', { withMessage: true })
    }
}
