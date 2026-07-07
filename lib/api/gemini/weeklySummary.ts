import { callGemini } from './callGemini'

export interface WeeklyKpi {
    label: string
    thisWeek: number
    prevWeek: number
    isRate?: boolean
}

export interface WeeklyChannelMove {
    channel: string
    thisWeek: number
    prevWeek: number
}

export interface WeeklyAbTestProgress {
    name: string
    hypothesis: string | null
    variants: Array<{ label: string; pv: number; cv: number; cvr: number }>
    significance: number | null
    endDate: string | null
}

export interface WeeklySummaryRequest {
    productName: string
    weekStart: string
    weekEnd: string
    kpis: WeeklyKpi[]
    channelMoves: WeeklyChannelMove[]
    runningAbTests: WeeklyAbTestProgress[]
}

function fmtValue(v: number, isRate?: boolean): string {
    return isRate ? `${(v * 100).toFixed(2)}%` : Math.round(v).toLocaleString()
}

function wow(thisWeek: number, prevWeek: number): string {
    if (prevWeek === 0) return 'N/A'
    const pct = ((thisWeek - prevWeek) / prevWeek) * 100
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
}

/**
 * 先週KPI・チャネル変動・実行中ABテストから週次サマリーを生成する。
 * Slack配信用のため、出力は Slack mrkdwn（*太字*）形式・400字程度。
 */
export async function generateWeeklySummary(
    req: WeeklySummaryRequest,
    productId?: number
): Promise<string | null> {
    const kpiLines = req.kpis.map((k) =>
        `- ${k.label}: ${fmtValue(k.thisWeek, k.isRate)}（前週 ${fmtValue(k.prevWeek, k.isRate)}、前週比 ${wow(k.thisWeek, k.prevWeek)}）`
    ).join('\n')

    const channelLines = req.channelMoves.map((c) =>
        `- ${c.channel}: セッション ${c.thisWeek.toLocaleString()}（前週 ${c.prevWeek.toLocaleString()}、${wow(c.thisWeek, c.prevWeek)}）`
    ).join('\n') || '- データなし'

    const abLines = req.runningAbTests.map((t) => {
        const variantText = t.variants.map((v) => `${v.label} CVR ${(v.cvr * 100).toFixed(2)}%（${v.cv}/${v.pv}）`).join(' vs ')
        const sig = t.significance != null ? `有意差 ${t.significance.toFixed(1)}%` : '有意差 未算出'
        return `- ${t.name}${t.endDate ? `（〜${t.endDate}）` : ''}: ${variantText} ／ ${sig}${t.hypothesis ? `\n  仮説: ${t.hypothesis}` : ''}`
    }).join('\n') || '- 実行中のテストなし'

    const prompt = `あなたは求人転職サービス(x-work.jp)のWebアナリストです。先週の実績データからチーム向けの週次サマリーを作成してください。

【対象週】${req.weekStart} 〜 ${req.weekEnd}（前週比較付き）

【主要KPI】
${kpiLines}

【チャネル別セッション（変動の大きい順）】
${channelLines}

【実行中のABテスト（途中経過）】
${abLines}

以下の構成で出力してください:
1. *先週のハイライト* — 数字の動きで最も重要なもの2〜3点（良い動きも悪い動きも）
2. *気になる変化* — 注意して見るべき変化・リスク（該当なければ「特になし」）
3. *今週のアクション* — チームが今週やるべきこと2〜3点（ABテストの判断・確認事項など具体的に）

制約:
- 全体で400字程度
- 挨拶・自己紹介・前置きは書かず、「*先週のハイライト*」から直接始める
- Slackに表示するため、太字は **ではなく * 1個で囲む（例: *先週のハイライト*）
- 見出し記号(#)は使わない
- データにない事実を作らない
- 前週に大規模キャンペーン等のスパイクがあると前週比が大きく見えることがある。変動が極端な場合はその可能性にも言及する`

    return callGemini(prompt, 'generateWeeklySummary', productId)
}
