import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/client'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { calculateCVR } from '@/lib/services/analytics/cvrService'
import { evaluateAbTestResult, type AbTestEvaluation, type AbTestVariant } from '@/lib/services/ab-test/abTestService'
import { evaluateWithGemini } from '@/lib/api/gemini/client'
import { parseDateString } from '@/lib/utils/date'
import { getGeminiApiKey } from '@/lib/utils/gemini'
import { sendSlackNotification, type SlackBlock } from '@/lib/services/notification/slackService'
import { createErrorResponse, getErrorMessage } from '@/lib/utils/error'

/**
 * ABテスト自動実行API
 * 期間終了後のABテストに対してGA4分析を実行
 */
export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { abTestId, force } = body

        const now = new Date()
        const where: any = {
            status: 'running',
            autoExecute: true,
            ga4Config: { not: null },
        }

        if (abTestId) {
            where.id = parseInt(abTestId, 10)
        } else {
            where.endDate = { lte: now }
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

                const ga4Config = abTest.ga4Config as any
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

                const ga4Request: any = {
                    propertyId: ga4Config.propertyId,
                    dateRanges: [{ startDate, endDate }],
                    dimensions: dimensions,
                    metrics: metrics,
                    limit: ga4Config.limit || 10000,
                }

                if (ga4Config.filter?.dimension && ga4Config.filter?.operator && ga4Config.filter?.expression) {
                    const expressions = ga4Config.filter.expression
                        .split(',')
                        .map((s: string) => s.trim())
                        .filter(Boolean)

                    if (expressions.length === 0) {
                    } else if (expressions.length > 1) {
                        ga4Request.dimensionFilter = {
                            orGroup: {
                                expressions: expressions.map((exp: string) => ({
                                    filter: {
                                        fieldName: ga4Config.filter.dimension,
                                        stringFilter: {
                                            matchType: ga4Config.filter.operator.toUpperCase(),
                                            value: exp,
                                        },
                                    },
                                })),
                            },
                        }
                    } else {
                        ga4Request.dimensionFilter = {
                            filter: {
                                fieldName: ga4Config.filter.dimension,
                                stringFilter: {
                                    matchType: ga4Config.filter.operator.toUpperCase(),
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

                const normalizeCvrConfig = (cvrConfig: any) => {
                    if (!cvrConfig) return null
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
                    }
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
                const evaluationConfig = abTest.evaluationConfig || ga4Config.abTestEvaluationConfig || {}
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
                            config: ga4Config,
                            isActive: true,
                        },
                    })
                } else {
                    abTestReport = await prisma.report.update({
                        where: { id: abTestReport.id },
                        data: {
                            config: ga4Config,
                        },
                    })
                }

                const resultDataJson = JSON.parse(JSON.stringify({ report, cvrResults, abTestEvaluation }))
                const reportExecution = await prisma.reportExecution.create({
                    data: {
                        reportId: abTestReport.id,
                        status: 'completed',
                        startedAt: new Date(),
                        completedAt: new Date(),
                        resultData: resultDataJson,
                    },
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

                try {
                    await notifyAbTestReportCompletion(abTest, abTestReportExecution, {
                        cvrResults,
                        abTestEvaluation,
                    })
                } catch (error) {
                    console.error('Slack通知エラー:', error)
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

/**
 * Slack通知を送信
 */
async function notifyAbTestReportCompletion(
    abTest: any,
    reportExecution: any,
    resultData: any
) {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL
    if (!webhookUrl) {
        return
    }

    const cvrResults = resultData?.cvrResults || {}
    const abTestEvaluation = resultData?.abTestEvaluation || null

    const formatDate = (date: Date | null) => {
        if (!date) return '-'
        return new Date(date).toLocaleDateString('ja-JP')
    }

    const statusEmoji = reportExecution.status === 'completed' ? '✅' : '❌'
    const statusText = reportExecution.status === 'completed' ? '完了' : '失敗'
    
    const blocks: SlackBlock[] = [
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: `${statusEmoji} ABテストレポート生成${statusText}`,
            },
        },
        {
            type: 'section',
            fields: [
                {
                    type: 'mrkdwn',
                    text: `*テスト名:*\n*${abTest.name}*`,
                },
                {
                    type: 'mrkdwn',
                    text: `*プロダクト:*\n${abTest.product.name}`,
                },
                {
                    type: 'mrkdwn',
                    text: `*期間:*\n${formatDate(abTest.startDate)} - ${formatDate(abTest.endDate)}`,
                },
                {
                    type: 'mrkdwn',
                    text: `*ステータス:*\n${statusEmoji} ${statusText}`,
                },
            ],
        },
    ]

    if (cvrResults.dataA || cvrResults.dataB || cvrResults.dataC || cvrResults.dataD) {
        blocks.push({
            type: 'divider',
        })
        blocks.push({
            type: 'header',
            text: {
                type: 'plain_text',
                text: '📈 CVR結果',
            },
        })
        
        const cvrFields: any[] = []
        if (cvrResults.dataA) {
            cvrFields.push({
                type: 'mrkdwn',
                text: `*A*\nPV: ${(cvrResults.dataA.pv || 0).toLocaleString()}\nCV: ${(cvrResults.dataA.cv || 0).toLocaleString()}\nCVR: *${((cvrResults.dataA.cvr || 0) * 100).toFixed(2)}%*`,
            })
        }
        if (cvrResults.dataB) {
            cvrFields.push({
                type: 'mrkdwn',
                text: `*B*\nPV: ${(cvrResults.dataB.pv || 0).toLocaleString()}\nCV: ${(cvrResults.dataB.cv || 0).toLocaleString()}\nCVR: *${((cvrResults.dataB.cvr || 0) * 100).toFixed(2)}%*`,
            })
        }
        if (cvrResults.dataC) {
            cvrFields.push({
                type: 'mrkdwn',
                text: `*C*\nPV: ${(cvrResults.dataC.pv || 0).toLocaleString()}\nCV: ${(cvrResults.dataC.cv || 0).toLocaleString()}\nCVR: *${((cvrResults.dataC.cvr || 0) * 100).toFixed(2)}%*`,
            })
        }
        if (cvrResults.dataD) {
            cvrFields.push({
                type: 'mrkdwn',
                text: `*D*\nPV: ${(cvrResults.dataD.pv || 0).toLocaleString()}\nCV: ${(cvrResults.dataD.cv || 0).toLocaleString()}\nCVR: *${((cvrResults.dataD.cvr || 0) * 100).toFixed(2)}%*`,
            })
        }
        if (cvrFields.length > 0) {
            blocks.push({
                type: 'section',
                fields: cvrFields,
            })
        }
    }

    if (abTestEvaluation) {
        blocks.push({
            type: 'divider',
        })
        blocks.push({
            type: 'header',
            text: {
                type: 'plain_text',
                text: '🎯 評価結果',
            },
        })
        
        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*${abTestEvaluation.recommendation}*`,
            },
        })
        
        if (abTestEvaluation.checks) {
            const checks = abTestEvaluation.checks
            const checkFields: any[] = []
            
            if (checks.significance) {
                checkFields.push({
                    type: 'mrkdwn',
                    text: `*統計的有意差*\n${checks.significance.passed ? '✅' : '❌'} ${checks.significance.value?.toFixed(2)}%\n必要: ${checks.significance.required?.toFixed(2)}%`,
                })
            }
            if (checks.sampleSize) {
                const pvs = []
                if (checks.sampleSize.aPV !== undefined) pvs.push(`A: ${checks.sampleSize.aPV.toLocaleString()}`)
                if (checks.sampleSize.bPV !== undefined) pvs.push(`B: ${checks.sampleSize.bPV.toLocaleString()}`)
                if (checks.sampleSize.cPV !== undefined) pvs.push(`C: ${checks.sampleSize.cPV.toLocaleString()}`)
                if (checks.sampleSize.dPV !== undefined) pvs.push(`D: ${checks.sampleSize.dPV.toLocaleString()}`)
                checkFields.push({
                    type: 'mrkdwn',
                    text: `*サンプルサイズ*\n${checks.sampleSize.passed ? '✅' : '❌'}\n${pvs.join('\n')}\n必要: ${checks.sampleSize.minRequiredPV?.toLocaleString()}`,
                })
            }
            if (checks.period) {
                checkFields.push({
                    type: 'mrkdwn',
                    text: `*テスト期間*\n${checks.period.passed ? '✅' : '❌'} ${checks.period.days}日\n必要: ${checks.period.minRequired}日`,
                })
            }
            if (checks.improvement) {
                checkFields.push({
                    type: 'mrkdwn',
                    text: `*改善率*\n${checks.improvement.passed ? '✅' : '❌'} ${checks.improvement.improvementRate?.toFixed(2)}%\n必要: ${checks.improvement.minImprovementRate}%`,
                })
            }
            
            if (checkFields.length > 0) {
                blocks.push({
                    type: 'section',
                    fields: checkFields,
                })
            }
        }
    }

    if (reportExecution.status === 'failed' && reportExecution.errorMessage) {
        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*❌ エラー:*\n${reportExecution.errorMessage}`,
            },
        })
    }

    blocks.push({
        type: 'divider',
    })
    const publicAppUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3003'
    blocks.push({
        type: 'section',
        text: {
            type: 'mrkdwn',
            text: `<${publicAppUrl}/ab-test/${abTest.id}|📊 詳細を見る>`,
        },
    })

    await sendSlackNotification([webhookUrl], blocks)
}
