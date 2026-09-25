import { google } from 'googleapis'
import { getServiceAccountCredentials } from '@/lib/serviceAccount'

/**
 * GA4 BigQuery Export（xmile-drm.analytics_534098180.events_*）への読み取りクライアント。
 * 認証は統合SA（ga4-analytics-dashboard@xmile-drm.iam）。[[lib/serviceAccount.ts]] 参照。
 *
 * 2026-09-24にエクスポート先を x-work-ga から xmile-drm へ移行した（旧プロジェクトが
 * 課金リンク未設定でテーブルが60日で自動削除されるため）。8/6〜9/23分は旧プロジェクトから
 * コピー済みで、同一データセット内に連続して存在する。
 */

export const GA4_EXPORT_PROJECT = 'xmile-drm'
export const GA4_EXPORT_DATASET = 'analytics_534098180'
/** BQエクスポート開始日。これより前のイベントはBQに存在しない（GA4 APIのみ） */
export const GA4_EXPORT_START = '20260807'

// 事故ガード: 誤って全期間・全カラムをスキャンするクエリを弾く（現状1日≈50MB）
const MAX_SCAN_BYTES = 5 * 1024 ** 3


/**
 * dry runでスキャン量を確認してからクエリを実行し、行をオブジェクト配列で返す。
 */
export async function runGa4EventsQuery(
    query: string,
): Promise<{ rows: Record<string, string | null>[]; scannedBytes: number }> {
    const auth = new google.auth.GoogleAuth({
        credentials: getServiceAccountCredentials(['GA4_SERVICE_ACCOUNT_KEY']),
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
