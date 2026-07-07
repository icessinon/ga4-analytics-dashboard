/**
 * ファネル分析用Gemini評価
 */
import { logGeminiUsage } from './logger'

export interface FunnelEvaluationRequest {
    funnelData: {
        steps: Array<{
            stepName: string
            users: number
            conversionRate: number
            dropoffRate: number
        }>
        totalUsers: number
        channelBreakdown?: Array<{
            channel: string
            totalUsers: number
            steps: Array<{
                stepName: string
                users: number
                conversionRate: number
                dropoffRate: number
            }>
        }>
    }
    startDate: string
    endDate: string
}

/**
 * ファネル分析結果をGeminiで評価
 */
export async function evaluateFunnelWithGemini(
    request: FunnelEvaluationRequest,
    apiKey: string
): Promise<string | null> {
    const key = apiKey?.trim() || process.env.GEMINI_API_KEY
    if (!key) return null

    try {
        const prompt = buildFunnelEvaluationPrompt(request.funnelData, request.startDate, request.endDate)

        const modelName = 'gemini-2.5-flash'
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`
        
        const payload = {
            contents: [
                {
                    parts: [
                        {
                            text: prompt,
                        },
                    ],
                },
            ],
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        })

        if (!response.ok) {
            const errorText = await response.text()
            let error
            try {
                error = JSON.parse(errorText)
            } catch {
                error = { message: errorText }
            }
            console.error(`Gemini API Error: ${response.status} - ${JSON.stringify(error)}`)
            throw new Error(`Gemini API Error: ${response.status} - ${error.error?.message || error.message || 'Unknown error'}`)
        }

        const responseData = await response.json()

        const usage = responseData.usageMetadata
        if (usage) {
            logGeminiUsage({
                function: 'evaluateFunnelWithGemini',
                model: modelName,
                promptTokens: usage.promptTokenCount ?? 0,
                completionTokens: usage.candidatesTokenCount ?? 0,
                totalTokens: usage.totalTokenCount ?? 0,
            })
        }

        if (responseData.candidates && responseData.candidates.length > 0) {
            const candidate = responseData.candidates[0]
            if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                const text = candidate.content.parts[0].text
                if (text) {
                    return text.trim()
                }
            }
        }

        return null
    } catch (error) {
        console.error(`Gemini API呼び出しエラー: ${error}`)
        return null
    }
}

/**
 * 期間比較用の評価リクエスト
 */
export interface ComparisonEvaluationRequest {
    periods: Array<{
        label: string
        startDate: string
        endDate: string
        data: {
            steps: Array<{
                stepName: string
                users: number
                conversionRate: number
                dropoffRate: number
            }>
            totalUsers: number
            channelBreakdown?: Array<{
                channel: string
                totalUsers: number
                steps: Array<{
                    stepName: string
                    users: number
                    conversionRate: number
                    dropoffRate: number
                }>
            }>
        }
    }>
}

/**
 * 期間比較分析結果をGeminiで評価
 */
export async function evaluateComparisonWithGemini(
    request: ComparisonEvaluationRequest,
    apiKey: string
): Promise<string | null> {
    const key = apiKey?.trim() || process.env.GEMINI_API_KEY
    if (!key) return null

    try {
        const prompt = buildComparisonEvaluationPrompt(request.periods)

        const modelName = 'gemini-2.5-flash'
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`
        
        const payload = {
            contents: [
                {
                    parts: [
                        {
                            text: prompt,
                        },
                    ],
                },
            ],
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        })

        if (!response.ok) {
            const errorText = await response.text()
            let error
            try {
                error = JSON.parse(errorText)
            } catch {
                error = { message: errorText }
            }
            console.error(`Gemini API Error: ${response.status} - ${JSON.stringify(error)}`)
            throw new Error(`Gemini API Error: ${response.status} - ${error.error?.message || error.message || 'Unknown error'}`)
        }

        const responseData = await response.json()

        const usage = responseData.usageMetadata
        if (usage) {
            logGeminiUsage({
                function: 'evaluateComparisonWithGemini',
                model: modelName,
                promptTokens: usage.promptTokenCount ?? 0,
                completionTokens: usage.candidatesTokenCount ?? 0,
                totalTokens: usage.totalTokenCount ?? 0,
            })
        }

        if (responseData.candidates && responseData.candidates.length > 0) {
            const candidate = responseData.candidates[0]
            if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                const text = candidate.content.parts[0].text
                if (text) {
                    return text.trim()
                }
            }
        }

        return null
    } catch (error) {
        console.error(`Gemini API呼び出しエラー: ${error}`)
        return null
    }
}

