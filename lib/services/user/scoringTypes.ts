/** 活動スコアリング（/api/user/scoring）のレスポンス型 */

export type ScoreRank = 'active' | 'dormant' | 'churn'

export interface ScoreBreakdown {
    recency: number
    frequency: number
    engagement: number
    depth: number
}

export interface ScoredSegment {
    name: string
    /** 0〜100。4 指標（各 25 点）の合計 */
    score: number
    rank: ScoreRank
    activeUsers: number
    sessions: number
    pageViews: number
    sessionsPerUser: number
    pvPerSession: number
    engagementRate: number
    /** 全期間ユーザーのうち直近 7 日に来訪した割合 */
    recentUserRatio: number
    scores: ScoreBreakdown
}

export interface ScoringSummary {
    active: number
    dormant: number
    churn: number
}

export interface ScoringResponse {
    success: true
    segments: ScoredSegment[]
    summary: ScoringSummary
    periodDays?: number
    segmentDimension?: string
}
