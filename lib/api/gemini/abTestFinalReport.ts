import { callGemini } from './callGemini'

export interface FinalReportVariant {
    name: string
    label: string
    pv: number
    cv: number
    cvr: number
}

export interface AbTestFinalReportRequest {
    testName: string
    hypothesis: string | null
    expectedImprovementPct: number | null
    startDate: string
    endDate: string | null
    variants: FinalReportVariant[]
    winnerVariant: string | null
    improvementVsAPercent: number | null
    statisticalSignificance: number | null
    recommendation: string | null
    victoryFactors: string | null
    defeatFactors: string | null
}

export async function generateAbTestFinalReport(req: AbTestFinalReportRequest, productId?: number): Promise<string | null> {
    const variantLines = req.variants.map((v) =>
        `- バリアント${v.name}（${v.label}）: PV ${v.pv.toLocaleString()} ／ CV ${v.cv.toLocaleString()} ／ CVR ${(v.cvr * 100).toFixed(2)}%`
    ).join('\n')

    const resultLines = [
        req.winnerVariant ? `勝者: バリアント${req.winnerVariant}` : '勝者: 判定不能',
        req.improvementVsAPercent != null ? `A比改善率: ${req.improvementVsAPercent >= 0 ? '+' : ''}${req.improvementVsAPercent.toFixed(1)}%` : null,
        req.statisticalSignificance != null ? `統計的有意差: ${req.statisticalSignificance.toFixed(1)}%` : null,
        req.recommendation ? `システム判定: ${req.recommendation}` : null,
    ].filter(Boolean).join('\n')

    const memoLines = [
        req.victoryFactors ? `【担当者メモ：勝因】\n${req.victoryFactors}` : null,
        req.defeatFactors ? `【担当者メモ：敗因・課題】\n${req.defeatFactors}` : null,
    ].filter(Boolean).join('\n\n')

    const prompt = `あなたはWebマーケティング・CRO（コンバージョン率最適化）の専門家です。以下は求人転職サービス(x-work.jp)で実施したABテストの終了時データです。最終レポートを作成してください。

【テスト概要】
テスト名: ${req.testName}
期間: ${req.startDate} 〜 ${req.endDate ?? '未設定'}
事前仮説: ${req.hypothesis ?? '（未記入）'}
期待改善率: ${req.expectedImprovementPct != null ? `${req.expectedImprovementPct}%` : '（未設定）'}

【バリアント別結果】
${variantLines}

【判定】
${resultLines}
${memoLines ? `\n${memoLines}\n` : ''}
以下の構成で最終レポートを作成してください:
1. **結果サマリー** — 数値ベースで結果を簡潔にまとめる
2. **仮説検証** — 事前仮説と期待改善率に対して結果はどうだったか（仮説が未記入の場合はテスト名から推測される意図に対して評価）
3. **勝因・敗因分析** — なぜこの結果になったのか。統計的有意差・サンプルサイズも踏まえた確度の評価を含める。担当者メモがあれば内容を統合する
4. **学び（今後に活かせる知見）** — 求人転職サービスの改善に汎用的に使える教訓を抽出する
5. **次のアクション** — このテスト結果を受けて次に試すべき施策を具体的に2〜3個提案する

700文字程度で、箇条書きと短い段落を使って読みやすくまとめてください。`

    return callGemini(prompt, 'generateAbTestFinalReport', productId)
}
