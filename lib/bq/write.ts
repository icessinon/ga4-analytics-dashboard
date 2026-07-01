import { prisma } from '@/lib/db/client'
import { bqInsertAll, ensureBQTable } from './client'
import {
  BQ_TABLES,
  type AbTestResultLogRow,
  type AiAnalysisLogRow,
  type BQTableId,
  type FunnelExecutionLogRow,
  type HeatmapEventLogRow,
  type MonthlyInsightLogRow,
  type ReportExecutionLogRow,
  type SyncRunLogRow,
} from './schemas'

// ============================================================
//  日付ヘルパー (JST基準)
// ============================================================

const JST_OFFSET_MS = 9 * 60 * 60 * 1000

export function toJstDate(d: Date = new Date()): Date {
  return new Date(d.getTime() + JST_OFFSET_MS)
}

export function jstReportMonth(d: Date = new Date()): string {
  const j = toJstDate(d)
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, '0')}`
}

export function jstReportDate(d: Date = new Date()): string {
  const j = toJstDate(d)
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, '0')}-${String(j.getUTCDate()).padStart(2, '0')}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

// ============================================================
//  BQ 書き込み共通処理
//  失敗時は console.error のみ。呼び出し元 (API) には投げない。
//  Postgres 側 bqSyncedAt を持つテーブルは insert 成功時に更新する。
// ============================================================

let tablesEnsured = false

async function ensureAllTablesOnce(): Promise<void> {
  if (tablesEnsured) return
  const ids = Object.keys(BQ_TABLES) as BQTableId[]
  await Promise.all(ids.map(id => ensureBQTable(id, BQ_TABLES[id])))
  tablesEnsured = true
}

async function insertWithoutTracking(
  tableId: BQTableId,
  rows: { insertId: string; json: object }[],
): Promise<void> {
  if (rows.length === 0) return
  try {
    await ensureAllTablesOnce()
    await bqInsertAll(tableId, rows)
  } catch (err) {
    console.error(`[bq] ${tableId} insert failed:`, err instanceof Error ? err.message : err)
  }
}

// ============================================================
//  各テーブルへの insert
//  bqSyncedAt を持つ 3 テーブル: BQ 成功時に Postgres の bqSyncedAt を更新
// ============================================================

export async function insertReportExecutionLog(row: ReportExecutionLogRow): Promise<void> {
  try {
    await ensureAllTablesOnce()
    await bqInsertAll('report_execution_log', [{
      insertId: `report_execution:${row.execution_id}`,
      json: row,
    }])
    await prisma.reportExecution.update({
      where: { id: row.execution_id },
      data: { bqSyncedAt: new Date() },
    })
  } catch (err) {
    console.error('[bq] report_execution_log insert failed:', err instanceof Error ? err.message : err)
  }
}

export async function insertAbTestResultLog(row: AbTestResultLogRow): Promise<void> {
  try {
    await ensureAllTablesOnce()
    await bqInsertAll('ab_test_result_log', [{
      insertId: `ab_test_result:${row.result_id}`,
      json: row,
    }])
    await prisma.abTestResult.update({
      where: { id: row.result_id },
      data: { bqSyncedAt: new Date() },
    })
  } catch (err) {
    console.error('[bq] ab_test_result_log insert failed:', err instanceof Error ? err.message : err)
  }
}

export async function insertFunnelExecutionLog(row: FunnelExecutionLogRow): Promise<void> {
  try {
    await ensureAllTablesOnce()
    await bqInsertAll('funnel_execution_log', [{
      insertId: `funnel_execution:${row.execution_id}`,
      json: row,
    }])
    await prisma.funnelExecution.update({
      where: { id: row.execution_id },
      data: { bqSyncedAt: new Date() },
    })
  } catch (err) {
    console.error('[bq] funnel_execution_log insert failed:', err instanceof Error ? err.message : err)
  }
}

export async function insertMonthlyInsightLog(row: MonthlyInsightLogRow): Promise<void> {
  await insertWithoutTracking('monthly_insight_log', [{
    insertId: `monthly_insight:${row.insight_id}`,
    json: row,
  }])
}

export async function insertAiAnalysisLog(row: AiAnalysisLogRow): Promise<void> {
  await insertWithoutTracking('ai_analysis_log', [{
    insertId: `ai_analysis:${row.id}`,
    json: row,
  }])
}

export async function insertHeatmapEventLogs(rows: HeatmapEventLogRow[]): Promise<void> {
  await insertWithoutTracking('heatmap_event_log', rows.map(r => ({
    insertId: `heatmap_event:${r.event_id}`,
    json: r,
  })))
}

export async function insertSyncRunLog(row: SyncRunLogRow): Promise<void> {
  await insertWithoutTracking('sync_run_log', [{
    insertId: row.run_id,
    json: row,
  }])
}
