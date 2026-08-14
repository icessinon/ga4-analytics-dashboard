import { google } from 'googleapis'
import fs from 'fs'
import path from 'path'

/**
 * GA4 BigQuery Export（x-work-ga.analytics_534098180.events_*）への読み取りクライアント。
 * GA4のSA（x-work-ga@x-work-ga.iam）を流用する。2026-08-14にBigQueryロールが
 * 付与され jobs.query が可能になった（それ以前はjobs.create権限なし）。
 */

export const GA4_EXPORT_PROJECT = 'x-work-ga'
export const GA4_EXPORT_DATASET = 'analytics_534098180'
/** BQエクスポート開始日。これより前のイベントはBQに存在しない（GA4 APIのみ） */
export const GA4_EXPORT_START = '20260807'

// 事故ガード: 誤って全期間・全カラムをスキャンするクエリを弾く（現状1日≈50MB）
const MAX_SCAN_BYTES = 5 * 1024 ** 3

function getCredentials(): { client_email: string; private_key: string } {
    const inline = process.env.GA4_SERVICE_ACCOUNT_KEY
    if (inline && inline.trim() !== '') return JSON.parse(inline)
    const keyPath = process.env.GA4_SERVICE_ACCOUNT_KEY_PATH
    if (keyPath && keyPath.trim() !== '') {
        const resolved = path.isAbsolute(keyPath) ? keyPath : path.resolve(process.cwd(), keyPath)
        return JSON.parse(fs.readFileSync(resolved, 'utf8'))
    }
    throw new Error('GA4_SERVICE_ACCOUNT_KEY または GA4_SERVICE_ACCOUNT_KEY_PATH が未設定のため BigQuery に接続できません')
}

/**
 * dry runでスキャン量を確認してからクエリを実行し、行をオブジェクト配列で返す。
 */
export async function runGa4EventsQuery(
    query: string,
): Promise<{ rows: Record<string, string | null>[]; scannedBytes: number }> {
    const auth = new google.auth.GoogleAuth({
        credentials: getCredentials(),
        scopes: ['https://www.googleapis.com/auth/bigquery'],
    })
    const client = await auth.getClient()
    const bq = google.bigquery({ version: 'v2', auth: client as never })

    const dry = await bq.jobs.query({
        projectId: GA4_EXPORT_PROJECT,
        requestBody: { query, useLegacySql: false, dryRun: true },
    })
    const scannedBytes = Number(dry.data.totalBytesProcessed ?? 0)
    if (scannedBytes > MAX_SCAN_BYTES) {
        throw new Error(`クエリのスキャン量が大きすぎます（${(scannedBytes / 1024 ** 3).toFixed(1)}GB）。期間を短くしてください`)
    }

    const res = await bq.jobs.query({
        projectId: GA4_EXPORT_PROJECT,
        requestBody: { query, useLegacySql: false, timeoutMs: 60000 },
    })
    if (!res.data.jobComplete) throw new Error('BigQueryクエリがタイムアウトしました')
    const fields = res.data.schema?.fields ?? []
    const rows = (res.data.rows ?? []).map((row) => {
        const obj: Record<string, string | null> = {}
        row.f?.forEach((cell, i) => {
            obj[fields[i]?.name ?? `col${i}`] = cell.v != null ? String(cell.v) : null
        })
        return obj
    })
    return { rows, scannedBytes }
}
