/**
 * AB テスト自動実行のオーケストレータ。
 * 対象選定 → （同日スキップ）→ 集計・判定 → 保存 → Slack 通知 → 期間終了なら AI 最終レポート＋結果共有。
 * 1 件の失敗は履歴に残して次へ進む。元は app/api/ab-test/execute/route.ts の 650 行。
 * ※ サーバー専用。middleware の internalPostPaths と workers/* が叩く URL は route 側で不変
 */

import type { GA4Config } from '@/lib/services/ab-test/ga4ConfigTypes'
import { generateAndStoreFinalReport } from '@/lib/services/ab-test/finalReportService'
import { shareAbResult } from '@/lib/services/ab-test/abResultShareService'
import { getErrorMessage } from '@/lib/utils/error'
import { evaluateAbTest } from './evaluate'
import { persistExecution, persistFailure } from './persist'
import { selectExecutionTargets, shouldSkipSameDay } from './selectTargets'
import { notifyAbTestReportCompletion } from './slackNotifier'
import type { ExecutableAbTest, ExecutionRequest, ExecutionResultItem, ExecutionSummary } from './types'

async function executeOne(abTest: ExecutableAbTest): Promise<ExecutionResultItem> {
    const ga4Config = abTest.ga4Config as unknown as GA4Config
    if (!ga4Config || !ga4Config.propertyId) throw new Error('GA4設定が不完全です')

    const outcome = await evaluateAbTest(abTest, ga4Config)
    const { abTestReportExecution } = await persistExecution(abTest, ga4Config, outcome)

    try {
        await notifyAbTestReportCompletion(abTest, abTestReportExecution, {
            cvrResults: outcome.cvrResults,
            abTestEvaluation: outcome.abTestEvaluation,
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
            await shareAbResult(abTest.id, outcome.variants)
        } catch (error) {
            console.error('AB結果共有Slack通知エラー:', error)
        }
    }

    return { abTestId: abTest.id, abTestName: abTest.name, status: 'completed', reportExecutionId: abTestReportExecution.id }
}

export async function executeAbTests(req: ExecutionRequest): Promise<ExecutionSummary> {
    const abTests = await selectExecutionTargets(req)
    if (abTests.length === 0) {
        return { executed: 0, results: [], message: '実行すべきABテストがありません' }
    }

    const results: ExecutionResultItem[] = []
    for (const abTest of abTests) {
        if (shouldSkipSameDay(abTest, req.force)) continue
        try {
            results.push(await executeOne(abTest))
        } catch (error) {
            console.error(`ABテスト実行エラー (ID: ${abTest.id}):`, error)
            const errorMessage = getErrorMessage(error)
            const failedExecution = await persistFailure(abTest, errorMessage)
            try {
                await notifyAbTestReportCompletion(abTest, failedExecution, null)
            } catch (notifyError) {
                console.error('Slack通知エラー:', notifyError)
            }
            results.push({ abTestId: abTest.id, abTestName: abTest.name, status: 'failed', errorMessage })
        }
    }
    return { executed: results.length, results }
}
