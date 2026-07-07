/**
 * エントリーフォームファネル分析API
 * 元のGASコードのcreateEntryFormFunnelReport関数を参考に実装
 */

import { NextResponse } from 'next/server'
import { fetchEntryFormFunnelData } from '@/lib/services/funnel/funnelService'
import { parseDateString } from '@/lib/utils/date'
import { prisma } from '@/lib/db/client'
import { getGA4AccessToken } from '@/lib/api/ga4/client'
import { evaluateFunnelWithGemini } from '@/lib/api/gemini/funnelEvaluation'
import { insertFunnelExecutionLog, jstReportDate, jstReportMonth, nowIso } from '@/lib/bq/write'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const {
            productId,
            propertyId,
            funnelConfig,
            startDate,
            endDate,
            filterConfig,
            accessToken: customToken,
            geminiConfig,
        } = body


        if (!propertyId || !funnelConfig) {
            return NextResponse.json(
                { error: 'propertyId and funnelConfig are required' },
                { status: 400 }
            )
        }

        const accessToken = await getGA4AccessToken(customToken)

        const parsedStartDate = parseDateString(startDate || '28daysAgo')
        const parsedEndDate = parseDateString(endDate || 'yesterday')

        const funnelData = await fetchEntryFormFunnelData(
            propertyId,
            funnelConfig,
            filterConfig,
            startDate || '28daysAgo',
            endDate || 'yesterday',
            accessToken,
            { channelBreakdown: true }
        )

        let geminiEvaluation = null
        if (geminiConfig?.enabled && funnelData) {
            const { getGeminiApiKey } = await import('@/lib/utils/gemini')
            const apiKey = getGeminiApiKey(geminiConfig.apiKey)
            
            if (apiKey) {
                try {
                    geminiEvaluation = await evaluateFunnelWithGemini(
                        {
                            funnelData,
                            startDate: parsedStartDate,
                            endDate: parsedEndDate,
                        },
                        apiKey
                    )
                    if (geminiEvaluation) {
                        funnelData.geminiEvaluation = geminiEvaluation
                    }
                } catch (error) {
                    console.error('Geminiファネル評価エラー:', error)
                    geminiEvaluation = null
                }
            }
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
                    name: body.name || `ファネル分析 ${new Date().toLocaleString('ja-JP')}`,
                    funnelConfig: funnelConfigWithGemini,
                    filterConfig: filterConfig || null,
                    startDate: new Date(parsedStartDate),
                    endDate: new Date(parsedEndDate),
                    resultData: JSON.parse(JSON.stringify(funnelData)),
                    geminiEvaluation: geminiEvaluation || null, // Gemini評価を直接保存
                    status: 'completed',
                },
            })
            executionId = execution.id
            const now = new Date()
            void insertFunnelExecutionLog({
                execution_id:      execution.id,
                product_id:        execution.productId,
                execution_name:    execution.name,
                funnel_config:     JSON.stringify(funnelConfigWithGemini),
                filter_config:     filterConfig ? JSON.stringify(filterConfig) : null,
                start_date:        parsedStartDate,
                end_date:          parsedEndDate,
                result_data:       JSON.stringify(funnelData),
                gemini_evaluation: geminiEvaluation || null,
                status:            'completed',
                error_message:     null,
                report_month:      jstReportMonth(now),
                report_date:       jstReportDate(now),
                synced_at:         nowIso(),
            })
        }

        return NextResponse.json({
            success: true,
            funnelData,
            executionId,
        })
    } catch (error) {
        console.error('Funnel Analysis API Error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        const errorStack = error instanceof Error ? error.stack : undefined
        console.error('Error stack:', errorStack)
        return NextResponse.json(
            {
                error: 'Failed to analyze funnel',
                message: errorMessage,
                stack: process.env.NODE_ENV === 'development' ? errorStack : undefined,
            },
            { status: 500 }
        )
    }
}
