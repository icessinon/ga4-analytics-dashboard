/**
 * AB テスト実行結果の Slack 通知（SLACK_WEBHOOK_URL 宛）。
 * app/api/ab-test/execute/route.ts から純粋に移動したもの。文面・ブロック構成は変えていない。
 * ※ 完了時の「AB 結果共有チャンネル」への投稿は abResultShareService（別 webhook）
 */

import type { CvrResult } from '@/lib/services/analytics/cvrService'
import type { AbTestEvaluation } from '@/lib/services/ab-test/abTestService'
import { sendSlackNotification, type SlackBlock } from '@/lib/services/notification/slackService'

export interface AbTestWithProduct {
    id: number
    name: string
    startDate: Date
    endDate: Date | null
    product: { id: number; name: string; ga4PropertyId: string | null }
}

export interface ReportExecutionResult {
    id?: number
    status: string
    errorMessage?: string | null
}

export interface NotifyResultData {
    cvrResults: { dataA?: CvrResult; dataB?: CvrResult; dataC?: CvrResult; dataD?: CvrResult }
    abTestEvaluation: AbTestEvaluation | null
}

/**
 * Slack通知を送信
 */
export async function notifyAbTestReportCompletion(
    abTest: AbTestWithProduct,
    reportExecution: ReportExecutionResult,
    resultData: NotifyResultData | null
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
        
        const cvrFields: Array<{ type: string; text: string }> = []
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
            const checkFields: Array<{ type: string; text: string }> = []
            
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
