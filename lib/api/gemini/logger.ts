import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { insertAiAnalysisLog, jstReportDate, jstReportMonth, nowIso } from '@/lib/bq/write'

export interface GeminiUsageLog {
    function: string
    model: string
    promptTokens: number
    completionTokens: number
    totalTokens: number
    feature?: string   // 明示指定がなければ function 名から推定
    productId?: number // 特定できる場合のみ
}

const LOG_FILE = path.join(process.cwd(), 'logs', 'gemini-usage.log')

// 関数名 → BQ 側の feature 分類
function inferFeature(fn: string): string {
    const f = fn.toLowerCase()
    if (f.includes('abtest') || f.includes('ab_test') || f === 'evaluatewithgemini') return 'ab_test'
    if (f.includes('funnel'))     return 'funnel'
    if (f.includes('engagement')) return 'engagement'
    if (f.includes('trend'))      return 'trend'
    if (f.includes('journey'))    return 'journey'
    if (f.includes('insight') || f.includes('weekly')) return 'monthly_insight'
    return 'other'
}

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

    // BQ にも fire-and-forget で送る
    void insertAiAnalysisLog({
        id:                crypto.randomUUID(),
        source:            'ga4_analytics_dashboard',
        feature:           entry.feature ?? inferFeature(entry.function),
        function_name:     entry.function,
        model:             entry.model,
        prompt_tokens:     entry.promptTokens,
        completion_tokens: entry.completionTokens,
        total_tokens:      entry.totalTokens,
        product_id:        entry.productId ?? null,
        report_month:      jstReportMonth(now),
        report_date:       jstReportDate(now),
        created_at:        now.toISOString(),
        synced_at:         nowIso(),
    })
}
