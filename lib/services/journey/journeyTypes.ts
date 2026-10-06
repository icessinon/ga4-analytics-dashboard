/** ユーザー経路分析（/api/journey）の型 */

export interface JourneyNode {
    id: string
    /** 0 = チャネル, 1 = 直前ページ, 2 = ゴール */
    stage: number
    sessions: number
}

export interface JourneyFlow {
    from: string
    to: string
    sessions: number
}

export interface RankingRow {
    page?: string
    channel?: string
    views: number
    rate: number
}

/** チャネル → N-2 → N-1 → ゴール の 3 ステップ経路 */
export interface PathFlow {
    channel: string
    n2: string
    n1: string
    count: number
}

export interface DropoutPath {
    channel: string
    n2: string
    n1: string
    dropout: number
}

export interface PageSignal {
    avgEngagementSec: number
    scrollRate: number
    engagementRate: number
}

export interface FormStat {
    name: string
    goalUsers: number
    dropoutUsers: number
    arrivalRate: number
    dropoutRate: number
}

export interface JourneyReport {
    nodes: JourneyNode[]
    flows: JourneyFlow[]
    totalSessions: number
    totalUsers: number
    goalUsers: number
    formStats: FormStat[]
    totalGoalViews: number
    goalPath: string
    goalLabel: string
    referrerRanking: RankingRow[]
    channelRanking: RankingRow[]
    topPaths: PathFlow[]
    rawTopPaths: PathFlow[]
    dropoutPaths: DropoutPath[]
    rawDropoutPaths: DropoutPath[]
    pageExitRates: Record<string, number>
    pageSignals: Record<string, PageSignal>
    rawPageSignals: Record<string, PageSignal>
    _debug: {
        exitQ4Rows: number
        exitQ4Error: string
        q2RawCount: number
        q1RawCount: number
        rawN1MapSize: number
        q2CatCount: number
        q1CatCount: number
        crossRows: number
        internalBase: string
        sampleReferrer: string
    }
}

export type JourneyData = JourneyReport
