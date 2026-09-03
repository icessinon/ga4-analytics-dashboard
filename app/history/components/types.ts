import type { FunnelExecution } from '@/app/funnel/types'

export interface Pagination {
    total: number
    page: number
    limit: number
    totalPages: number
}

export interface FunnelExecutionListItem extends Omit<FunnelExecution, 'funnelConfig' | 'filterConfig' | 'resultData' | 'geminiEvaluation' | 'errorMessage'> {
    hasResultData: boolean
}

export interface FunnelHistoryTabProps {
    productId?: number
}

export interface ReportExecution {
    id: number
    reportId: number
    reportName: string
    productName: string
    /** ABテストレポートの場合、どの施策(ABテスト)かを示す。通常レポートは null */
    abTestId: number | null
    abTestName: string | null
    status: string
    startedAt: string | null
    completedAt: string | null
    createdAt: string
    hasResultData: boolean
    errorMessage: string | null
}

export interface ReportHistoryTabProps {
    productId?: number
}

export interface AbTestExecution {
    id: number
    abTestId: number
    abTestName: string
    productName: string
    reportExecutionId: number | null
    status: string
    startedAt: string | null
    completedAt: string | null
    createdAt: string
    hasResultData: boolean
    errorMessage: string | null
}

export interface AbTestHistoryTabProps {
    productId?: number
}
