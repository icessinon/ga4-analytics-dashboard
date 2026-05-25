import { callGemini } from './callGemini'

export interface StickinessMetrics {
    avgDAU: number
    totalMAU: number
    stickinessDAUMAU: number
    stickinessWAUMAU: number
    avgSessionsPerUser: number
    startDate: string
    endDate: string
}

export interface StickinessAnalysisRequest {
    current: StickinessMetrics
    compare?: StickinessMetrics | null
}

export async function analyzeStickinessWithGemini(req: StickinessAnalysisRequest): Promise<string | null> {
    const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`
    const { current, compare } = req

    let dataBlock = `【期間】${current.startDate} 〜 ${current.endDate}
- 平均DAU: ${current.avgDAU.toLocaleString()}
- MAU（期間ユニーク）: ${current.totalMAU.toLocaleString()}
- DAU/MAU スティッキネス: ${fmtPct(current.stickinessDAUMAU)}
- WAU/MAU スティッキネス: ${fmtPct(current.stickinessWAUMAU)}
- 平均セッション/ユーザー: ${current.avgSessionsPerUser}`

    if (compare) {
        const dauDelta = compare.avgDAU > 0 ? (((current.avgDAU - compare.avgDAU) / compare.avgDAU) * 100).toFixed(1) : 'N/A'
        const mauDelta = compare.totalMAU > 0 ? (((current.totalMAU - compare.totalMAU) / compare.totalMAU) * 100).toFixed(1) : 'N/A'
        const stickDelta = compare.stickinessDAUMAU > 0
            ? `${((current.stickinessDAUMAU - compare.stickinessDAUMAU) * 100).toFixed(2)}pp`
            : 'N/A'
        dataBlock += `

【比較期間】${compare.startDate} 〜 ${compare.endDate}
- 平均DAU: ${compare.avgDAU.toLocaleString()} （変化: ${dauDelta}%）
- MAU: ${compare.totalMAU.toLocaleString()} （変化: ${mauDelta}%）
- DAU/MAU スティッキネス: ${fmtPct(compare.stickinessDAUMAU)} （変化: ${stickDelta}）
- 平均セッション/ユーザー: ${compare.avgSessionsPerUser}`
    }

    const comparisonInstruction = compare
        ? `期間Aと期間Bを比較し、改善・悪化した指標とその考えられる要因を中心に分析してください。`
        : `現在の数値がどのレベルにあるか評価し、求人転職サービスとして改善余地を示してください。`

    const prompt = `あなたはプロダクト分析・グロース戦略の専門家です。以下は求人転職サービス(x-work.jp)のスティッキネス（ユーザーエンゲージメントの深さ）データです。

${dataBlock}

【スティッキネス参考値】
- 20%以上: 高エンゲージメント（SNS・毎日使うアプリ水準）
- 10〜20%: 中程度（一定の定期利用）
- 10%未満: 低エンゲージメント（散発的訪問）

${comparisonInstruction}

以下の観点で分析してください:
1. **現状評価** — DAU/MAU比の水準とその意味（転職サービスとして妥当か）
2. **注目すべき変化または課題** — ${compare ? '期間比較で特筆すべき指標の変動' : '改善が必要な指標'}
3. **ユーザー行動の解釈** — セッション数・WAU/MAU等から見えるユーザー利用パターン
4. **推奨アクション（上位3点）** — エンゲージメント向上のための具体的施策

500文字程度で、箇条書きと短い段落で読みやすくまとめてください。`

    return callGemini(prompt, 'analyzeStickinessWithGemini')
}
