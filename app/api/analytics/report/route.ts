/**
 * GA4レポート生成API
 * 元のGASコードのoutputToSheet関数を参考に実装
 */

import { NextResponse } from 'next/server'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { calculateCVR } from '@/lib/services/analytics/cvrService'
import { evaluateAbTestResult } from '@/lib/services/ab-test/abTestService'
import { evaluateWithGemini } from '@/lib/api/gemini/client'
import { parseDateString } from '@/lib/utils/date'
import { prisma } from '@/lib/db/client'
import { createErrorResponse } from '@/lib/utils/error'
import { insertReportExecutionLog, jstReportDate, jstReportMonth, nowIso } from '@/lib/bq/write'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const {
            productId,
            reportName,
            propertyId,
            startDate,
            endDate,
            metrics,
            dimensions,
            filter,
            limit = 10000,
            cvrA,
            cvrB,
            cvrC,
            cvrD,
            abTestEvaluationConfig,
            geminiConfig,
        } = body

        if (!propertyId || !reportName) {
            return NextResponse.json(
                { error: 'propertyId and reportName are required' },
                { status: 400 }
            )
        }

        const accessToken = await getGA4AccessToken(body.accessToken)
        const parsedStartDate = parseDateString(startDate || 'yesterday')
        const parsedEndDate = parseDateString(endDate || 'yesterday')

        const ga4Request: any = {
            propertyId,
            dateRanges: [{ startDate: parsedStartDate, endDate: parsedEndDate }],
            dimensions: dimensions || [],
            metrics: metrics || [],
            limit,
            // 国ディメンションを扱うクエリではデフォルトの country=Japan フィルタを外す
            includeAllCountries:
                (dimensions || []).some((d: unknown) => (typeof d === 'string' ? d : (d as { name?: string })?.name) === 'country') ||
                filter?.dimension === 'country',
        }

        if (filter?.dimension && filter?.operator && filter?.expression) {
            const expressions = filter.expression
                .split(',')
                .map((s: string) => s.trim())
                .filter(Boolean)

            if (expressions.length === 0) {
            } else if (expressions.length > 1) {
                ga4Request.dimensionFilter = {
                    orGroup: {
                        expressions: expressions.map((exp: string) => ({
                            filter: {
                                fieldName: filter.dimension,
                                stringFilter: {
                                    matchType: filter.operator.toUpperCase(),
                                    value: exp,
                                },
                            },
                        })),
                    },
                }
            } else {
                ga4Request.dimensionFilter = {
                    filter: {
                        fieldName: filter.dimension,
                        stringFilter: {
                            matchType: filter.operator.toUpperCase(),
                            value: expressions[0],
                        },
                    },
                }
            }
        }

        const report = await fetchGA4Data(ga4Request, accessToken)

        const cvrResults: any = {}
        const dimensionHeaders = report.dimensionHeaders || []
        const metricHeaders = report.metricHeaders || []

        if (cvrA) {
            cvrResults.dataA = calculateCVR(report, cvrA, dimensionHeaders, metricHeaders)
        }
        if (cvrB) {
            cvrResults.dataB = calculateCVR(report, cvrB, dimensionHeaders, metricHeaders)
        }
        if (cvrC) {
            cvrResults.dataC = calculateCVR(report, cvrC, dimensionHeaders, metricHeaders)
        }
        if (cvrD) {
            cvrResults.dataD = calculateCVR(report, cvrD, dimensionHeaders, metricHeaders)
        }

        let abTestEvaluation = null
        const cvrResultKeys = Object.keys(cvrResults)
        if (abTestEvaluationConfig && cvrResultKeys.length >= 2) {
            const variants = []
            if (cvrResults.dataA) variants.push({ name: 'A', data: cvrResults.dataA })
            if (cvrResults.dataB) variants.push({ name: 'B', data: cvrResults.dataB })
            if (cvrResults.dataC) variants.push({ name: 'C', data: cvrResults.dataC })
            if (cvrResults.dataD) variants.push({ name: 'D', data: cvrResults.dataD })

            variants.sort((a, b) => b.data.cvr - a.data.cvr)

            if (variants.length >= 2) {
                const winner = variants[0]
                const runnerUp = variants[1]

                abTestEvaluation = evaluateAbTestResult(
                    winner,
                    runnerUp,
                    parsedStartDate,
                    parsedEndDate,
                    abTestEvaluationConfig,
                    variants
                )

                if (geminiConfig?.enabled && abTestEvaluation) {
                    const { getGeminiApiKey } = await import('@/lib/utils/gemini')
                    const apiKey = getGeminiApiKey(geminiConfig.apiKey)
                    
                    if (apiKey) {
                        try {
                            const geminiEvaluation = await evaluateWithGemini(
                                {
                                    evaluation: abTestEvaluation,
                                    winner,
                                    runnerUp,
                                    config: abTestEvaluationConfig,
                                },
                                apiKey
                            )
                            if (geminiEvaluation) {
                                (abTestEvaluation as any).aiEvaluation = geminiEvaluation
                            }
                        } catch (error) {
                            console.error('Gemini評価エラー:', error)
                            // エラーが発生してもレポート生成は続行
                        }
                    }
                }
            }
        }

        if (!productId) {
            return NextResponse.json(
                { error: 'productId is required' },
                { status: 400 }
            )
        }

        let reportRecord = null
        let executionRecord = null

        const existingReport = await prisma.report.findFirst({
            where: {
                productId,
                name: reportName,
            },
        })

        if (existingReport) {
            reportRecord = await prisma.report.update({
                where: { id: existingReport.id },
                data: {
                    config: {
                        propertyId,
                        startDate: parsedStartDate,
                        endDate: parsedEndDate,
                        metrics,
                        dimensions,
                        filter,
                        limit,
                        cvrA,
                        cvrB,
                        cvrC,
                        cvrD,
                        abTestEvaluationConfig,
                        geminiConfig,
                    },
                    updatedAt: new Date(),
                },
            })
        } else {
            reportRecord = await prisma.report.create({
                data: {
                    productId,
                    name: reportName,
                    reportType: 'ga4',
                    config: {
                        propertyId,
                        startDate: parsedStartDate,
                        endDate: parsedEndDate,
                        metrics,
                        dimensions,
                        filter,
                        limit,
                        cvrA,
                        cvrB,
                        cvrC,
                        cvrD,
                        abTestEvaluationConfig,
                        geminiConfig,
                    },
                },
            })
        }

        if (reportRecord) {
            const startedAt = new Date()
            const completedAt = new Date()
            const resultData = JSON.parse(JSON.stringify({ report, cvrResults, abTestEvaluation }))
            executionRecord = await prisma.reportExecution.create({
                data: {
                    reportId: reportRecord.id,
                    status: 'completed',
                    startedAt,
                    completedAt,
                    resultData,
                },
            })
            void insertReportExecutionLog({
                execution_id:   executionRecord.id,
                report_id:      reportRecord.id,
                product_id:     reportRecord.productId,
                report_type:    reportRecord.reportType,
                report_name:    reportRecord.name,
                status:         'completed',
                config:         JSON.stringify(reportRecord.config),
                result_summary: JSON.stringify(resultData),
                started_at:     startedAt.toISOString(),
                completed_at:   completedAt.toISOString(),
                error_message:  null,
                report_month:   jstReportMonth(completedAt),
                report_date:    jstReportDate(completedAt),
                synced_at:      nowIso(),
            })
        }

        return NextResponse.json({
            success: true,
            report,
            cvrResults,
            abTestEvaluation,
            reportId: reportRecord?.id,
            executionId: executionRecord?.id,
        });
    } catch (error) {
        console.error('Analytics Report API Error:', error)
        return NextResponse.json(
            createErrorResponse(error, 'Failed to generate report'),
            { status: 500 }
        )
    }
}
