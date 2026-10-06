/** AI 利用状況（GET /api/ai-usage）の型。ログは logs/ai-usage の 1 行 1 呼び出し */

export interface AiUsageLog {
    date: string
    time: string
    function: string
    model: string
    promptTokens: number
    completionTokens: number
    thinkingTokens: number
    totalTokens: number
    costUsd: number
}

export interface AiUsageByFunction {
    name: string
    calls: number
    tokens: number
    costUsd: number
}

export interface AiUsageByDay {
    date: string
    calls: number
    tokens: number
    costUsd: number
}

export interface AiUsageSummary {
    totalCostUsd: number
    totalTokens: number
    callCount: number
    byFunction: AiUsageByFunction[]
    byDay: AiUsageByDay[]
}

export interface AiUsageResponse {
    logs: AiUsageLog[]
    summary: AiUsageSummary
}
