/**
 * BQ 補完同期バッチ
 *
 * fire-and-forget での BQ insert が失敗して Postgres の bqSyncedAt が null のままの
 * レコードを対象に再送する。日次で scheduler コンテナから起動。
 *
 * 実行:
 *   npx tsx workers/bq-sync-missing.ts [--days 3] [--trigger cron|manual]
 */

import { prisma } from '@/lib/db/client'
import {
  insertAbTestResultLog,
  insertFunnelExecutionLog,
  insertReportExecutionLog,
  insertSyncRunLog,
  jstReportDate,
  jstReportMonth,
  nowIso,
} from '@/lib/bq/write'

interface SyncArgs { days: number; trigger: 'cron' | 'manual' }

function parseArgs(): SyncArgs {
  const args = process.argv.slice(2)
  let days = 3
  let trigger: 'cron' | 'manual' = 'cron'
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days' && args[i + 1]) { days = parseInt(args[i + 1], 10) || 3; i++ }
    if (args[i] === '--trigger' && args[i + 1]) { trigger = args[i + 1] === 'manual' ? 'manual' : 'cron'; i++ }
  }
  return { days, trigger }
}

async function syncReportExecutions(days: number): Promise<number> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const missing = await prisma.reportExecution.findMany({
    where: { bqSyncedAt: null, createdAt: { gte: since } },
    include: { report: true },
  })

  for (const r of missing) {
    await insertReportExecutionLog({
      execution_id:   r.id,
      report_id:      r.reportId,
      product_id:     r.report?.productId ?? null,
      report_type:    r.report?.reportType ?? null,
      report_name:    r.report?.name ?? null,
      status:         r.status,
      config:         r.report?.config ? JSON.stringify(r.report.config) : null,
      result_summary: r.resultData ? JSON.stringify(r.resultData) : null,
      started_at:     r.startedAt?.toISOString() ?? null,
      completed_at:   r.completedAt?.toISOString() ?? null,
      error_message:  r.errorMessage,
      report_month:   jstReportMonth(r.completedAt ?? r.createdAt),
      report_date:    jstReportDate(r.completedAt ?? r.createdAt),
      synced_at:      nowIso(),
    })
  }
  return missing.length
}

async function syncAbTestResults(days: number): Promise<number> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const missing = await prisma.abTestResult.findMany({
    where: { bqSyncedAt: null, createdAt: { gte: since } },
    include: { abTest: true },
  })

  for (const r of missing) {
    await insertAbTestResultLog({
      result_id:                r.id,
      ab_test_id:               r.abTestId,
      product_id:               r.abTest?.productId ?? null,
      ab_test_name:             r.abTest?.name ?? null,
      variant:                  r.variant,
      variant_a_name:           r.abTest?.variantAName ?? null,
      variant_b_name:           r.abTest?.variantBName ?? null,
      page_views:               r.pageViews,
      conversions:              r.conversions,
      conversion_rate:          r.conversionRate != null ? Number(r.conversionRate) : null,
      statistical_significance: r.statisticalSignificance != null ? Number(r.statisticalSignificance) : null,
      z_score:                  r.zScore != null ? Number(r.zScore) : null,
      period_days:              r.periodDays,
      ai_evaluation:            r.aiEvaluation,
      recommendation:           r.recommendation,
      winner_variant:           r.abTest?.winnerVariant ?? null,
      improvement_vs_a_pct:     r.abTest?.improvementVsAPercent != null ? Number(r.abTest.improvementVsAPercent) : null,
      ab_test_status:           r.abTest?.status ?? null,
      start_date:               r.abTest?.startDate.toISOString().split('T')[0] ?? null,
      end_date:                 r.abTest?.endDate ? r.abTest.endDate.toISOString().split('T')[0] : null,
      report_month:             jstReportMonth(r.createdAt),
      report_date:              jstReportDate(r.createdAt),
      synced_at:                nowIso(),
    })
  }
  return missing.length
}

async function syncFunnelExecutions(days: number): Promise<number> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const missing = await prisma.funnelExecution.findMany({
    where: { bqSyncedAt: null, createdAt: { gte: since } },
  })

  for (const r of missing) {
    await insertFunnelExecutionLog({
      execution_id:      r.id,
      product_id:        r.productId,
      execution_name:    r.name,
      funnel_config:     JSON.stringify(r.funnelConfig),
      filter_config:     r.filterConfig ? JSON.stringify(r.filterConfig) : null,
      start_date:        r.startDate.toISOString().split('T')[0],
      end_date:          r.endDate.toISOString().split('T')[0],
      result_data:       JSON.stringify(r.resultData),
      gemini_evaluation: r.geminiEvaluation,
      status:            r.status,
      error_message:     r.errorMessage,
      report_month:      jstReportMonth(r.createdAt),
      report_date:       jstReportDate(r.createdAt),
      synced_at:         nowIso(),
    })
  }
  return missing.length
}

async function runTarget(
  target: string,
  trigger: 'cron' | 'manual',
  fn: () => Promise<number>,
): Promise<void> {
  const startedAt = new Date()
  const runId = `${startedAt.toISOString()}-${target}`
  try {
    const rowsSynced = await fn()
    const endedAt = new Date()
    await insertSyncRunLog({
      run_id:      runId,
      target,
      started_at:  startedAt.toISOString(),
      ended_at:    endedAt.toISOString(),
      duration_ms: endedAt.getTime() - startedAt.getTime(),
      status:      'success',
      rows_synced: rowsSynced,
      message:     null,
      trigger,
    })
    console.log(`[bq-sync-missing] ${target}: synced ${rowsSynced} rows`)
  } catch (err) {
    const endedAt = new Date()
    const msg = err instanceof Error ? err.message : String(err)
    await insertSyncRunLog({
      run_id:      runId,
      target,
      started_at:  startedAt.toISOString(),
      ended_at:    endedAt.toISOString(),
      duration_ms: endedAt.getTime() - startedAt.getTime(),
      status:      'error',
      rows_synced: 0,
      message:     msg,
      trigger,
    })
    console.error(`[bq-sync-missing] ${target} failed:`, msg)
  }
}

export async function runBqSync(days = 3, trigger: 'cron' | 'manual' = 'cron'): Promise<void> {
  console.log(`[bq-sync-missing] start days=${days} trigger=${trigger}`)
  await runTarget('report_execution', trigger, () => syncReportExecutions(days))
  await runTarget('ab_test_result',   trigger, () => syncAbTestResults(days))
  await runTarget('funnel_execution', trigger, () => syncFunnelExecutions(days))
  console.log('[bq-sync-missing] done')
}

const isDirectRun = process.argv[1]?.endsWith('bq-sync-missing.ts') ||
                    process.argv[1]?.endsWith('bq-sync-missing.js')
if (isDirectRun) {
  const { days, trigger } = parseArgs()
  runBqSync(days, trigger)
    .then(() => prisma.$disconnect())
    .catch(err => {
      console.error('[bq-sync-missing] fatal:', err)
      process.exit(1)
    })
}
