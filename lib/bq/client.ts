import { google } from 'googleapis'

export const WRITE_PROJECT_ID = 'hrs-div'
export const WRITE_DATASET    = 'ga4_analytics_dashboard'
export const LOCATION         = 'asia-northeast1'

export type BQFieldType = 'STRING' | 'INT64' | 'FLOAT64' | 'TIMESTAMP' | 'DATE' | 'BOOL'
export type BQFieldMode = 'NULLABLE' | 'REQUIRED' | 'REPEATED'
export interface BQField { name: string; type: BQFieldType; mode?: BQFieldMode }

function getWriteAuth() {
  const key = process.env.BQ_WRITE_SERVICE_ACCOUNT_KEY
  if (!key) throw new Error('BQ_WRITE_SERVICE_ACCOUNT_KEY is not set')
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(key),
    scopes: ['https://www.googleapis.com/auth/bigquery'],
  })
}

export async function ensureBQTable(tableId: string, fields: BQField[]): Promise<'created' | 'exists'> {
  const client = await getWriteAuth().getClient()
  const bq = google.bigquery({ version: 'v2', auth: client as never })
  try {
    await bq.tables.get({ projectId: WRITE_PROJECT_ID, datasetId: WRITE_DATASET, tableId })
    return 'exists'
  } catch {
    try {
      await bq.tables.insert({
        projectId: WRITE_PROJECT_ID,
        datasetId: WRITE_DATASET,
        requestBody: {
          tableReference: { projectId: WRITE_PROJECT_ID, datasetId: WRITE_DATASET, tableId },
          schema: { fields: fields.map(f => ({ name: f.name, type: f.type, mode: f.mode ?? 'NULLABLE' })) },
        },
      })
      return 'created'
    } catch (err) {
      // 並行呼び出しで同じテーブルを作成しようとした場合の 409 は成功扱い
      if (err instanceof Error && err.message.includes('Already Exists')) return 'exists'
      throw err
    }
  }
}

/**
 * BQ テーブルの行をオブジェクト配列で読み出す。
 * write 用 SA は bigquery.jobs.create を持たないため、SQL ではなく
 * tabledata.list（dataEditor に含まれる tables.getData）で全行を取得する。
 * 対象テーブルは小規模（ABテスト履歴等）である前提。
 */
export async function bqListTableRows(
  tableId: string,
  maxRows = 1000,
): Promise<Record<string, string | null>[]> {
  const client = await getWriteAuth().getClient()
  const bq = google.bigquery({ version: 'v2', auth: client as never })
  const table = await bq.tables.get({ projectId: WRITE_PROJECT_ID, datasetId: WRITE_DATASET, tableId })
  const fields = table.data.schema?.fields ?? []
  const rows: Record<string, string | null>[] = []
  let pageToken: string | undefined
  while (rows.length < maxRows) {
    const res = await bq.tabledata.list({
      projectId: WRITE_PROJECT_ID,
      datasetId: WRITE_DATASET,
      tableId,
      maxResults: Math.min(500, maxRows - rows.length),
      ...(pageToken && { pageToken }),
    })
    for (const row of res.data.rows ?? []) {
      const obj: Record<string, string | null> = {}
      row.f?.forEach((cell, i) => {
        obj[fields[i]?.name ?? `col${i}`] = cell.v != null ? String(cell.v) : null
      })
      rows.push(obj)
    }
    pageToken = res.data.pageToken ?? undefined
    if (!pageToken) break
  }
  return rows
}

export async function bqInsertAll(
  tableId: string,
  rows: { insertId: string; json: object }[],
): Promise<void> {
  if (rows.length === 0) return
  const client = await getWriteAuth().getClient()
  const bq = google.bigquery({ version: 'v2', auth: client as never })
  const BATCH = 500
  for (let i = 0; i < rows.length; i += BATCH) {
    const res = await bq.tabledata.insertAll({
      projectId: WRITE_PROJECT_ID,
      datasetId: WRITE_DATASET,
      tableId,
      requestBody: { rows: rows.slice(i, i + BATCH) },
    })
    const errs = res.data.insertErrors
    if (errs && errs.length > 0) {
      throw new Error(`BQ insertAll(${tableId}) failed: ${JSON.stringify(errs[0])}`)
    }
  }
}
