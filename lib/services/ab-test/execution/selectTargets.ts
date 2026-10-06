/**
 * AB テスト実行の対象選定。
 * - abTestId 指定: そのテスト（running かつ ga4Config あり）。手動実行なので autoExecute は見ない
 * - 未指定: running・autoExecute・ga4Config あり・endDate が今以前のもの全部（日次バッチ）
 * ※ サーバー専用
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/client'
import { EXECUTION_PRODUCT_SELECT, type ExecutableAbTest, type ExecutionRequest } from './types'

export async function selectExecutionTargets(req: ExecutionRequest, now: Date = new Date()): Promise<ExecutableAbTest[]> {
    const where: Prisma.AbTestWhereInput = req.abTestId
        ? { id: parseInt(String(req.abTestId), 10), status: 'running', ga4Config: { not: Prisma.JsonNull } }
        : { status: 'running', autoExecute: true, ga4Config: { not: Prisma.JsonNull }, endDate: { lte: now } }
    return prisma.abTest.findMany({ where, include: { product: { select: EXECUTION_PRODUCT_SELECT } } })
}

/**
 * 同じ日に既に実行済みならスキップする（force で無視）。
 * scheduled / recurring のテストは予定どおり何度でも回すので対象外
 */
export function shouldSkipSameDay(abTest: ExecutableAbTest, force: boolean | undefined): boolean {
    if (force || !abTest.lastExecutedAt) return false
    const executionType = (abTest.scheduleConfig as { executionType?: string } | null)?.executionType
    if (executionType === 'scheduled' || executionType === 'recurring') return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return new Date(abTest.lastExecutedAt) >= today
}