/**
 * 期間比較評価プロンプトを構築
 */
function buildComparisonEvaluationPrompt(
    periods: ComparisonEvaluationRequest['periods']
): string {
    const periodsDetail = periods.map((period, periodIndex) => {
        const steps = period.data.steps
        const totalUsers = period.data.totalUsers
        const finalStepUsers = steps[steps.length - 1]?.users || 0
        const overallCVR = steps[steps.length - 1]?.conversionRate || 0

        // 最大離脱ステップを特定
        let maxDropoffRate = 0
        let maxDropoffStep = ''
        steps.forEach((step, index) => {
            if (index > 0 && step.dropoffRate > maxDropoffRate) {
                maxDropoffRate = step.dropoffRate
                maxDropoffStep = step.stepName
            }
        })

        const stepsDetail = steps.map((step, index) => {
            const prevStepUsers = index > 0 ? steps[index - 1].users : totalUsers
            return `  ステップ${index + 1}: ${step.stepName}
        - ユーザー数: ${step.users.toLocaleString()}人
        - コンバージョン率: ${(step.conversionRate * 100).toFixed(2)}%
        - ドロップオフ率: ${(step.dropoffRate * 100).toFixed(2)}%`
        }).join('\n')

        return `【${period.label}】
期間: ${period.startDate} ～ ${period.endDate}
総エントリー数: ${totalUsers.toLocaleString()}人
最終ステップ到達数: ${finalStepUsers.toLocaleString()}人
全体コンバージョン率: ${(overallCVR * 100).toFixed(2)}%
最大離脱ステップ: ${maxDropoffStep || 'なし'} (${(maxDropoffRate * 100).toFixed(2)}%)

各ステップの詳細:
${stepsDetail}`
    }).join('\n\n')

    const comparisonInfo = periods.length >= 2 ? `
【期間間の比較】
- エントリー数変化: ${periods[0].label} ${periods[0].data.totalUsers.toLocaleString()}人 → ${periods[periods.length - 1].label} ${periods[periods.length - 1].data.totalUsers.toLocaleString()}人 (${periods[periods.length - 1].data.totalUsers - periods[0].data.totalUsers >= 0 ? '+' : ''}${(periods[periods.length - 1].data.totalUsers - periods[0].data.totalUsers).toLocaleString()}人)
- 全体CVR変化: ${((periods[periods.length - 1].data.steps[periods[periods.length - 1].data.steps.length - 1]?.conversionRate || 0) - (periods[0].data.steps[periods[0].data.steps.length - 1]?.conversionRate || 0)) * 100 >= 0 ? '+' : ''}${(((periods[periods.length - 1].data.steps[periods[periods.length - 1].data.steps.length - 1]?.conversionRate || 0) - (periods[0].data.steps[periods[0].data.steps.length - 1]?.conversionRate || 0)) * 100).toFixed(2)}pt` : ''

    const channelChangeSection = buildChannelChangeSection(periods)

    return `あなたはファネル分析の専門家です。以下の期間比較ファネル分析結果を評価し、実務的な見解を述べてください。

【期間比較分析結果】
${periodsDetail}
${comparisonInfo}
${channelChangeSection}

【評価依頼】
上記の期間比較ファネル分析結果について、以下の観点から評価してください：
1. 各期間のファネルパフォーマンスの比較（改善/悪化の傾向）
2. 期間間の変化要因の分析（エントリー数、CVR、離脱率の変化）
3. 改善が見られるステップと悪化しているステップの特定
${channelChangeSection ? '4. チャネル別の変化（どのチャネルでCVRやエントリー数が動いたか、施策効果が現れたチャネルの特定）\n5. 期間間の差分から見える課題と改善機会\n6. 具体的な改善提案（チャネル別対策を含む期間を跨いだ改善施策）\n7. 追加で確認すべき指標や分析' : '4. 期間間の差分から見える課題と改善機会\n5. 具体的な改善提案（期間を跨いだ改善施策）\n6. 追加で確認すべき指標や分析'}

回答は簡潔に（${channelChangeSection ? '600' : '500'}文字程度）、期間比較の観点を重視し、実務的な改善提案を含めてください。`
}

/**
 * 期間間のチャネル別変化セクションを構築
 */
