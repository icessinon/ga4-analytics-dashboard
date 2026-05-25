import { logGeminiUsage } from './logger'
import { getGeminiApiKey } from '@/lib/utils/gemini'

const MODEL = 'gemini-2.5-flash'

export async function callGemini(prompt: string, functionName: string): Promise<string | null> {
    const apiKey = getGeminiApiKey()
    if (!apiKey) return null
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) })
    if (!res.ok) { const t = await res.text(); throw new Error(`Gemini ${res.status}: ${t}`) }
    const data = await res.json()
    const u = data.usageMetadata
    if (u) logGeminiUsage({ function: functionName, model: MODEL, promptTokens: u.promptTokenCount ?? 0, completionTokens: u.candidatesTokenCount ?? 0, totalTokens: u.totalTokenCount ?? 0 })
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null
}
