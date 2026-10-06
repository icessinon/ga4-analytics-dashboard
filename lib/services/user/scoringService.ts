import type { Ga4Reporter } from '@/lib/api/ga4/report'
import { dim, metricFloat, rowsOf } from '@/lib/api/ga4/rows'
import { parseDateString } from '@/lib/utils/date'
import type { ScoreRank, ScoredSegment, ScoringSummary } from './scoringTypes'

export function fmtLocalDate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function normalize(values: number[]): number[] {
    const max = Math.max(...values)
    const min = Math.min(...values)
    if (max === min) return values.map(() => 0.5)
    return values.map((v) => (v - min) / (max - min))
}

function classifyRank(score: number): ScoreRank {
    if (score >= 70) return 'active'
    if (score >= 30) return 'dormant'
    return 'churn'
}

const METRICS = ['activeUsers', 'sessions', 'screenPageViews', 'engagementRate']

/**
 * セグメント軸（デバイス・流入元・OS…）ごとに直近性 / 頻度 / 熱量 / 深度を正規化して 0〜100 点にする。
 * 直近性の分子は「期間終端からさかのぼった 7 日間」のユーザー数。
 * reporter の期間が全期間。国別軸では既定の country=Japan フィルタを外す（1 行になるため）。
 */
export async function runScoringReport(
    reporter: Ga4Reporter,
    segmentDimension: string,
): Promise<{ segments: ScoredSegment[]; summary: ScoringSummary }> {
    const { startDate, endDate } = reporter.ctx.dateRanges[0]
    void startDate

    const endBase = new Date(`${endDate}T00:00:00`)
    const recentStart = new Date(endBase)
    recentStart.setDate(endBase.getDate() - 7)
    const recentStartDate = parseDateString(fmtLocalDate(recentStart))

    const spec = {
        dimensions: [segmentDimension],
        metrics: METRICS,
        limit: 50,
        includeAllCountries: segmentDimension === 'country',
    }
    const [fullReport, recentReport] = await Promise.all([
        reporter.run(spec),
        reporter.withDateRanges([{ startDate: recentStartDate, endDate }]).run(spec),
    ])

    type RowData = { activeUsers: number; sessions: number; pageViews: number; engagementRate: number }
    const fullMap = new Map<string, RowData>()
    for (const row of rowsOf(fullReport)) {
        fullMap.set(dim(row) || '(not set)', {
            activeUsers: metricFloat(row, 0),
            sessions: metricFloat(row, 1),
            pageViews: metricFloat(row, 2),
            engagementRate: metricFloat(row, 3),
        })
    }
    const recentMap = new Map<string, number>()
    for (const row of rowsOf(recentReport)) {
        recentMap.set(dim(row) || '(not set)', metricFloat(row, 0))
    }

    // セグメント一覧（全期間に存在するもの）
    const segments = [...fullMap.entries()]
        .filter(([, d]) => d.activeUsers >= 1)
        .map(([name, d]) => {
            const recentUsers = recentMap.get(name) ?? 0
            return {
                name,
                activeUsers: Math.round(d.activeUsers),
                sessions: Math.round(d.sessions),
                pageViews: Math.round(d.pageViews),
                engagementRate: d.engagementRate,
                sessionsPerUser: d.sessions > 0 ? d.sessions / d.activeUsers : 0,
                pvPerSession: d.sessions > 0 ? d.pageViews / d.sessions : 0,
                recentUserRatio: d.activeUsers > 0 ? recentUsers / d.activeUsers : 0,
            }
        })

    if (segments.length === 0) {
        return { segments: [], summary: { active: 0, dormant: 0, churn: 0 } }
    }

    const recencyNorm = normalize(segments.map((s) => s.recentUserRatio))
    const frequencyNorm = normalize(segments.map((s) => s.sessionsPerUser))
    const engagementNorm = normalize(segments.map((s) => s.engagementRate))
    const depthNorm = normalize(segments.map((s) => s.pvPerSession))

    const scored: ScoredSegment[] = segments.map((s, i) => {
        const scores = {
            recency: Math.round(recencyNorm[i] * 25),
            frequency: Math.round(frequencyNorm[i] * 25),
            engagement: Math.round(engagementNorm[i] * 25),
            depth: Math.round(depthNorm[i] * 25),
        }
        const score = scores.recency + scores.frequency + scores.engagement + scores.depth
        return { ...s, score, rank: classifyRank(score), scores }
    })
    scored.sort((a, b) => b.score - a.score)

    return {
        segments: scored,
        summary: {
            active: scored.filter((s) => s.rank === 'active').length,
            dormant: scored.filter((s) => s.rank === 'dormant').length,
            churn: scored.filter((s) => s.rank === 'churn').length,
        },
    }
}
