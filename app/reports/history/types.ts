/** ページネーション情報 */
export interface Pagination {
    total: number
    page: number
    limit: number
    totalPages: number
}

export interface ReportExecution {
    id: number
    reportId: number
    reportName: string
    productName: string
    // ABテストレポートの場合、どの施策(ABテスト)かを示す
    abTestId: number | null
    abTestName: string | null
    status: string
    startedAt: string | null
    completedAt: string | null
    createdAt: string
    hasResultData: boolean
    errorMessage: string | null
}
