/**
 * AB テスト実行結果の保存。
 * Report（product ごとの 'ab_test' レポート）→ ReportExecution → AbTestReportExecution → AbTest 更新 →
 * バリアント別 AbTestResult。BQ への蓄積（report_execution_log / ab_test_result_log）は待たない。
 * ※ サーバー専用
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/client'
import { insertAbTestResultLog, insertReportExecutionLog, jstReportDate, jstReportMonth, nowIso } from '@/lib/bq/write'
import type { GA4Config } from '@/lib/services/ab-test/ga4ConfigTypes'
import type { AbTestEvaluationOutcome, ExecutableAbTest } from './types'

export interface PersistedExecution {
    reportExecutionId: number
    abTestReportExecution: { id: number; status: string; errorMessage?: string | null }
}

export async function persistExecution(abTest: ExecutableAbTest, ga4Config: GA4Config, outcome: AbTestEvaluationOutcome): Promise<PersistedExecution> {
    const { report, cvrResults, variants, abTestEvaluation, winnerVariant, improvementVsAPercent } = outcome
    const configJson = ga4Config as unknown as Prisma.InputJsonValue

    const existing = await prisma.report.findFirst({ where: { reportType: 'ab_test', productId: abTest.productId } })
    const abTestReport = existing
        ? await prisma.report.update({ where: { id: existing.id }, data: { config: configJson } })
        : await prisma.report.create({
            data: { productId: abTest.productId, name: 'ABテストレポート', reportType: 'ab_test', config: configJson, isActive: true },
        })

    const resultDataJson = JSON.parse(JSON.stringify({ report, cvrResults, abTestEvaluation }))
    const startedAt = new Date()
    const completedAt = new Date()
    const reportExecution = await prisma.reportExecution.create({
        data: { reportId: abTestReport.id, status: 'completed', startedAt, completedAt, resultData: resultDataJson },
    })
    void insertReportExecutionLog({
        execution_id: reportExecution.id,
        report_id: abTestReport.id,
        product_id: abTest.productId,
        report_type: 'ab_test',
        report_name: abTestReport.name,
        status: 'completed',
        config: JSON.stringify(ga4Config),
        result_summary: JSON.stringify(resultDataJson),
        started_at: startedAt.toISOString(),
        completed_at: completedAt.toISOString(),
        error_message: null,
        report_month: jstReportMonth(completedAt),
        report_date: jstReportDate(completedAt),
        synced_at: nowIso(),
    })

    const abTestReportExecution = await prisma.abTestReportExecution.create({
        data: {
            abTestId: abTest.id,
            reportExecutionId: reportExecution.id,
            status: 'completed',
            startedAt: new Date(),
            completedAt: new Date(),
            resultData: resultDataJson,
        },
    })

    await prisma.abTest.update({
        where: { id: abTest.id },
        data: {
            lastExecutedAt: new Date(),
            winnerVariant: winnerVariant ?? undefined,
            improvementVsAPercent: improvementVsAPercent != null ? improvementVsAPercent : undefined,
        } as Prisma.AbTestUpdateInput,
    })

    // バリアント別の実行結果を ab_test_results に保存し BQ(ab_test_result_log)へ蓄積
    // （BQでのAB横断分析・施策提案AI壁打ちのコンテキストに使う）
    try {
        const executedAt = new Date()
        const significance = abTestEvaluation?.checks?.significance?.value ?? null
        const zScore = abTestEvaluation ? parseFloat(abTestEvaluation.checks.significance.zScore) || null : null
        const periodDays = abTestEvaluation?.checks?.period?.days ?? null
        for (const v of variants) {
            const abTestResult = await prisma.abTestResult.create({
                data: {
                    abTestId: abTest.id,
                    reportExecutionId: reportExecution.id,
                    variant: v.name.charAt(0),
                    pageViews: v.data.pv,
                    conversions: v.data.cv,
                    conversionRate: v.data.cvr,
                    statisticalSignificance: significance,
                    zScore,
                    periodDays,
                    recommendation: abTestEvaluation?.recommendation ?? null,
                },
            })
            void insertAbTestResultLog({
                result_id: abTestResult.id,
                ab_test_id: abTest.id,
                product_id: abTest.productId,
                ab_test_name: abTest.name,
                variant: v.name.charAt(0),
                variant_a_name: abTest.variantAName,
                variant_b_name: abTest.variantBName,
                page_views: v.data.pv,
                conversions: v.data.cv,
                conversion_rate: v.data.cvr,
                statistical_significance: significance,
                z_score: zScore,
                period_days: periodDays,
                ai_evaluation: abTestEvaluation?.aiEvaluation ?? null,
                recommendation: abTestEvaluation?.recommendation ?? null,
                winner_variant: winnerVariant,
                improvement_vs_a_pct: improvementVsAPercent,
                ab_test_status: abTest.status,
                start_date: abTest.startDate.toISOString().split('T')[0],
                end_date: abTest.endDate ? abTest.endDate.toISOString().split('T')[0] : null,
                report_month: jstReportMonth(executedAt),
                report_date: jstReportDate(executedAt),
                synced_at: nowIso(),
            })
        }
    } catch (err) {
        console.error(`[abTestExecute] バリアント別結果の保存失敗 (ID: ${abTest.id}):`, err instanceof Error ? err.message : err)
    }

    return { reportExecutionId: reportExecution.id, abTestReportExecution }
}

/** 失敗した実行も履歴に残す（Slack 通知の対象にもなる） */
export async function persistFailure(abTest: ExecutableAbTest, errorMessage: string) {
    return prisma.abTestReportExecution.create({
        data: { abTestId: abTest.id, status: 'failed', startedAt: new Date(), errorMessage },
    })
}
