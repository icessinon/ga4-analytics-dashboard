/**
 * 実行履歴の BQ 蓄積 ＋ Postgres 側 bqSyncedAt の更新。
 * lib/bq/write.ts は BQ に書くだけ（DB を触らない層）にし、「BQ に入ったら同期済みの印を付ける」
 * という Postgres との往復をここに置く。失敗は console.error のみで呼び出し元には投げない。
 * ※ サーバー専用
 */

import { prisma } from '@/lib/db/client'
import { insertAbTestResultLogRow, insertFunnelExecutionLogRow, insertReportExecutionLogRow } from '@/lib/bq/write'
import type { AbTestResultLogRow, FunnelExecutionLogRow, ReportExecutionLogRow } from '@/lib/bq/schemas'

export { jstReportDate, jstReportMonth, nowIso, toJstDate } from '@/lib/bq/write'

async function markSynced(label: string, update: () => Promise<unknown>): Promise<void> {
    try {
        await update()
    } catch (err) {
        console.error(`[bq] ${label} bqSyncedAt update failed:`, err instanceof Error ? err.message : err)
    }
}

export async function insertReportExecutionLog(row: ReportExecutionLogRow): Promise<void> {
    if (!(await insertReportExecutionLogRow(row))) return
    await markSynced('report_execution_log', () =>
        prisma.reportExecution.update({ where: { id: row.execution_id }, data: { bqSyncedAt: new Date() } }))
}

export async function insertAbTestResultLog(row: AbTestResultLogRow): Promise<void> {
    if (!(await insertAbTestResultLogRow(row))) return
    await markSynced('ab_test_result_log', () =>
        prisma.abTestResult.update({ where: { id: row.result_id }, data: { bqSyncedAt: new Date() } }))
}

export async function insertFunnelExecutionLog(row: FunnelExecutionLogRow): Promise<void> {
    if (!(await insertFunnelExecutionLogRow(row))) return
    await markSynced('funnel_execution_log', () =>
        prisma.funnelExecution.update({ where: { id: row.execution_id }, data: { bqSyncedAt: new Date() } }))
}
