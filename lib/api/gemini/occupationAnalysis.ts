import { callGemini } from './callGemini'

export interface OccupationAnalysisRequest {
    startDate: string
    endDate: string
    occupations: Array<{ label: string; signupCv: number; sessions: number | null; signupRate: number | null }>
    noOccSignupCv: number
    totalSessions?: number
    overallSignupRate?: number | null
    lpApplies: Array<{ label: string; cv: number }>
}

export async function analyzeOccupationWithGemini(
    req: OccupationAnalysisRequest,
    productId?: number
): Promise<string | null> {
    const occLines = req.occupations.map((o) => {
        const sessions = o.sessions != null ? o.sessions.toLocaleString() : '－'
        const rate = o.signupRate != null ? `${(o.signupRate * 100).toFixed(2)}%` : '－'
        return `- ${o.label}: 会員登録CV ${o.signupCv.toLocaleString()} ／ 職種配下セッション ${sessions} ／ 登録率 ${rate}`
    }).join('\n')

    const lpLines = req.lpApplies.map((l) => `- ${l.label}: LP応募CV ${l.cv.toLocaleString()}`).join('\n') || '- データなし'

    const overallLine = req.totalSessions != null
        ? `【全体ベースライン】サイト全体セッション ${req.totalSessions.toLocaleString()} ／ 全体登録率 ${req.overallSignupRate != null ? `${(req.overallSignupRate * 100).toFixed(2)}%` : '－'}`
        : ''

    const prompt = `あなたは求人転職サービス(x-work.jp)のWebアナリストです。職種別のCV実績から、注力すべき職種と改善機会を分析してください。

【集計期間】${req.startDate} 〜 ${req.endDate}
${overallLine}

【職種別の会員登録CV】（登録フォームの occ パラメータ別。職種配下セッションは /{職種スラッグ} 配下ページの合計）
${occLines}
- 職種指定なしの会員登録CV: ${req.noOccSignupCv.toLocaleString()}

【事業領域別のLP応募CV】
${lpLines}

以下を分析してください:
1. **職種ポートフォリオの現状** — CVがどの職種に集中しているか、セッション規模に対して登録率が高い/低い職種はどこか
2. **改善機会** — セッションは多いのに登録率が低い職種（伸びしろ）と、登録率は高いのにセッションが少ない職種（流入強化候補）
3. **推奨アクション（上位3点）** — 職種別の具体的な施策提案（SEO・LP・導線改善など）

制約:
- 全体で500字程度
- 重要な数字・職種名は **太字** で強調
- データにない事実を作らない`

    return callGemini(prompt, 'analyzeOccupationWithGemini', productId)
}
