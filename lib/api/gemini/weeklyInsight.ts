import { callGemini } from './callGemini'

export interface WeeklyMetrics {
    startDate: string
    endDate: string
    activeUsers: number
    newUsers: number
    sessions: number
    engagementRate: number
    avgSessionDuration: number
    screenPageViews: number
    topPages: Array<{ path: string; views: number }>
}

export interface WeeklyInsightRequest {
    current: WeeklyMetrics
    previous: WeeklyMetrics
}

export async function generateWeeklyInsightWithGemini(req: WeeklyInsightRequest): Promise<string | null> {
    const { current: c, previous: p } = req
    const pctDiff = (a: number, b: number) => b === 0 ? 'N/A' : `${a >= b ? '+' : ''}${(((a - b) / b) * 100).toFixed(1)}%`

    const topPagesText = c.topPages.slice(0, 5).map((pg, i) => `  ${i + 1}. ${pg.path} (${pg.views.toLocaleString()}PV)`).join('\n')

    const prompt = `あなたはWebアナリストです。以下は求人転職サービス(x-work.jp)の月次KPIサマリーです。簡潔な月次インサイトレポートを生成してください。

【今月】${c.startDate} 〜 ${c.endDate}
- アクティブユーザー: ${c.activeUsers.toLocaleString()} (${pctDiff(c.activeUsers, p.activeUsers)})
- 新規ユーザー: ${c.newUsers.toLocaleString()} (${pctDiff(c.newUsers, p.newUsers)})
- セッション数: ${c.sessions.toLocaleString()} (${pctDiff(c.sessions, p.sessions)})
- エンゲージメント率: ${(c.engagementRate * 100).toFixed(1)}% (${pctDiff(c.engagementRate, p.engagementRate)})
- 平均セッション時間: ${Math.round(c.avgSessionDuration)}秒 (${pctDiff(c.avgSessionDuration, p.avgSessionDuration)})
- ページビュー: ${c.screenPageViews.toLocaleString()} (${pctDiff(c.screenPageViews, p.screenPageViews)})

【先月】${p.startDate} 〜 ${p.endDate}
- アクティブユーザー: ${p.activeUsers.toLocaleString()}
- セッション数: ${p.sessions.toLocaleString()}
- エンゲージメント率: ${(p.engagementRate * 100).toFixed(1)}%

【今月の上位ページ（PV順）】
${topPagesText}

以下の形式でレポートを作成してください:

**📊 今月のサマリー**（2〜3文で全体傾向を端的に）

**✅ 良い点**（箇条書き 2点）

**⚠️ 注意点**（箇条書き 2点）

**🎯 来月の推奨アクション**（箇条書き 3点、具体的に）

全体600文字以内で、チームミーティングでそのまま使えるような実務的な内容にしてください。`

    return callGemini(prompt, 'generateWeeklyInsightWithGemini')
}
