import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/client'
import { fetchGA4Data, getGA4AccessToken, type GA4ReportRequest } from '@/lib/api/ga4/client'
import { calculateCVR, type CvrResult, type CvrConfig } from '@/lib/services/analytics/cvrService'
import { buildGa4ConfigDimensionFilter } from '@/lib/services/ab-test/ga4ConfigFilter'
import { evaluateAbTestResult, type AbTestEvaluation, type AbTestVariant, type AbTestEvaluationConfig } from '@/lib/services/ab-test/abTestService'
import { evaluateWithGemini } from '@/lib/api/gemini/client'
import { parseDateString } from '@/lib/utils/date'
import { getGeminiApiKey } from '@/lib/utils/gemini'
import { notifyAbTestReportCompletion } from '@/lib/services/ab-test/execution/slackNotifier'
import { createErrorResponse, getErrorMessage } from '@/lib/utils/error'
import { insertAbTestResultLog, insertReportExecutionLog, jstReportDate, jstReportMonth, nowIso } from '@/lib/bq/write'
import { generateAndStoreFinalReport } from '@/lib/services/ab-test/finalReportService'
import { shareAbResult } from '@/lib/services/ab-test/abResultShareService'

interface GA4CvrConfig {
    denominatorLabels?: string[] | string
    numeratorLabels?: string[] | string
    [key: string]: unknown
}

interface GA4Config {
    propertyId: string
    dimensions?: Array<{ name: string }> | string
    metrics?: Array<{ name: string }> | string
    limit?: number
    filter?: {
        dimension?: string
        operator?: string
        expression?: string
    }
    excludeFilter?: {
        dimension?: string
        operator?: string
        expression?: string
    }
    cvrA?: GA4CvrConfig
    cvrB?: GA4CvrConfig
    cvrC?: GA4CvrConfig
    cvrD?: GA4CvrConfig
    geminiConfig?: {
        enabled?: boolean
        apiKey?: string
    }
    abTestEvaluationConfig?: Record<string, unknown>
}

/**
 * ABテスト自動実行API
 * 期間終了後のABテストに対してGA4分析を実行
 */
