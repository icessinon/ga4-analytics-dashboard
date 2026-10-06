/**
 * AB テスト 1 件の集計と勝敗判定（DB には書かない）。
 * GA4 取得 → バリアント別 CVR → 上位 2 つで有意差判定 → 任意で Gemini 講評 → 勝者・A 比改善率。
 * ※ サーバー専用
 */

import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { evaluateWithGemini } from '@/lib/api/gemini/client'
import { evaluateAbTestResult, type AbTestEvaluation, type AbTestEvaluationConfig, type AbTestVariant } from '@/lib/services/ab-test/abTestService'
import { VARIANT_KEYS, type GA4Config } from '@/lib/services/ab-test/ga4ConfigTypes'
import { parseDateString } from '@/lib/utils/date'
import { getGeminiApiKey } from '@/lib/utils/gemini'
import { buildAbTestGa4Request, computeVariantCvrs } from './ga4Report'
import type { AbTestEvaluationOutcome, ExecutableAbTest } from './types'

/** テスト期間。endDate 未設定なら昨日まで */
export function executionDateRange(abTest: ExecutableAbTest): { startDate: string; endDate: string } {
    return {
        startDate: parseDateString(abTest.startDate.toISOString().split('T')[0]),
        endDate: abTest.endDate ? parseDateString(abTest.endDate.toISOString().split('T')[0]) : parseDateString('yesterday'),
    }
}

export async function evaluateAbTest(abTest: ExecutableAbTest, ga4Config: GA4Config): Promise<AbTestEvaluationOutcome> {
    const accessToken = await getGA4AccessToken()
    const { startDate, endDate } = executionDateRange(abTest)

    const report = await fetchGA4Data(buildAbTestGa4Request(ga4Config, { startDate, endDate }), accessToken)
    const cvrResults = computeVariantCvrs(report, ga4Config)

    const variants: AbTestVariant[] = VARIANT_KEYS.flatMap((k) => {
        const data = cvrResults[`data${k}`]
        return data ? [{ name: k, data }] : []
    }).sort((a, b) => b.data.cvr - a.data.cvr)

    let abTestEvaluation: AbTestEvaluation | null = null
    const evaluationConfig = (abTest.evaluationConfig || ga4Config.abTestEvaluationConfig || {}) as AbTestEvaluationConfig
    if (evaluationConfig && Object.keys(cvrResults).length >= 2 && variants.length >= 2) {
        const [winner, runnerUp] = variants
        abTestEvaluation = evaluateAbTestResult(winner, runnerUp, startDate, endDate, evaluationConfig, variants)

        const geminiConfig = ga4Config.geminiConfig || {}
        const apiKey = geminiConfig.enabled ? getGeminiApiKey(geminiConfig.apiKey) : null
        if (apiKey && abTestEvaluation) {
            try {
                const aiEvaluation = await evaluateWithGemini(
                    {
                        evaluation: abTestEvaluation,
                        winner,
                        runnerUp,
                        config: evaluationConfig,
                        hypothesis: abTest.hypothesis,
                        expectedImprovement: abTest.expectedImprovement != null ? Number(abTest.expectedImprovement) : null,
                    },
                    apiKey,
                )
                if (aiEvaluation) abTestEvaluation.aiEvaluation = aiEvaluation
            } catch (error) {
                // AI 講評が落ちても判定・保存は続行
                console.error('Gemini評価エラー:', error)
            }
        }
    }

    let winnerVariant: string | null = null
    let improvementVsAPercent: number | null = null
    if (variants.length >= 2) {
        const winner = variants[0]
        winnerVariant = winner.name
        const variantA = variants.find((v) => v.name === 'A')
        if (variantA && winner.name !== 'A' && variantA.data.cvr > 0) {
            improvementVsAPercent = ((winner.data.cvr - variantA.data.cvr) / variantA.data.cvr) * 100
        }
    }

    return { startDate, endDate, report, cvrResults, variants, abTestEvaluation, winnerVariant, improvementVsAPercent }
}