function buildChannelChangeSection(periods: ComparisonEvaluationRequest['periods']): string {
    const withBreakdown = periods.filter((p) => (p.data.channelBreakdown?.length ?? 0) > 0)
    if (withBreakdown.length < 2) return ''

    const channelTotals = new Map<string, number>()
    for (const p of withBreakdown) {
        for (const ch of p.data.channelBreakdown ?? []) {
            channelTotals.set(ch.channel, (channelTotals.get(ch.channel) ?? 0) + ch.totalUsers)
        }
    }
    const channels = [...channelTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c]) => c)

    const lines = channels.map((channel) => {
        const perPeriod = withBreakdown.map((p) => {
            const ch = p.data.channelBreakdown?.find((c) => c.channel === channel)
            if (!ch) return `${p.label}: データなし`
            const cvr = ch.steps[ch.steps.length - 1]?.conversionRate ?? 0
            return `${p.label}: ${ch.totalUsers.toLocaleString()}人・CVR ${(cvr * 100).toFixed(2)}%`
        }).join(' → ')
        return `- ${channel}: ${perPeriod}`
    }).join('\n')

    return `\n【チャネル別の期間変化（エントリー数・CVR）】\n${lines}`
}

/**
 * ファネル評価プロンプトを構築
 */
function buildFunnelEvaluationPrompt(
    funnelData: FunnelEvaluationRequest['funnelData'],
    startDate: string,
    endDate: string
): string {
    const steps = funnelData.steps
    const totalUsers = funnelData.totalUsers
    const finalStepUsers = steps[steps.length - 1]?.users || 0
    const overallCVR = steps[steps.length - 1]?.conversionRate || 0

    let maxDropoffRate = 0
    let maxDropoffStep = ''
    steps.forEach((step, index) => {
        if (index > 0 && step.dropoffRate > maxDropoffRate) {
            maxDropoffRate = step.dropoffRate
            maxDropoffStep = step.stepName
        }
    })

    const stepsDetail = steps.map((step, index) => {
        const prevStepUsers = index > 0 ? steps[index - 1].users : totalUsers
        return `ステップ${index + 1}: ${step.stepName}
    - ユーザー数: ${step.users.toLocaleString()}人
    - コンバージョン率: ${(step.conversionRate * 100).toFixed(2)}%
    - ドロップオフ率: ${(step.dropoffRate * 100).toFixed(2)}%
    - 前ステップからの離脱: ${((prevStepUsers - step.users) / prevStepUsers * 100).toFixed(2)}%`
    }).join('\n\n')

    const breakdown = funnelData.channelBreakdown ?? []
    const channelSection = breakdown.length > 0
        ? `\n【流入チャネル別の内訳】\n` + breakdown.slice(0, 8).map((ch) => {
            const chFinal = ch.steps[ch.steps.length - 1]
            let chMaxDrop = 0
            let chMaxDropStep = 'なし'
            ch.steps.forEach((s, i) => {
                if (i > 0 && s.dropoffRate > chMaxDrop) { chMaxDrop = s.dropoffRate; chMaxDropStep = s.stepName }
            })
            return `- ${ch.channel}: エントリー${ch.totalUsers.toLocaleString()}人 → 最終到達${(chFinal?.users ?? 0).toLocaleString()}人（CVR ${((chFinal?.conversionRate ?? 0) * 100).toFixed(2)}%）／最大離脱: ${chMaxDropStep}（${(chMaxDrop * 100).toFixed(1)}%）`
        }).join('\n')
        : ''

    return `あなたはファネル分析の専門家です。以下のファネル分析結果を評価し、実務的な見解を述べてください。

【分析期間】
${startDate} ～ ${endDate}

【ファネル分析結果】
総エントリー数: ${totalUsers.toLocaleString()}人
最終ステップ到達数: ${finalStepUsers.toLocaleString()}人
全体コンバージョン率: ${(overallCVR * 100).toFixed(2)}%
最大離脱ステップ: ${maxDropoffStep || 'なし'} (${(maxDropoffRate * 100).toFixed(2)}%)

【各ステップの詳細】
${stepsDetail}
${channelSection}

【評価依頼】
上記のファネル分析結果について、以下の観点から評価してください：
1. ファネルの全体像（各ステップの通過率、離脱ポイント）
2. 改善すべきステップ（最大離脱ポイントの分析）
${breakdown.length > 0 ? '3. チャネル別の差異（CVRが高い/低いチャネル、チャネル固有の離脱ステップとその要因仮説）\n4. コンバージョン率の評価（業界平均との比較、改善余地）\n5. 具体的な改善提案（チャネル別の対策を含むUX改善、コンテンツ最適化など）\n6. 追加で確認すべき指標や分析' : '3. コンバージョン率の評価（業界平均との比較、改善余地）\n4. 具体的な改善提案（UX改善、コンテンツ最適化など）\n5. 追加で確認すべき指標や分析'}

回答は簡潔に（${breakdown.length > 0 ? '500' : '300'}文字程度）、実務的な観点を重視してください。`
}
