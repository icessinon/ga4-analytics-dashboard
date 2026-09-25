import fs from 'fs'
import path from 'path'

/**
 * Google API 全般で使う単一のサービスアカウント認証情報を解決する。
 *
 * 2026-09-25に用途別3本のSAを `ga4-analytics-dashboard@xmile-drm.iam` 1本へ統合した。
 * このSAは以下すべての権限を持つ:
 *   - BigQuery         : xmile-drm（ジョブユーザー＋データ編集者）
 *   - GA4 Data API     : property 534098180（閲覧者）
 *   - Search Console   : sc-domain:x-work.jp（制限付き）
 *
 * 解決順は 統一変数 → 旧統一変数 → 呼び出し側が指定する用途別の旧変数。
 * 旧変数は移行期の保険で、全環境で GCP_SERVICE_ACCOUNT_KEY* に移行したら削除してよい。
 */

export interface ServiceAccountCredentials {
    client_email: string
    private_key: string
    [key: string]: unknown
}

/**
 * 1行JSONで渡された鍵をパースする。
 *
 * private_key 内の改行は JSON のエスケープ `\n` で表現されるのが正しい形なので、
 * まずはそのままパースする。無条件に `\n` を実改行へ置換すると、正しい値まで
 * 「Bad control character in string literal」で壊れる。
 * 正規化は素直なパースが失敗したときの救済としてのみ行う。
 */
function parseKeyJson(raw: string): ServiceAccountCredentials {
    let s = raw.trim()
    if (s.startsWith("'") && s.endsWith("'")) s = s.slice(1, -1)

    try {
        return JSON.parse(s)
    } catch {
        // 救済1: private_key の改行が実改行のまま入っている（JSONとしては不正）
        try {
            return JSON.parse(s.replace(/\n/g, '\\n'))
        } catch {
            // 救済2: エスケープが二重になっている
            return JSON.parse(s.replace(/\\n/g, '\n'))
        }
    }
}

function readKeyFile(keyPath: string): ServiceAccountCredentials {
    const resolved = path.isAbsolute(keyPath) ? keyPath : path.resolve(process.cwd(), keyPath)
    const body = fs.readFileSync(resolved, 'utf8')
    if (!body.trim()) throw new Error(`サービスアカウントキーが空です: ${resolved}`)
    return JSON.parse(body)
}

/** `<NAME>` と `<NAME>_PATH` の組で1件試す */
function fromEnvPair(name: string): ServiceAccountCredentials | null {
    const inline = process.env[name]
    if (inline && inline.trim() !== '') return parseKeyJson(inline)
    const keyPath = process.env[`${name}_PATH`]
    if (keyPath && keyPath.trim() !== '') return readKeyFile(keyPath)
    return null
}

/** 統一変数 → 旧統一変数 → 用途別の旧変数 の順に解決する */
export function getServiceAccountCredentials(legacyEnvNames: string[] = []): ServiceAccountCredentials {
    const candidates = ['GCP_SERVICE_ACCOUNT_KEY', 'BQ_SERVICE_ACCOUNT_KEY', ...legacyEnvNames]
    for (const name of candidates) {
        try {
            const creds = fromEnvPair(name)
            if (creds) return creds
        } catch (err) {
            // 壊れた値で後続の候補まで諦めない
            console.error(`[serviceAccount] ${name} の読み込みに失敗:`, err instanceof Error ? err.message : err)
        }
    }
    throw new Error(
        `サービスアカウント認証情報が未設定です。GCP_SERVICE_ACCOUNT_KEY（JSONを1行で）または ` +
        `GCP_SERVICE_ACCOUNT_KEY_PATH（キーファイルのパス）を設定してください。` +
        `（試行: ${candidates.join(', ')}）`,
    )
}
