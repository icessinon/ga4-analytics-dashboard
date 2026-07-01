/**
 * BQ 接続テスト:
 *   1. 全テーブルを ensure（存在しなければ作成）
 *   2. sync_run_log に1行 test insert
 *
 * 読み戻しは MCP など別経路で BQ 側を確認してください。
 * このプロジェクトは write only の設計。
 *
 * 使い方 (Docker 内):
 *   docker exec ga4-dashboard-app-local npx tsx scripts/bq-connect-test.ts
 */

import { ensureBQTable } from '@/lib/bq/client'
import { BQ_TABLES, type BQTableId } from '@/lib/bq/schemas'
import { insertSyncRunLog } from '@/lib/bq/write'

async function main() {
  console.log('== ensure all tables ==')
  for (const id of Object.keys(BQ_TABLES) as BQTableId[]) {
    const res = await ensureBQTable(id, BQ_TABLES[id])
    console.log(`  ${id}: ${res}`)
  }

  console.log('== insert test row into sync_run_log ==')
  const runId = `test-${Date.now()}`
  const startedAt = new Date()
  await insertSyncRunLog({
    run_id:      runId,
    target:      'connect_test',
    started_at:  startedAt.toISOString(),
    ended_at:    new Date().toISOString(),
    duration_ms: 0,
    status:      'success',
    rows_synced: 0,
    message:     'BQ 接続テスト',
    trigger:     'manual',
  })
  console.log(`  inserted: run_id=${runId}`)
  console.log('== done — BQ 側で hrs-div.ga4_analytics_dashboard.sync_run_log を確認してください ==')
}

main().catch(err => {
  console.error('FAIL:', err)
  process.exit(1)
})
