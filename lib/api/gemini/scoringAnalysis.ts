import { callGemini } from './callGemini'

export interface ScoredSegmentInput {
    name: string
    score: number
    rank: 'active' | 'dormant' | 'churn'
    activeUsers: number
    sessionsPerUser: number
    pvPerSession: number
    engagementRate: number
    recentUserRatio: number
}

export interface ScoringAnalysisRequest {
    segments: ScoredSegmentInput[]
    segmentDimension: string
    periodDays: number
}

export async function analyzeScoringWithGemini(req: ScoringAnalysisRequest): Promise<string | null> {
    const DIMENSION_LABELS: Record<string, string> = {
        deviceCategory: 'デバイス', sessionSource: '流入元', sessionMedium: '流入経路',
        operatingSystem: 'OS', browser: 'ブラウザ', country: '国'
    }
    const dimLabel = DIMENSION_LABELS[req.segmentDimension] ?? req.segmentDimension

    const segLines = req.segments.map((s) => {
        const rankLabel = { active: '活性', dormant: '休眠', churn: '離脱リスク' }[s.rank]
        return `- ${s.name}: ${rankLabel}(${s.score}点) | ユーザー数:${s.activeUsers.toLocaleString()} | セッション/人:${s.sessionsPerUser.toFixed(1)} | PV/セッション:${s.pvPerSession.toFixed(1)} | EG率:${(s.engagementRate * 100).toFixed(1)}% | 直近比:${(s.recentUserRatio * 100).toFixed(0)}%`
    }).join('\n')

    const activeSegs = req.segments.filter((s) => s.rank === 'active')
    const churnSegs = req.segments.filter((s) => s.rank === 'churn')

    const prompt = `あなたはユーザー行動分析・グロース戦略の専門家です。以下は求人転職サービス(x-work.jp)のユーザーセグメント別スコアリングデータ（過去${req.periodDays}日間）です。

【セグメント軸】${dimLabel}

【スコアリング結果】
${segLines}

【スコア定義】
- 直近性(Recency): 直近7日以内の来訪割合
- 頻度(Frequency): セッション/人
- 熱量(Engagement): エンゲージメント率
- 深度(Depth): PV/セッション

以下を分析してください:

1. **活性セグメントの特徴** — ${activeSegs.map((s) => s.name).join('、') || 'なし'} が高スコアである行動パターンの特徴

2. **離脱リスクセグメントの課題** — ${churnSegs.map((s) => s.name).join('、') || 'なし'} の離脱要因の考察

3. **${dimLabel}別の戦略的示唆** — 求人転職サービスとして、このセグメント軸から得られる施策ヒント

4. **優先施策（上位3点）** — スコアを改善するための具体的なアクション（対象セグメントを明示）

600文字程度で、施策を具体的に記述してください。`

    return callGemini(prompt, 'analyzeScoringWithGemini')
}
