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
    businessContext?: string,
): Promise<string | null> {
    const historySection = pastTests.length > 0
        ? pastTests.slice(0, MAX_TESTS).map(testBlock).join('\n\n')
        : '（過去のABテスト実績はまだありません。一般的なCROのベストプラクティスに基づいて回答してください）'

    const contextSection = businessContext
        ? `\n【事業の実測データ・CV単価】\n${businessContext}\n`
        : ''

    const prompt = `あなたは求人転職サービス(x-work.jp)のグロース施策を長年見てきたCRO（コンバージョン率最適化）の専門家です。
担当者から新しい施策提案の壁打ち相談を受けています。過去ABテスト実績（勝因・敗因を含む）と事業の実測データを踏まえて回答してください。

【施策提案】
${proposal}
${contextSection}
【過去のABテスト実績】
${historySection}

以下の構成で回答してください:
1. **類似する過去施策と結果** — 提案に関連・類似する過去テストがあれば挙げ、その勝敗と理由を要約する。なければ「直接の類似事例なし」と明記する
2. **提案の評価** — 過去の勝ちパターン・負けパターンに照らした評価。成功確度を「高／中／低」で示し根拠を述べる
3. **想定インパクトの金額換算** — 実測データから施策の対象規模（月間UU・CV数）を特定し、現実的なリフト幅のシナリオでCV増分を見積もり、CV単価を掛けて「+◯万円/月」で示す。対象規模が実測データから特定できない場合はその旨を明記し、必要な数値を挙げる
4. **リスク・落とし穴** — 過去の敗因から予想される注意点
5. **成功確度を上げる修正案** — 提案をより効果的にする具体的な変更・追加案
6. **推奨テスト設計** — 仮説文、主要KPI、推奨テスト期間、検出力の目安。検出力は「検出可能な最小差 ≈ 2.8 × √(2p(1-p)/n)（p=ベースライン率、n=群あたりサンプル数）」で概算し、「4週間で相対+◯%から検出可能」の形式で示す

1000文字程度で、箇条書きと短い段落を使って読みやすくまとめてください。
数値は与えられた実測データ・単価のみを使い、不明な数値は捏造せず「要実測」と書くこと。`

    return callGemini(prompt, 'adviseOnAbTestProposal', productId)
}
