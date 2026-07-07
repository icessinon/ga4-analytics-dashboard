import { callGemini } from './callGemini'

export interface DropSegment {
    segment: string
    yesterday: number
    baselineMedian: number
    diff: number
}

export interface DropDrilldown {
    label: string
    segments: DropSegment[]
}

export interface CvDropCauseRequest {
    productName: string
    targetDate: string
    weekdayLabel: string
    alerts: Array<{ label: string; yesterday: number; baselineAvg: number; dropRate: number }>
    drilldowns: DropDrilldown[]
}

function fmt(n: number): string {
    return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1)
}

/**
 * CV急落アラートの内訳データから、AIが原因仮説と確認ポイントを生成する。
 * Slack通知に添付するため、出力は Slack mrkdwn（*太字*）形式・300字程度。
 */
export async function generateCvDropCauseHypothesis(
    req: CvDropCauseRequest,
    productId?: number
): Promise<string | null> {
    const alertLines = req.alerts.map((a) =>
        `- ${a.label}: 前日 ${fmt(a.yesterday)}（ベースライン ${fmt(a.baselineAvg)}、-${(a.dropRate * 100).toFixed(1)}%）`
    ).join('\n')

    const drilldownBlocks = req.drilldowns.map((d) => {
        const lines = d.segments.map((s) =>
            `  - ${s.segment}: 前日 ${fmt(s.yesterday)}（同曜日中央値 ${fmt(s.baselineMedian)}、差分 -${fmt(s.diff)}）`
        ).join('\n')
        return `【${d.label}】\n${lines}`
    }).join('\n')

    const prompt = `あなたは求人転職サービス(x-work.jp)のWebアナリストです。前日の指標が急落したため、内訳データから原因を推定してください。

【サービス背景】
- 主要な流入チャネル: Direct（LINE内ブラウザのリファラー欠落を含む）、LINE(social)、Google organic/cpc、スカウトSMS
- CVはサンクスページ到達で計測（応募CV=/entry/thanks、LP応募CV=/lp-thanks、会員登録CV=/members/signup/thanks）。計測はGTM経由

【急落した指標】対象日: ${req.targetDate}（${req.weekdayLabel}曜日）／ ベースラインは過去4週の同一曜日の中央値
${alertLines}

【セグメント別内訳（下落幅の大きい順）】
${drilldownBlocks}

上記から以下を出力してください:
1. *原因仮説*（可能性の高い順に最大3個。特定チャネルの流入停止・特定ページの計測タグ欠落・サイト障害・季節要因などから、内訳データと整合するものだけを挙げる）
2. *確認ポイント*（仮説を検証するために最初に見るべき箇所を2〜3個）

制約:
- 全体で300字程度
- Slackに表示するため、太字は **ではなく * 1個で囲む（例: *原因仮説*）
- 見出し記号(#)は使わない
- 内訳データに現れていない原因を断定しない`

    return callGemini(prompt, 'generateCvDropCauseHypothesis', productId)
}
