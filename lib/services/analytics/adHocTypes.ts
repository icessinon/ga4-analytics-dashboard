/** GA4 分析 / データ閲覧の自由指定クエリ（/api/analytics/data）の型。クライアントは import type でここを参照する */

/** 画面が送るフィルタ。expression はカンマ区切りで複数値（OR） */
export interface AdHocFilter {
    dimension: string
    operator: string
    expression: string
}

/** テーブル 1 行: ヘッダ名 → 値（次元は '' 、指標は '0' が既定） */
export type AdHocRow = Record<string, string>

export interface AdHocTable {
    dimensionHeaders: Array<{ name: string }>
    metricHeaders: Array<{ name: string; type?: string }>
    rows: AdHocRow[]
    rowCount: number
}

/** POST /api/analytics/data */
export interface AdHocQueryResponse {
    success: true
    data: AdHocTable
}
