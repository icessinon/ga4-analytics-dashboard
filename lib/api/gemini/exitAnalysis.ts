import { callGemini } from './callGemini'

export interface ExitFunnelStep {
    name: string
    sessions: number
    dropoff: number
    dropoffRate: number
}

export interface ExitCategoryInput {
    page: string
    exits: number
    pageViews: number
    exitRate: number
    engagementRate: number
    avgEngagementSec?: number
    scrollRate?: number
}

export interface ExitAnalysisRequest {
    steps: ExitFunnelStep[]
    exitCategories: ExitCategoryInput[]
    startDate: string
    endDate: string
    deviceFilter?: string
}

function signalText(c: ExitCategoryInput): string {
    if (c.avgEngagementSec == null && c.scrollRate == null) return ''
    const parts = []
    if (c.avgEngagementSec != null) parts.push(`平均滞在${Math.round(c.avgEngagementSec)}秒`)
    if (c.scrollRate != null) parts.push(`スクロール到達率(90%)${(c.scrollRate * 100).toFixed(0)}%`)
    return ` ／ ${parts.join(' / ')}`
}

export async function analyzeExitWithGemini(req: ExitAnalysisRequest): Promise<string | null> {
    const stepLines = req.steps.map((s, i) => {
        const drop = i > 0 ? `（前ステップから${s.dropoff.toLocaleString()}件離脱・脱落率${(s.dropoffRate * 100).toFixed(1)}%）` : ''
        return `${i + 1}. ${s.name}: ${s.sessions.toLocaleString()}セッション${drop}`
    }).join('\n')

    const categoryLines = req.exitCategories.slice(0, 15).map((c) =>
        `- ${c.page}: PV ${c.pageViews.toLocaleString()} ／ 推定離脱${c.exits.toLocaleString()} ／ 離脱傾向${(c.exitRate * 100).toFixed(1)}% ／ エンゲージメント率${(c.engagementRate * 100).toFixed(0)}%${signalText(c)}`
    ).join('\n')

    const prompt = `あなたはWeb分析・UX分析の専門家です。以下は求人転職サービス(x-work.jp)の離脱分析データです。

【集計期間】${req.startDate} 〜 ${req.endDate}${req.deviceFilter ? `（デバイス: ${req.deviceFilter}）` : ''}

【ファネル離脱状況】
${stepLines}

【ページカテゴリ別の離脱状況（行動シグナル付き）】
${categoryLines}

上記データについて以下を分析してください:
1. **主要な離脱ポイント** — ファネルのどのステップ・どのページカテゴリで特に離脱が多いか
2. **離脱の質の判定** — 行動シグナルを活用すること。滞在が短くスクロールも浅い＝即離脱（期待とのミスマッチ・第一印象の問題）、滞在が長くスクロールも深いのに離脱傾向が高い＝読了後離脱（内容は見たが行動に至らない：訴求・導線・条件の問題）として区別する
3. **求人転職サービスとしての考察** — 各離脱パターンの背景にあるユーザー心理
4. **改善提案（上位3点）** — 離脱率を下げるための具体的なUX/コンテンツ施策
5. **優先対応すべきページ** — PVが多く改善インパクトが期待できるページ

600文字程度で、箇条書きと短い段落を使って読みやすくまとめてください。`

    return callGemini(prompt, 'analyzeExitWithGemini')
}
