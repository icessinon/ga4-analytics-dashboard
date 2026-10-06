/**
 * GA4 分析（レポートビルダー）の実行。
 * 自由指定クエリ → CVR A〜D → AB 判定（任意で Gemini 講評）→ Report / ReportExecution 保存 → BQ ログ。
 * 元は /api/analytics/report に 270 行で書かれていたもの。
 * ※ サーバー専用
 */

import type { Prisma } from '@prisma/client'
import type { GA4ReportResponse } from '@/lib/api/ga4/client'
import type { Ga4Reporter } from '@/lib/api/ga4/report'
import { evaluateWithGemini } from '@/lib/api/gemini/client'
import { insertReportExecutionLog, jstReportDate, jstReportMonth, nowIso } from '@/lib/bq/write'
import { prisma } from '@/lib/db/client'
import { evaluateAbTestResult, type AbTestEvaluation, type AbTestEvaluationConfig } from '@/lib/services/ab-test/abTestService'
import { getGeminiApiKey } from '@/lib/utils/gemini'
import { buildAdHocSpec, type AdHocQueryInput } from './adHocQuery'
import { calculateCVR, type CvrConfig, type CvrResult } from './cvrService'

export type CvrSlot = 'A' | 'B' | 'C' | 'D'
const CVR_SLOTS: readonly CvrSlot[] = ['A', 'B', 'C', 'D']

export interface ReportGenerationInput extends AdHocQueryInput {
    cvrA?: CvrConfig | null
    cvrB?: CvrConfig | null
    cvrC?: CvrConfig | null
    cvrD?: CvrConfig | null
    abTestEvaluationConfig?: AbTestEvaluationConfig | null
    geminiConfig?: { enabled?: boolean; apiKey?: string | null } | null
}

/** dataA〜dataD。設定が無いスロットはキー自体が無い */
export type CvrResults = Partial<Record<`data${CvrSlot}`, CvrResult>>

export interface GeneratedReport {
    report: GA4ReportResponse
    cvrResults: CvrResults
    abTestEvaluation: (AbTestEvaluation & { aiEvaluation?: string }) | null
}

export async function generateReport(reporter: Ga4Reporter, input: ReportGenerationInput): Promise<GeneratedReport> {
    const report = await reporter.run(buildAdHocSpec(input))
    const dimensionHeaders = report.dimensionHeaders || []
    const metricHeaders = report.metricHeaders || []

    const cvrResults: CvrResults = {}
    for (const slot of CVR_SLOTS) {
        const cfg = input[`cvr${slot}`]
        if (cfg) cvrResults[`data${slot}`] = calculateCVR(report, cfg, dimensionHeaders, metricHeaders)
    }

    let abTestEvaluation: GeneratedReport['abTestEvaluation'] = null
    if (input.abTestEvaluationConfig && Object.keys(cvrResults).length >= 2) {
        const variants = CVR_SLOTS.flatMap((slot) => {
            const data = cvrResults[`data${slot}`]
            return data ? [{ name: slot, data }] : []
        }).sort((a, b) => b.data.cvr - a.data.cvr)

        if (variants.length >= 2) {
            const [winner, runnerUp] = variants
            const { startDate, endDate } = reporter.ctx.dateRanges[0]
            abTestEvaluation = evaluateAbTestResult(winner, runnerUp, startDate, endDate, input.abTestEvaluationConfig, variants)

            const apiKey = input.geminiConfig?.enabled ? getGeminiApiKey(input.geminiConfig.apiKey) : null
            if (apiKey && abTestEvaluation) {
                try {
                    const aiEvaluation = await evaluateWithGemini(
                        { evaluation: abTestEvaluation, winner, runnerUp, config: input.abTestEvaluationConfig },
                        apiKey,
                    )
                    if (aiEvaluation) abTestEvaluation.aiEvaluation = aiEvaluation
                } catch (error) {
                    // AI 講評が落ちてもレポート生成は続行
                    console.error('Gemini評価エラー:', error)
                }
            }
        }
    }

    return { report, cvrResults, abTestEvaluation }
}

export interface PersistReportInput {
    productId: number
    reportName: string
    /** Report.config にそのまま保存する内容（画面が次回読み戻す） */
    config: Prisma.InputJsonObject
    result: GeneratedReport
}

/**
 * 同名レポートがあれば config を更新、無ければ作成し、実行結果を ReportExecution に保存する。
 * BQ へのログ送信は待たない（失敗しても画面には影響させない）。
 */
export async function persistReportExecution({ productId, reportName, config, result }: PersistReportInput): Promise<{ reportId: number; executionId: number }> {
    const existing = await prisma.report.findFirst({ where: { productId, name: reportName } })
    const reportRecord = existing
        ? await prisma.report.update({ where: { id: existing.id }, data: { config, updatedAt: new Date() } })
        : await prisma.report.create({ data: { productId, name: reportName, reportType: 'ga4', config } })

    const startedAt = new Date()
    const completedAt = new Date()
    const resultData = JSON.parse(JSON.stringify(result))
    const execution = await prisma.reportExecution.create({
        data: { reportId: reportRecord.id, status: 'completed', startedAt, completedAt, resultData },
    })
    void insertReportExecutionLog({
        execution_id: execution.id,
        report_id: reportRecord.id,
        product_id: reportRecord.productId,
        report_type: reportRecord.reportType,
        report_name: reportRecord.name,
        status: 'completed',
        config: JSON.stringify(reportRecord.config),
        result_summary: JSON.stringify(resultData),
        started_at: startedAt.toISOString(),
        completed_at: completedAt.toISOString(),
        error_message: null,
        report_month: jstReportMonth(completedAt),
        report_date: jstReportDate(completedAt),
        synced_at: nowIso(),
    })
    return { reportId: reportRecord.id, executionId: execution.id }
}
