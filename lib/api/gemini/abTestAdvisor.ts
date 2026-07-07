import { callGemini } from './callGemini'
import type { PastAbTest } from '@/lib/services/ab-test/advisorService'

const MAX_TESTS = 15
const MAX_REPORT_CHARS = 600

function testBlock(t: PastAbTest, index: number): string {
    const lines = [
        `### 過去テスト${index + 1}: ${t.name}`,
        `期間: ${t.startDate ?? '不明'} 〜 ${t.endDate ?? '不明'}`,
    ]
    if (t.hypothesis) lines.push(`仮説: ${t.hypothesis}`)
    if (t.expectedImprovementPct != null) lines.push(`期待改善率: ${t.expectedImprovementPct}%`)
    const result = [
        t.winnerVariant ? `勝者=バリアント${t.winnerVariant}` : '勝者判定なし',
        t.improvementVsAPct != null ? `A比改善${t.improvementVsAPct >= 0 ? '+' : ''}${t.improvementVsAPct.toFixed(1)}%` : null,
        t.statisticalSignificance != null ? `有意差${t.statisticalSignificance.toFixed(1)}%` : null,
    ].filter(Boolean).join(' / ')
    lines.push(`結果: ${result}`)
    if (t.victoryFactors) lines.push(`勝因メモ: ${t.victoryFactors}`)
    if (t.defeatFactors) lines.push(`敗因メモ: ${t.defeatFactors}`)
    if (t.aiReport) {
        const report = t.aiReport.length > MAX_REPORT_CHARS ? `${t.aiReport.slice(0, MAX_REPORT_CHARS)}…` : t.aiReport
        lines.push(`最終レポート抜粋:\n${report}`)
    }
    return lines.join('\n')
}

export async function adviseOnAbTestProposal(
    proposal: string,
    pastTests: PastAbTest[],
    productId?: number,
): Promise<string | null> {
    const historySection = pastTests.length > 0
        ? pastTests.slice(0, MAX_TESTS).map(testBlock).join('\n\n')
        : '（過去のABテスト実績はまだありません。一般的なCROのベストプラクティスに基づいて回答してください）'

    const prompt = `あなたは求人転職サービス(x-work.jp)のグロース施策を長年見てきたCRO（コンバージョン率最適化）の専門家です。
担当者から新しい施策提案の壁打ち相談を受けています。以下の過去ABテスト実績（勝因・敗因を含む）を踏まえて回答してください。

【施策提案】
${proposal}

【過去のABテスト実績】
${historySection}

以下の構成で回答してください:
1. **類似する過去施策と結果** — 提案に関連・類似する過去テストがあれば挙げ、その勝敗と理由を要約する。なければ「直接の類似事例なし」と明記する
2. **提案の評価** — 過去の勝ちパターン・負けパターンに照らした評価。成功確度を「高／中／低」で示し根拠を述べる
3. **リスク・落とし穴** — 過去の敗因から予想される注意点
4. **成功確度を上げる修正案** — 提案をより効果的にする具体的な変更・追加案
5. **推奨テスト設計** — 仮説文（何をどう変えると何がどれくらい改善するか）、期待改善率の目安、推奨テスト期間、計測すべき指標

800文字程度で、箇条書きと短い段落を使って読みやすくまとめてください。`

    return callGemini(prompt, 'adviseOnAbTestProposal', productId)
}
