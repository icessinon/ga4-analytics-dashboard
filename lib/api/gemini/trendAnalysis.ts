/**
 * トレンド分析用Gemini評価
 * 落ち込む月・いい月の傾向、多面的な考察を返す
 */
import { logGeminiUsage } from './logger'

export interface TrendAnalysisRequest {
    trendData: Array<{
        reportId: number
        reportName: string
        month: string
        weeklyResults: Array<{
            period: string
            startDate: string
            endDate: string
            dataA: { pv: number; cv: number; cvr: number }
        }>
        monthlyTotal: { pv: number; cv: number; cvr: number }
    }>
    startMonth: string
    endMonth: string
}

function buildTrendAnalysisPrompt(req: TrendAnalysisRequest): string {
    const reportGroups = new Map<number, typeof req.trendData>()
    req.trendData.forEach((d) => {
        if (!reportGroups.has(d.reportId)) reportGroups.set(d.reportId, [])
        reportGroups.get(d.reportId)!.push(d)
    })

    const sections: string[] = []
    reportGroups.forEach((monthDatas, reportId) => {
        const reportName = monthDatas[0]?.reportName ?? `レポート${reportId}`
        const months = monthDatas
            .sort((a, b) => a.month.localeCompare(b.month))
            .map((m) => {
                const weekly = m.weeklyResults
                    .map(
                        (w) =>
                            `  ${w.period}: PV ${w.dataA.pv.toLocaleString()}, CV ${w.dataA.cv.toLocaleString()}, CVR ${(w.dataA.cvr * 100).toFixed(2)}%`
                    )
                    .join('\n')
                return `【${m.month}】
    月合計: PV ${m.monthlyTotal.pv.toLocaleString()}, CV ${m.monthlyTotal.cv.toLocaleString()}, CVR ${(m.monthlyTotal.cvr * 100).toFixed(2)}%
    週次:
${weekly}`
            })
        sections.push(`【${reportName}】\n${months.join('\n\n')}`)
    })

    const dataBlock = sections.join('\n\n---\n\n')

    return `あなたはWeb分析・コンバージョン分析の専門家です。以下の月次トレンドデータを分析し、実務で役立つ考察を述べてください。

【対象期間】
${req.startMonth} ～ ${req.endMonth}

【トレンドデータ】
${dataBlock}

【分析依頼】
上記データについて、**セッション時間（滞在・エンゲージメント）の傾向**と**月による傾向**を中心に分析結果をまとめてください。チェック時のみ表示するAI回答として、読み手が「傾向が一言で分かる」ように簡潔に書いてください。

1. **月による傾向**
     - どの月が良かったか・落ち込んだか。前月比・月ごとのPV・CV・CVRの推移を簡潔に。
     - 月単位で見た改善・悪化のポイント。

2. **セッション時間・滞在の傾向**
     - 週単位や月単位で、セッションの長さ・滞在時間の変化があれば触れる（データに含まれる場合）。
     - エンゲージメントの高低とCVRの関係に言及できる範囲で。

3. **落ち込んでいる月・週 / 調子が良い月・週**
     - 前月・前週比で悪化している月・週、改善している月・週を特定し、どの指標がどう動いているか簡潔に。

4. **傾向と要因の考察**
     - 月ごとの推移から見える傾向（例：特定月で落ちる、月末に伸びるなど）と、考えられる要因（季節性、施策など）。

5. **その他**
     - リスク・チャンス、次に確認するとよい指標や期間。

回答は600文字程度で、**セッション時間**と**月による傾向**を明確に含め、箇条書きや短い段落で読みやすくまとめてください。`
}

/**
 * トレンドデータをGeminiで分析（落ち込む月・いい月の傾向、多面的な結果）
 */
export async function analyzeTrendWithGemini(
    request: TrendAnalysisRequest,
    apiKey: string
): Promise<string | null> {
    const key = apiKey?.trim() || process.env.GEMINI_API_KEY
    if (!key) return null

    try {
        const prompt = buildTrendAnalysisPrompt(request)
        const modelName = 'gemini-2.5-flash'
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
            }),
        })

        if (!response.ok) {
            const errorText = await response.text()
            let err: { message?: string; error?: { message?: string } }
            try {
                err = JSON.parse(errorText)
            } catch {
                err = { message: errorText }
            }
            console.error(`Gemini API Error: ${response.status}`, err)
            throw new Error(err.error?.message || err.message || 'Gemini API Error')
        }

        const data = await response.json()

        const usage = data.usageMetadata
        if (usage) {
            logGeminiUsage({
                function: 'analyzeTrendWithGemini',
                model: modelName,
                promptTokens: usage.promptTokenCount ?? 0,
                completionTokens: usage.candidatesTokenCount ?? 0,
                totalTokens: usage.totalTokenCount ?? 0,
            })
        }

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text
        return text ? String(text).trim() : null
    } catch (error) {
        console.error('Trend analysis Gemini error:', error)
        return null
    }
}