export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { abTestId, force } = body

        const now = new Date()
        // abTestId 指定時は手動実行（詳細画面のボタン等）も想定されるため autoExecute を条件にしない
        const where: Prisma.AbTestWhereInput = abTestId
            ? {
                id: parseInt(abTestId, 10),
                status: 'running',
                ga4Config: { not: Prisma.JsonNull },
            }
            : {
                status: 'running',
                autoExecute: true,
                ga4Config: { not: Prisma.JsonNull },
                endDate: { lte: now },
            }

        const abTests = await prisma.abTest.findMany({
            where,
            include: {
                product: {
                    select: {
                        id: true,
                        name: true,
                        ga4PropertyId: true,
                    },
                },
            },
        })

        if (abTests.length === 0) {
            return NextResponse.json({
                success: true,
                executed: 0,
                results: [],
                message: '実行すべきABテストがありません',
            })
        }

        const results: Array<{
            abTestId: number
            abTestName: string
            status: 'completed' | 'failed'
            reportExecutionId?: number
            errorMessage?: string
        }> = []

        for (const abTest of abTests) {
            try {
                const scheduleConfig = abTest.scheduleConfig as { executionType?: string } | null
                const executionType = scheduleConfig?.executionType
                const skipSameDayLastExecuted =
                    executionType !== 'scheduled' && executionType !== 'recurring'
                if (!force && abTest.lastExecutedAt && skipSameDayLastExecuted) {
                    const lastExecuted = new Date(abTest.lastExecutedAt)
                    const today = new Date()
                    today.setHours(0, 0, 0, 0)
                    if (lastExecuted >= today) {
                        continue
                    }
                }

                const ga4Config = abTest.ga4Config as unknown as GA4Config
                if (!ga4Config || !ga4Config.propertyId) {
                    throw new Error('GA4設定が不完全です')
                }

                const accessToken = await getGA4AccessToken()

                const startDate = parseDateString(abTest.startDate.toISOString().split('T')[0])
                const endDate = abTest.endDate
                    ? parseDateString(abTest.endDate.toISOString().split('T')[0])
                    : parseDateString('yesterday')

                const dimensions = Array.isArray(ga4Config.dimensions)
                    ? ga4Config.dimensions
                    : typeof ga4Config.dimensions === 'string'
                    ? ga4Config.dimensions.split(',').map((d: string) => ({ name: d.trim() }))
                    : []

                const metrics = Array.isArray(ga4Config.metrics)
                    ? ga4Config.metrics
                    : typeof ga4Config.metrics === 'string'
                    ? ga4Config.metrics.split(',').map((m: string) => ({ name: m.trim() }))
                    : []

                const ga4Request: GA4ReportRequest = {
                    propertyId: ga4Config.propertyId,
                    dateRanges: [{ startDate, endDate }],
                    dimensions: dimensions,
                    metrics: metrics,
                    // ワイルドカードラベルは職種横断で多数の行を拾うため底上げ（limit到達＝サイレント欠測）
                    limit: Math.max(ga4Config.limit || 0, 50000),
                }

                ga4Request.dimensionFilter = buildGa4ConfigDimensionFilter(ga4Config)

                const report = await fetchGA4Data(ga4Request, accessToken)

                const cvrResults: { dataA?: CvrResult; dataB?: CvrResult; dataC?: CvrResult; dataD?: CvrResult } = {}
                const dimensionHeaders = report.dimensionHeaders || []
                const metricHeaders = report.metricHeaders || []

                const normalizeCvrConfig = (cvrConfig: GA4CvrConfig): CvrConfig => {
                    return {
                        ...cvrConfig,
                        denominatorLabels: Array.isArray(cvrConfig.denominatorLabels)
                            ? cvrConfig.denominatorLabels
                            : typeof cvrConfig.denominatorLabels === 'string'
                            ? cvrConfig.denominatorLabels.split(',').map((l: string) => l.trim())
                            : [],
                        numeratorLabels: Array.isArray(cvrConfig.numeratorLabels)
                            ? cvrConfig.numeratorLabels
                            : typeof cvrConfig.numeratorLabels === 'string'
                            ? cvrConfig.numeratorLabels.split(',').map((l: string) => l.trim())
                            : [],
                    } as CvrConfig
                }

                if (ga4Config.cvrA) {
                    const normalizedCvrA = normalizeCvrConfig(ga4Config.cvrA)
                    cvrResults.dataA = calculateCVR(report, normalizedCvrA, dimensionHeaders, metricHeaders)
                }
                if (ga4Config.cvrB) {
                    const normalizedCvrB = normalizeCvrConfig(ga4Config.cvrB)
                    cvrResults.dataB = calculateCVR(report, normalizedCvrB, dimensionHeaders, metricHeaders)
                }
                if (ga4Config.cvrC) {
                    const normalizedCvrC = normalizeCvrConfig(ga4Config.cvrC)
                    cvrResults.dataC = calculateCVR(report, normalizedCvrC, dimensionHeaders, metricHeaders)
                }
                if (ga4Config.cvrD) {
                    const normalizedCvrD = normalizeCvrConfig(ga4Config.cvrD)
                    cvrResults.dataD = calculateCVR(report, normalizedCvrD, dimensionHeaders, metricHeaders)
                }

                let abTestEvaluation: AbTestEvaluation | null = null
                const cvrResultKeys = Object.keys(cvrResults)
                const evaluationConfig = (abTest.evaluationConfig || ga4Config.abTestEvaluationConfig || {}) as AbTestEvaluationConfig
                const variants: AbTestVariant[] = []
                if (cvrResults.dataA) variants.push({ name: 'A', data: cvrResults.dataA })
                if (cvrResults.dataB) variants.push({ name: 'B', data: cvrResults.dataB })
                if (cvrResults.dataC) variants.push({ name: 'C', data: cvrResults.dataC })
                if (cvrResults.dataD) variants.push({ name: 'D', data: cvrResults.dataD })
                variants.sort((a, b) => b.data.cvr - a.data.cvr)

                if (evaluationConfig && cvrResultKeys.length >= 2) {

                    if (variants.length >= 2) {
                        const winner = variants[0]
                        const runnerUp = variants[1]

                        abTestEvaluation = evaluateAbTestResult(
                            winner,
                            runnerUp,
                            startDate,
                            endDate,
                            evaluationConfig,
                            variants
                        )

                        const geminiConfig = ga4Config.geminiConfig || {}
                        if (geminiConfig.enabled && abTestEvaluation) {
                            const apiKey = getGeminiApiKey(geminiConfig.apiKey)
                            if (apiKey) {
                                try {
                                    const geminiEvaluation = await evaluateWithGemini(
                                        {
                                            evaluation: abTestEvaluation,
                                            winner,
                                            runnerUp,
                                            config: evaluationConfig,
                                            hypothesis: abTest.hypothesis,
                                            expectedImprovement: abTest.expectedImprovement != null ? Number(abTest.expectedImprovement) : null,
                                        },
                                        apiKey
                                    )
                                    if (geminiEvaluation) {
                                        abTestEvaluation.aiEvaluation = geminiEvaluation
                                    }
                                } catch (error) {
                                    console.error('Gemini評価エラー:', error)
                                }
                            }
                        }
                    }
                }

                let abTestReport = await prisma.report.findFirst({
                    where: {
                        reportType: 'ab_test',
                        productId: abTest.productId,
                    },
                })

                if (!abTestReport) {
                    abTestReport = await prisma.report.create({
                        data: {
                            productId: abTest.productId,
                            name: 'ABテストレポート',
                            reportType: 'ab_test',
                            config: ga4Config as unknown as Prisma.InputJsonValue,
                            isActive: true,
                        },
                    })
                } else {
                    abTestReport = await prisma.report.update({
                        where: { id: abTestReport.id },
                        data: {
                            config: ga4Config as unknown as Prisma.InputJsonValue,
                        },
                    })
                }

                const resultDataJson = JSON.parse(JSON.stringify({ report, cvrResults, abTestEvaluation }))
                const startedAt = new Date()
                const completedAt = new Date()
                const reportExecution = await prisma.reportExecution.create({
                    data: {
                        reportId: abTestReport.id,
                        status: 'completed',
                        startedAt,
                        completedAt,
                        resultData: resultDataJson,
                    },
                })
                void insertReportExecutionLog({
                    execution_id:   reportExecution.id,
                    report_id:      abTestReport.id,
                    product_id:     abTest.productId,
                    report_type:    'ab_test',
                    report_name:    abTestReport.name,
                    status:         'completed',
                    config:         JSON.stringify(ga4Config),
                    result_summary: JSON.stringify(resultDataJson),
                    started_at:     startedAt.toISOString(),
                    completed_at:   completedAt.toISOString(),
                    error_message:  null,
                    report_month:   jstReportMonth(completedAt),
                    report_date:    jstReportDate(completedAt),
                    synced_at:      nowIso(),
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

                let winnerVariant: string | null = null
                let improvementVsAPercent: number | null = null
                if (variants.length >= 2) {
                    const winner = variants[0]
                    winnerVariant = winner.name
                    const variantA = variants.find((v) => v.name === 'A')
                    if (variantA && winner.name !== 'A' && variantA.data.cvr > 0) {
                        improvementVsAPercent = (winner.data.cvr - variantA.data.cvr) / variantA.data.cvr * 100
                    }
                }

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
                    for (const v of variants) {
                        const abTestResult = await prisma.abTestResult.create({
                            data: {
                                abTestId: abTest.id,
                                reportExecutionId: reportExecution.id,
                                variant: v.name.charAt(0),
                                pageViews: v.data.pv,
                                conversions: v.data.cv,
                                conversionRate: v.data.cvr,
                                statisticalSignificance: abTestEvaluation?.checks?.significance?.value ?? null,
                                zScore: abTestEvaluation ? parseFloat(abTestEvaluation.checks.significance.zScore) || null : null,
                                periodDays: abTestEvaluation?.checks?.period?.days ?? null,
                                recommendation: abTestEvaluation?.recommendation ?? null,
                            },
                        })
                        void insertAbTestResultLog({
                            result_id:                abTestResult.id,
                            ab_test_id:               abTest.id,
                            product_id:               abTest.productId,
                            ab_test_name:             abTest.name,
                            variant:                  v.name.charAt(0),
                            variant_a_name:           abTest.variantAName,
                            variant_b_name:           abTest.variantBName,
                            page_views:               v.data.pv,
                            conversions:              v.data.cv,
                            conversion_rate:          v.data.cvr,
                            statistical_significance: abTestEvaluation?.checks?.significance?.value ?? null,
                            z_score:                  abTestEvaluation ? parseFloat(abTestEvaluation.checks.significance.zScore) || null : null,
                            period_days:              abTestEvaluation?.checks?.period?.days ?? null,
                            ai_evaluation:            abTestEvaluation?.aiEvaluation ?? null,
                            recommendation:           abTestEvaluation?.recommendation ?? null,
                            winner_variant:           winnerVariant,
                            improvement_vs_a_pct:     improvementVsAPercent,
                            ab_test_status:           abTest.status,
                            start_date:               abTest.startDate.toISOString().split('T')[0],
                            end_date:                 abTest.endDate ? abTest.endDate.toISOString().split('T')[0] : null,
                            report_month:             jstReportMonth(executedAt),
                            report_date:              jstReportDate(executedAt),
                            synced_at:                nowIso(),
                        })
                    }
                } catch (err) {
                    console.error(`[abTestExecute] バリアント別結果の保存失敗 (ID: ${abTest.id}):`, err instanceof Error ? err.message : err)
                }

                try {
                    await notifyAbTestReportCompletion(abTest, abTestReportExecution, {
                        cvrResults,
                        abTestEvaluation,
                    })
                } catch (error) {
                    console.error('Slack通知エラー:', error)
                }

                // テスト期間終了後の実行では AI 最終レポートを生成（未生成の場合のみ）
                if (abTest.endDate && abTest.endDate.getTime() <= Date.now() && !abTest.finalAiReport) {
                    await generateAndStoreFinalReport(abTest.id)
                    // 【仕様】テスト完了時はAB結果共有チャンネル（SLACK_WEBHOOK_URL_ABREPORT）へ
                    // 勝者・改善率・期間・サマリー/勝因・ダッシュボードURL入りの結果を自動共有する
                    try {
                        await shareAbResult(abTest.id, variants)
                    } catch (error) {
                        console.error('AB結果共有Slack通知エラー:', error)
                    }
                }

                results.push({
                    abTestId: abTest.id,
                    abTestName: abTest.name,
                    status: 'completed',
                    reportExecutionId: abTestReportExecution.id,
                })
            } catch (error) {
                console.error(`ABテスト実行エラー (ID: ${abTest.id}):`, error)
                const errorMessage = getErrorMessage(error)

                const failedExecution = await prisma.abTestReportExecution.create({
                    data: {
                        abTestId: abTest.id,
                        status: 'failed',
                        startedAt: new Date(),
                        errorMessage,
                    },
                })

                try {
                    await notifyAbTestReportCompletion(abTest, failedExecution, null)
                } catch (notifyError) {
                    console.error('Slack通知エラー:', notifyError)
                }

                results.push({
                    abTestId: abTest.id,
                    abTestName: abTest.name,
                    status: 'failed',
                    errorMessage,
                })
            }
        }

        return NextResponse.json({
            success: true,
            executed: results.length,
            results,
        })
    } catch (error) {
        console.error('AB Test Execute API Error:', error)
        return NextResponse.json(
            createErrorResponse(error, 'Failed to execute AB tests'),
            { status: 500 }
        )
    }
}
