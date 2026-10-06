import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { readGa4Body } from '@/lib/http/ga4Request'
import { HttpError, errorResponse } from '@/lib/http/errorResponse'
import { parseDateString } from '@/lib/utils/date'
import { generateReport, persistReportExecution, type ReportGenerationInput } from '@/lib/services/analytics/reportGenerationService'

const REQUIRED = 'propertyId and reportName are required'

/**
 * GA4 分析（レポートビルダー）の実行。クエリ → CVR → AB 判定 → 保存。
 * 処理本体は lib/services/analytics/reportGenerationService.ts
 */
export async function POST(request: Request) {
    try {
        const { reporter, raw, startDate, endDate } = await readGa4Body(request, {
            propertyIdMissingMessage: REQUIRED,
            defaultStartDate: 'yesterday',
            resolveDates: (s, e) => ({ startDate: parseDateString(s), endDate: parseDateString(e) }),
        })
        const reportName = typeof raw.reportName === 'string' ? raw.reportName : ''
        if (!reportName) throw new HttpError(400, REQUIRED)
        const productId = Number(raw.productId)
        if (!raw.productId || !Number.isFinite(productId)) throw new HttpError(400, 'productId is required')

        const input = raw as unknown as ReportGenerationInput
        const result = await generateReport(reporter, input)
        const { reportId, executionId } = await persistReportExecution({
            productId,
            reportName,
            config: {
                propertyId: reporter.ctx.propertyId,
                startDate,
                endDate,
                metrics: raw.metrics,
                dimensions: raw.dimensions,
                filter: raw.filter,
                limit: raw.limit === undefined ? 10000 : raw.limit,
                cvrA: raw.cvrA,
                cvrB: raw.cvrB,
                cvrC: raw.cvrC,
                cvrD: raw.cvrD,
                abTestEvaluationConfig: raw.abTestEvaluationConfig,
                geminiConfig: raw.geminiConfig,
            } as Prisma.InputJsonObject,
            result,
        })
        return NextResponse.json({ success: true, ...result, reportId, executionId })
    } catch (error) {
        return errorResponse(error, 'Failed to generate report', 'Analytics Report API Error', { withMessage: true })
    }
}
