/**
 * ABテスト評価API
 */

import { NextResponse } from 'next/server'
import { evaluateAbTestResult } from '@/lib/services/ab-test/abTestService'
import { evaluateWithGemini } from '@/lib/api/gemini/client'
import { prisma } from '@/lib/db/client'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const {
            abTestId,
            variantA,
            variantB,
            variantC,
            variantD,
            endDate,
            evaluationConfig,
            geminiConfig,
        } = body

        if (!abTestId) {
            return NextResponse.json(
                { error: 'abTestId is required' },
                { status: 400 }
            )
        }

        const abTest = await prisma.abTest.findUnique({
            where: { id: abTestId },
        })

        if (!abTest) {
            return NextResponse.json(
                { error: 'AB test not found' },
                { status: 404 }
            )
        }

        const variants = []
        if (variantA) variants.push({ name: 'A', data: variantA })
        if (variantB) variants.push({ name: 'B', data: variantB })
        if (variantC) variants.push({ name: 'C', data: variantC })
        if (variantD) variants.push({ name: 'D', data: variantD })

        if (variants.length < 2) {
            return NextResponse.json(
                { error: 'At least 2 variants are required' },
                { status: 400 }
            )
        }

        variants.sort((a, b) => b.data.cvr - a.data.cvr)
        const winner = variants[0]
        const runnerUp = variants[1]

        const testStartDate = abTest.startDate.toISOString().split('T')[0]
        const testEndDate = abTest.endDate
            ? abTest.endDate.toISOString().split('T')[0]
            : endDate || new Date().toISOString().split('T')[0]

        const config = evaluationConfig || abTest.evaluationConfig || {}
        const evaluation = evaluateAbTestResult(
            winner,
            runnerUp,
            testStartDate,
            testEndDate,
            config,
            variants
        )

        let aiEvaluation = null
        if (geminiConfig?.enabled) {
            aiEvaluation = await evaluateWithGemini(
                {
                    evaluation,
                    winner,
                    runnerUp,
                    config,
                },
                geminiConfig.apiKey
            )
        }

        const abTestResult = await prisma.abTestResult.create({
            data: {
                abTestId,
                variant: winner.name.charAt(0),
                pageViews: winner.data.pv,
                conversions: winner.data.cv,
                conversionRate: winner.data.cvr,
                statisticalSignificance: evaluation.checks.significance.value,
                zScore: parseFloat(evaluation.checks.significance.zScore),
                periodDays: evaluation.checks.period.days,
                aiEvaluation,
                recommendation: evaluation.recommendation,
            },
        })

        return NextResponse.json({
            success: true,
            evaluation,
            winner,
            runnerUp,
            aiEvaluation,
            resultId: abTestResult.id,
        })
    } catch (error) {
        console.error('AB Test Evaluation API Error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json(
            {
                error: 'Failed to evaluate AB test',
                message: errorMessage,
            },
            { status: 500 }
        )
    }
}
