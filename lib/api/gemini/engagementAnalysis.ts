/**
 * エンゲージメントファネル用Gemini分析
 * ページ別の滞在時間ファネルを要約・考察する
 */
import { logGeminiUsage } from './logger'

export interface EngagementAnalysisRequest {
    startDate: string
    endDate: string
    rows: Array<{
        pagePath: string
        baseUsers: number
        baseEvents: number
        milestones: Record<string, { users: number; events: number }>
        rates: Record<string, number>
    }>
}

function buildEngagementPrompt(req: EngagementAnalysisRequest): string {
    const lines: string[] = []
    for (const row of req.rows.slice(0, 50)) {
        const parts = [
            row.pagePath,
            `10秒: ${row.baseUsers.toLocaleString()}ユーザー`,
            ...Object.entries(row.rates).map(([k, v]) => `${k}: ${(v * 100).toFixed(1)}%`),
        ]
        lines.push(parts.join(' | '))
    }
    if (req.rows.length > 50) {
        lines.push(`... 他 ${req.rows.length - 50} ページ`)
    }
    const dataBlock = lines.join('\n')

    return `あなたはWeb分析・UX分析の専門家です。以下のエンゲージメントファネル（ページごとの滞在時間の到達率）を分析し、実務で役立つ考察を述べてください。

【対象期間】
${req.startDate} ～ ${req.endDate}

【ファネルデータ（ページパス | 10秒到達ユーザー | 各閾値の到達率）】
${dataBlock}

【分析依頼】
1. 全体傾向: どのページがエンゲージメントが高いか・低いか。到達率のばらつきを簡潔に。
2. 落ち込みが目立つページ: 10秒→30秒や30秒→60秒で大きく落ちるページがあれば指摘し、考えられる要因を一言ずつ。
3. 改善の優先度: 施策をかけるならどのページから手を付けると良さそうか、理由とともに。
4. その他: 滞在時間・離脱の傾向で気づいた点があれば。

回答は500文字程度で、箇条書きで読みやすくまとめてください。`
}

export async function analyzeEngagementWithGemini(
    request: EngagementAnalysisRequest,
    apiKey: string
): Promise<string | null> {
    const key = apiKey?.trim() || process.env.GEMINI_API_KEY
    if (!key) return null

    try {
        const prompt = buildEngagementPrompt(request)
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
                function: 'analyzeEngagementWithGemini',
                model: modelName,
                promptTokens: usage.promptTokenCount ?? 0,
                completionTokens: usage.candidatesTokenCount ?? 0,
                totalTokens: usage.totalTokenCount ?? 0,
            })
        }

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text
        return text ? String(text).trim() : null
    } catch (error) {
        console.error('Engagement analysis Gemini error:', error)
        return null
    }
}
