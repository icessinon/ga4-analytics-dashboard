import { NextResponse } from 'next/server'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { parseDateString } from '@/lib/utils/date'

export interface ScoredSegment {
    name: string
    score: number
    rank: 'active' | 'dormant' | 'churn'
    activeUsers: number
    sessions: number
    pageViews: number
    sessionsPerUser: number
    pvPerSession: number
    engagementRate: number
    recentUserRatio: number
    scores: {
        recency: number
        frequency: number
        engagement: number
        depth: number
    }
}

function fmt(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function normalize(values: number[]): number[] {
    const max = Math.max(...values)
    const min = Math.min(...values)
    if (max === min) return values.map(() => 0.5)
    return values.map((v) => (v - min) / (max - min))
}

function classifyRank(score: number): 'active' | 'dormant' | 'churn' {
    if (score >= 70) return 'active'
    if (score >= 30) return 'dormant'
    return 'churn'
}

const METRICS = [
    { name: 'activeUsers' },
    { name: 'sessions' },
    { name: 'screenPageViews' },
    { name: 'engagementRate' },
]

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const {
            propertyId,
            segmentDimension = 'deviceCategory',
            periodDays = 30,
            accessToken: customToken,
        } = body

        if (!propertyId) {
            return NextResponse.json({ error: 'propertyId is required' }, { status: 400 })
        }

        const accessToken = await getGA4AccessToken(customToken)

        const today = new Date()
        const endDate = parseDateString(fmt(today))

        // 全期間
        const fullStart = new Date(today)
        fullStart.setDate(today.getDate() - periodDays)
        const startDate = parseDateString(fmt(fullStart))

        // 直近7日
        const recentStart = new Date(today)
        recentStart.setDate(today.getDate() - 7)
        const recentStartDate = parseDateString(fmt(recentStart))

        const baseRequest = {
            propertyId,
            dimensions: [{ name: segmentDimension }],
            metrics: METRICS,
            limit: 50,
        }

        // 全期間と直近7日を並行取得
        const [fullReport, recentReport] = await Promise.all([
            fetchGA4Data({ ...baseRequest, dateRanges: [{ startDate, endDate }] }, accessToken),
            fetchGA4Data({ ...baseRequest, dateRanges: [{ startDate: recentStartDate, endDate }] }, accessToken),
        ])

        // 全期間データをマップ化
        type RowData = { activeUsers: number; sessions: number; pageViews: number; engagementRate: number }
        const fullMap = new Map<string, RowData>()
        for (const row of fullReport.rows ?? []) {
            const name = row.dimensionValues[0]?.value ?? '(not set)'
            fullMap.set(name, {
                activeUsers: parseFloat(row.metricValues[0]?.value ?? '0'),
                sessions: parseFloat(row.metricValues[1]?.value ?? '0'),
                pageViews: parseFloat(row.metricValues[2]?.value ?? '0'),
                engagementRate: parseFloat(row.metricValues[3]?.value ?? '0'),
            })
        }

        // 直近7日データをマップ化
        const recentMap = new Map<string, number>()
        for (const row of recentReport.rows ?? []) {
            const name = row.dimensionValues[0]?.value ?? '(not set)'
            recentMap.set(name, parseFloat(row.metricValues[0]?.value ?? '0'))
        }

        // セグメント一覧（全期間に存在するもの）
        const segments = [...fullMap.entries()]
            .filter(([, d]) => d.activeUsers >= 1)
            .map(([name, d]) => {
                const recentUsers = recentMap.get(name) ?? 0
                const sessionsPerUser = d.sessions > 0 ? d.sessions / d.activeUsers : 0
                const pvPerSession = d.sessions > 0 ? d.pageViews / d.sessions : 0
                const recentUserRatio = d.activeUsers > 0 ? recentUsers / d.activeUsers : 0
                return {
                    name,
                    activeUsers: Math.round(d.activeUsers),
                    sessions: Math.round(d.sessions),
                    pageViews: Math.round(d.pageViews),
                    engagementRate: d.engagementRate,
                    sessionsPerUser,
                    pvPerSession,
                    recentUserRatio,
                }
            })

        if (segments.length === 0) {
            return NextResponse.json({ success: true, segments: [], summary: { active: 0, dormant: 0, churn: 0 } })
        }

        // 各指標を正規化してスコア計算
        const recencyNorm   = normalize(segments.map((s) => s.recentUserRatio))
        const frequencyNorm = normalize(segments.map((s) => s.sessionsPerUser))
        const engagementNorm = normalize(segments.map((s) => s.engagementRate))
        const depthNorm     = normalize(segments.map((s) => s.pvPerSession))

        const scored: ScoredSegment[] = segments.map((s, i) => {
            const recencyScore    = Math.round(recencyNorm[i] * 25)
            const frequencyScore  = Math.round(frequencyNorm[i] * 25)
            const engagementScore = Math.round(engagementNorm[i] * 25)
            const depthScore      = Math.round(depthNorm[i] * 25)
            const score = recencyScore + frequencyScore + engagementScore + depthScore

            return {
                ...s,
                score,
                rank: classifyRank(score),
                scores: {
                    recency: recencyScore,
                    frequency: frequencyScore,
                    engagement: engagementScore,
                    depth: depthScore,
                },
            }
        })

        scored.sort((a, b) => b.score - a.score)

        const summary = {
            active: scored.filter((s) => s.rank === 'active').length,
            dormant: scored.filter((s) => s.rank === 'dormant').length,
            churn: scored.filter((s) => s.rank === 'churn').length,
        }

        return NextResponse.json({ success: true, segments: scored, summary, periodDays, segmentDimension })
    } catch (error) {
        console.error('Scoring API Error:', error)
        return NextResponse.json(
            { error: 'スコアリングに失敗しました', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
