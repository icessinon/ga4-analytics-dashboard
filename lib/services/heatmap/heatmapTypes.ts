/** ヒートマップ（view ラベル）系 API の型。クライアントは import type でここを参照する */

export interface ViewLabelRow {
    viewLabel: string
    count: number
}

export interface ViewLabelsByDevice {
    mobile: ViewLabelRow[]
    desktop: ViewLabelRow[]
    tablet: ViewLabelRow[]
}

/** POST /api/heatmap/view-labels */
export interface HeatmapViewLabelsResponse {
    success: true
    byDevice: ViewLabelsByDevice
    startDate: string
    endDate: string
}

/** POST /api/heatmap/page-paths */
export interface HeatmapPagePathsResponse {
    success: true
    pagePaths: string[]
}
