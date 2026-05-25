import { callGemini } from './callGemini'

export interface DropoutPath { channel: string; n2: string; n1: string; dropout: number; ratio: number }
export interface DropoutAnalysisRequest {
    paths: DropoutPath[]
    totalUsers: number
    goalUsers: number
    startDate: string
    endDate: string
}

export async function analyzeDropoutPathsWithGemini(req: DropoutAnalysisRequest): Promise<string | null> {
    const top = req.paths.slice(0, 20)
    const pathLines = top.map((p, i) =>
        `${i + 1}. チャネル:${p.channel} → ${p.n2} → ${p.n1} → 離脱   件数:${p.dropout} (全体比:${(p.ratio * 100).toFixed(1)}%)`
    ).join('\n')

    const dropoutUsers = req.totalUsers - req.goalUsers
    const dropoutRate = req.totalUsers > 0 ? ((dropoutUsers / req.totalUsers) * 100).toFixed(1) : '0'

    const prompt = `あなたはWeb分析・UX分析の専門家です。以下は求人転職サービス(x-work.jp)の離脱経路パターンデータです。

【集計期間】${req.startDate} 〜 ${req.endDate}
【全体概要】
- アクティブユーザー: ${req.totalUsers.toLocaleString()}人
- フォーム到達ユーザー: ${req.goalUsers.toLocaleString()}人
- 未到達（離脱）ユーザー: ${dropoutUsers.toLocaleString()}人（離脱率: ${dropoutRate}%）

【上位離脱経路パターン（チャネル → N-2ページ → N-1ページ → 離脱）】
${pathLines}

上記データについて以下を分析してください:
1. **主要な離脱ポイント** — どのチャネル・ページで特に多く離脱しているか
2. **パターン別の考察** — 求人転職サービスとして、各離脱パターンの背景にある行動心理
3. **改善提案（上位3点）** — 離脱率を下げるための具体的なUX/コンテンツ施策
4. **優先対応すべき経路** — 影響が大きく、改善インパクトが期待できる経路

600文字程度で、箇条書きと短い段落を使って読みやすくまとめてください。`

    return callGemini(prompt, 'analyzeDropoutPathsWithGemini')
}
