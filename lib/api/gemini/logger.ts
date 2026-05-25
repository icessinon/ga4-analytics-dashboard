import fs from 'fs'
import path from 'path'

export interface GeminiUsageLog {
    function: string
    model: string
    promptTokens: number
    completionTokens: number
    totalTokens: number
}

const LOG_FILE = path.join(process.cwd(), 'logs', 'gemini-usage.log')

export function logGeminiUsage(entry: GeminiUsageLog): void {
    const now = new Date()
    const date = now.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
    const time = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const line = `${date} ${time}\t${entry.function}\t${entry.model}\tprompt:${entry.promptTokens}\tcompletion:${entry.completionTokens}\ttotal:${entry.totalTokens}\n`

    try {
        const dir = path.dirname(LOG_FILE)
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }
        fs.appendFileSync(LOG_FILE, line, 'utf8')
    } catch (err) {
        console.error('Gemini usage log write error:', err)
    }
}
