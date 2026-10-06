/** AB テスト実行（execute）の各段階で受け渡す型 */

import type { Prisma } from '@prisma/client'
import type { GA4ReportResponse } from '@/lib/api/ga4/client'
import type { CvrResult } from '@/lib/services/analytics/cvrService'
import type { AbTestEvaluation, AbTestVariant } from '@/lib/services/ab-test/abTestService'
import type { CvrDataKey } from '@/lib/services/ab-test/ga4ConfigTypes'

export const EXECUTION_PRODUCT_SELECT = { id: true, name: true, ga4PropertyId: true } as const

/** 実行対象の AbTest 行（product を含む） */
export type ExecutableAbTest = Prisma.AbTestGetPayload<{ include: { product: { select: typeof EXECUTION_PRODUCT_SELECT } } }>

export interface ExecutionRequest {
    /** 指定時はそのテストだけ（詳細画面の手動実行）。未指定なら期間終了済み・自動実行 ON のテスト全部 */
    abTestId?: number | string | null
    /** 同日再実行のスキップを無視する */
    force?: boolean
}

export interface ExecutionResultItem {
    abTestId: number
    abTestName: string
    status: 'completed' | 'failed'
    reportExecutionId?: number
    errorMessage?: string
}

export interface ExecutionSummary {
    executed: number
    results: ExecutionResultItem[]
    message?: string
}

/** GA4 集計〜勝敗判定までの結果（DB に書く前） */
export interface AbTestEvaluationOutcome {
    startDate: string
    endDate: string
    report: GA4ReportResponse
    cvrResults: Partial<Record<CvrDataKey, CvrResult>>
    /** CVR 降順 */
    variants: AbTestVariant[]
    abTestEvaluation: AbTestEvaluation | null
    winnerVariant: string | null
    improvementVsAPercent: number | null
}
