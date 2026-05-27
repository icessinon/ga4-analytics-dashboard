import { NextResponse } from 'next/server'
import { fetchEntryFormFunnelData } from '@/lib/services/funnel/funnelService'
import { parseDateString } from '@/lib/utils/date'
import { prisma } from '@/lib/db/client'
import { getGA4AccessToken } from '@/lib/api/ga4/client'
import { evaluateComparisonWithGemini } from '@/lib/api/gemini/funnelEvaluation'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const {
            productId,
            propertyId,
            funnelConfig,
            periods,
            filterConfig,
            accessToken: customToken,
            geminiConfig,
        } = body

        if (!propertyId || !funnelConfig || !periods || periods.length < 2) {
            return NextResponse.json(
                { error: 'propertyId, funnelConfig, and at least 2 periods are required' },
                { status: 400 }
            )
        }

        const accessToken = await getGA4AccessToken(customToken)

        const comparisonResults = await Promise.all(
            periods.map(async (period: { startDate: string; endDate: string; label?: string }) => {
                const parsedStartDate = parseDateString(period.startDate)
                const parsedEndDate = parseDateString(period.endDate)
                const funnelData = await fetchEntryFormFunnelData(
                    propertyId,
                    funnelConfig,
                    filterConfig,
                    period.startDate,
                    period.endDate,
                    accessToken
                )
                const label = period.label || `${parsedStartDate} - ${parsedEndDate}`
                return { label, startDate: parsedStartDate, endDate: parsedEndDate, data: funnelData }
            })
        )

        const parsedPeriods = comparisonResults.map((r) => ({
            label: r.label,
            startDate: r.startDate,
            endDate: r.endDate,
        }))

        if (comparisonResults.length < 2) {
            return NextResponse.json(
                { error: 'At least 2 periods with valid data are required' },
                { status: 400 }
            )
        }

        const validResults = comparisonResults.filter(
            (result) => result.data && result.data.steps && result.data.steps.length > 0
        )

        if (validResults.length < 2) {
            return NextResponse.json(
                { error: 'At least 2 periods with valid data are required' },
                { status: 400 }
            )
        }

        const basePeriod = validResults[0]
        const comparison = {
            steps: basePeriod.data.steps.map((baseStep: any, index: number) => {
                const stepData: any = {
                    stepName: baseStep.stepName,
                    periods: {},
                }

                validResults.forEach((period, periodIdx) => {
                    const periodStep = period.data.steps[index]
                    if (periodStep) {
                        stepData.periods[period.label] = periodStep
                    }
                })

                if (validResults.length >= 1) {
                    stepData.periodA = basePeriod.data.steps[index]
                }
                if (validResults.length >= 2) {
                    stepData.periodB = validResults[1].data.steps[index] || null
                }

                if (validResults.length >= 2) {
                    const stepB = validResults[1].data.steps[index]
                    if (stepB) {
                        const usersDiff = stepB.users - baseStep.users
                        const usersPercent = baseStep.users > 0 ? (usersDiff / baseStep.users) * 100 : 0
                        const conversionRateDiff = stepB.conversionRate - baseStep.conversionRate
                        const dropoffRateDiff = stepB.dropoffRate - baseStep.dropoffRate

                        stepData.difference = {
                            users: usersDiff,
                            usersPercent,
                            conversionRate: conversionRateDiff,
                            dropoffRate: dropoffRateDiff,
                        }
                    } else {
                        stepData.difference = null
                    }
                } else {
                    stepData.difference = null
                }

                return stepData
            }),
        }

        const periodsArray = validResults.map((result) => ({
            label: result.label,
            startDate: result.startDate,
            endDate: result.endDate,
            data: result.data,
        }))

        let comparisonGeminiEvaluation = null
        if (geminiConfig?.enabled && validResults.length > 0) {
            const { getGeminiApiKey } = await import('@/lib/utils/gemini')
            const apiKey = getGeminiApiKey(geminiConfig.apiKey)
            
            if (apiKey) {
                try {
                    comparisonGeminiEvaluation = await evaluateComparisonWithGemini(
                        {
                            periods: validResults.map((result) => ({
                                label: result.label,
                                startDate: result.startDate,
                                endDate: result.endDate,
                                data: result.data,
                            })),
                        },
                        apiKey
                    )
                } catch (error) {
                    console.error('期間比較: Gemini評価エラー:', error)
                }
            }
        }

        const comparisonData: any = {
            periods: periodsArray,
            comparison,
            periodA: periodsArray[0],
            periodB: periodsArray.length >= 2 ? periodsArray[1] : undefined,
            geminiEvaluation: comparisonGeminiEvaluation,
        }

        let executionId: number | null = null
        if (productId) {
            const funnelConfigWithGemini = {
                ...funnelConfig,
                geminiConfig: geminiConfig || null,
            }

            const execution = await prisma.funnelExecution.create({
                data: {
                    productId: parseInt(productId, 10),
                    name: body.name || `ファネル比較 ${new Date().toLocaleString('ja-JP')}`,
                    funnelConfig: funnelConfigWithGemini,
                    filterConfig: filterConfig || null,
                    startDate: new Date(parsedPeriods[0].startDate),
                    endDate: new Date(parsedPeriods[parsedPeriods.length - 1].endDate),
                    resultData: comparisonData as any,
                    geminiEvaluation: comparisonGeminiEvaluation, // 期間比較用のGemini評価を保存
                    status: 'completed',
                },
            })
            executionId = execution.id
        }

        return NextResponse.json({
            success: true,
            comparison: comparisonData,
            executionId,
        })
    } catch (error) {
        console.error('Funnel Comparison API Error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json(
            {
                error: 'Failed to compare funnel periods',
                message: errorMessage,
            },
            { status: 500 }
        )
    }
}
