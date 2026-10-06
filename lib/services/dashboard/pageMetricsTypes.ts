/** トップ（ダッシュボード）の「ページ別指標」系 API の型。クライアントは import type でここを参照する */

export type Granularity = 'daily' | 'weekly' | 'monthly'

/** ページ単位の CV 定義（PageCvConfig テーブル）。無ければ GA4 の conversions をそのまま使う */
export type CvDimension = 'eventName' | 'customEvent:click_label' | 'customEvent:view_label'

export interface PageMetrics {
    pv: number
    cv: number
    cvr: number
    sessions: number
    newUsers: number
    newUserRate: number
    bounceRate: number
    bounceCount: number
    exitRate: number | null
    exitRateNote?: string
    averageSessionDurationSeconds: number
    averageSessionDurationLabel: string
    engagementRate: number
    cvEventName?: string
    cvDimension?: string
}

/** POST /api/dashboard/page-metrics */
export interface PageMetricsResponse extends PageMetrics {
    success: true
    pagePath: string
    startDate: string
    endDate: string
}

/** ページ指標の時系列1点（API series の要素）。グラフ用に t を付与したものが SeriesDataPoint */
export interface SeriesDataPoint {
    period: string
    label: string
    t: number
    pv: number
    cv: number
    sessions: number
    cvr?: number
    newUsers?: number
    newUserRate?: number
    bounceRate?: number
    bounceCount?: number
    averageSessionDuration?: number
    engagementRate?: number
    exitRate?: number
}

/** API から返る series 1件（t なし） */
export type PageMetricsSeriesPoint = Omit<SeriesDataPoint, 't'>

/** POST /api/dashboard/page-metrics/series */
export interface PageMetricsSeriesResponse {
    success: true
    series: PageMetricsSeriesPoint[]
    granularity: Granularity
}

/** 推移グラフで選択可能なメトリクス */
export type ChartMetric =
    | 'pv'
    | 'cv'
    | 'cvr'
    | 'sessions'
    | 'exitRate'
    | 'newUserRate'
    | 'bounceRate'
    | 'bounceCount'
    | 'averageSessionDuration'
    | 'engagementRate'
