import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const PRICING: Record<string, { inputPerM: number; outputPerM: number; thinkingPerM: number }> = {
    'gemini-2.5-flash': {
        inputPerM: 0.075,
        outputPerM: 0.30,
        thinkingPerM: 3.50,
    },
}

export interface ParsedLog {
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

interface ByFunctionSummary {
    name: string
    calls: number
    tokens: number
    costUsd: number
}

interface ByDaySummary {
    date: string
    calls: number
    tokens: number
    costUsd: number
}

interface Summary {
    totalCostUsd: number
    totalTokens: number
    callCount: number
    byFunction: ByFunctionSummary[]
    byDay: ByDaySummary[]
}

function calcCost(model: string, prompt: number, completion: number, thinking: number): number {
    const pricing = PRICING[model]
    if (!pricing) return 0
    return (
        prompt * pricing.inputPerM +
        completion * pricing.outputPerM +
        thinking * pricing.thinkingPerM
    ) / 1_000_000
}

function parseLine(line: string): ParsedLog | null {
    const trimmed = line.trim()
    if (!trimmed) return null

    const parts = trimmed.split('\t')
    if (parts.length < 6) return null

    const [datetime, funcName, model, promptPart, completionPart, totalPart] = parts

    const datetimeParts = datetime.split(' ')
    if (datetimeParts.length !== 2) return null
    const [date, time] = datetimeParts

    const promptMatch = promptPart.match(/^prompt:(\d+)$/)
    const completionMatch = completionPart.match(/^completion:(\d+)$/)
    const totalMatch = totalPart.match(/^total:(\d+)$/)

    if (!promptMatch || !completionMatch || !totalMatch) return null

    const promptTokens = parseInt(promptMatch[1], 10)
    const completionTokens = parseInt(completionMatch[1], 10)
    const totalTokens = parseInt(totalMatch[1], 10)
    const thinkingTokens = Math.max(0, totalTokens - promptTokens - completionTokens)

    const costUsd = calcCost(model, promptTokens, completionTokens, thinkingTokens)

    return {
        date,
        time,
        function: funcName,
        model,
        promptTokens,
        completionTokens,
        thinkingTokens,
        totalTokens,
        costUsd,
    }
}

export async function GET() {
    const logPath = path.join(process.cwd(), 'logs', 'gemini-usage.log')

    const emptySummary: Summary = {
        totalCostUsd: 0,
        totalTokens: 0,
        callCount: 0,
        byFunction: [],
        byDay: [],
    }

    if (!fs.existsSync(logPath)) {
        return NextResponse.json({ logs: [], summary: emptySummary })
    }

    const content = fs.readFileSync(logPath, 'utf-8')
    const lines = content.split('\n')

    const parsedLogs: ParsedLog[] = []
    for (const line of lines) {
        const parsed = parseLine(line)
        if (parsed) parsedLogs.push(parsed)
    }

    // newest first
    parsedLogs.reverse()

    // build summary
    let totalCostUsd = 0
    let totalTokens = 0
    const byFunctionMap = new Map<string, ByFunctionSummary>()
    const byDayMap = new Map<string, ByDaySummary>()

    for (const log of parsedLogs) {
        totalCostUsd += log.costUsd
        totalTokens += log.totalTokens

        // by function
        const existing = byFunctionMap.get(log.function) ?? { name: log.function, calls: 0, tokens: 0, costUsd: 0 }
        existing.calls += 1
        existing.tokens += log.totalTokens
        existing.costUsd += log.costUsd
        byFunctionMap.set(log.function, existing)

        // by day
        const dayEntry = byDayMap.get(log.date) ?? { date: log.date, calls: 0, tokens: 0, costUsd: 0 }
        dayEntry.calls += 1
        dayEntry.tokens += log.totalTokens
        dayEntry.costUsd += log.costUsd
        byDayMap.set(log.date, dayEntry)
    }

    const byFunction = Array.from(byFunctionMap.values()).sort((a, b) => b.costUsd - a.costUsd)
    const byDay = Array.from(byDayMap.values()).sort((a, b) => b.date.localeCompare(a.date))

    const summary: Summary = {
        totalCostUsd,
        totalTokens,
        callCount: parsedLogs.length,
        byFunction,
        byDay,
    }

    return NextResponse.json({ logs: parsedLogs, summary })
}
