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
    cv?: {
        applyCv: { users: number; pv: number }
        lpApplyCv: { users: number; pv: number }
        signupCv: { users: number; pv: number }
    }
    topPages: Array<{ path: string; views: number }>
}

export interface WeeklyInsightRequest {
    current: WeeklyMetrics
    previous: WeeklyMetrics
    productId?: number
}

export async function generateWeeklyInsightWithGemini(req: WeeklyInsightRequest): Promise<string | null> {
    const { current: c, previous: p } = req
    const pctDiff = (a: number, b: number) => b === 0 ? 'N/A' : `${a >= b ? '+' : ''}${(((a - b) / b) * 100).toFixed(1)}%`

    const topPagesText = c.topPages.slice(0, 5).map((pg, i) => `  ${i + 1}. ${pg.path} (${pg.views.toLocaleString()}PV)`).join('\n')

    const targetMonth = c.startDate.slice(0, 7)

    const prompt = `あなたはWebアナリストです。以下は求人転職サービス(x-work.jp)の月次KPIサマリーです。対象月は ${targetMonth} です（過去の月の場合もあります）。簡潔な月次インサイトレポートを生成してください。

【対象月】${c.startDate} 〜 ${c.endDate}
- アクティブユーザー: ${c.activeUsers.toLocaleString()} (${pctDiff(c.activeUsers, p.activeUsers)})
- 新規ユーザー: ${c.newUsers.toLocaleString()} (${pctDiff(c.newUsers, p.newUsers)})
- セッション数: ${c.sessions.toLocaleString()} (${pctDiff(c.sessions, p.sessions)})
- エンゲージメント率: ${(c.engagementRate * 100).toFixed(1)}% (${pctDiff(c.engagementRate, p.engagementRate)})
- 平均セッション時間: ${Math.round(c.avgSessionDuration)}秒 (${pctDiff(c.avgSessionDuration, p.avgSessionDuration)})
- ページビュー: ${c.screenPageViews.toLocaleString()} (${pctDiff(c.screenPageViews, p.screenPageViews)})${c.cv ? `
- 応募CV（求人応募完了ユーザー）: ${c.cv.applyCv.users.toLocaleString()} (${pctDiff(c.cv.applyCv.users, p.cv?.applyCv.users ?? 0)})
- LP応募CV（人材紹介LP応募完了ユーザー）: ${c.cv.lpApplyCv.users.toLocaleString()} (${pctDiff(c.cv.lpApplyCv.users, p.cv?.lpApplyCv.users ?? 0)})
- 会員登録CV: ${c.cv.signupCv.users.toLocaleString()} (${pctDiff(c.cv.signupCv.users, p.cv?.signupCv.users ?? 0)})` : ''}

【前月】${p.startDate} 〜 ${p.endDate}
- アクティブユーザー: ${p.activeUsers.toLocaleString()}
- セッション数: ${p.sessions.toLocaleString()}
- エンゲージメント率: ${(p.engagementRate * 100).toFixed(1)}%${p.cv ? `
- 応募CV: ${p.cv.applyCv.users.toLocaleString()} / LP応募CV: ${p.cv.lpApplyCv.users.toLocaleString()} / 会員登録CV: ${p.cv.signupCv.users.toLocaleString()}` : ''}

【対象月の上位ページ（PV順）】
${topPagesText}

${c.cv ? '応募CV・LP応募CV・会員登録CVは求人サービスとして最重要のKPIです。増減とその要因（トラフィック起因かCVR起因か）に必ず言及してください。\n\n' : ''}以下の形式でレポートを作成してください:

**📊 ${targetMonth} のサマリー**（2〜3文で全体傾向を端的に）

**✅ 良い点**（箇条書き 2点）

**⚠️ 注意点**（箇条書き 2点）

**🎯 翌月の推奨アクション**（箇条書き 3点、具体的に）

全体600文字以内で、チームミーティングでそのまま使えるような実務的な内容にしてください。`

    return callGemini(prompt, 'generateWeeklyInsightWithGemini', req.productId)
}
