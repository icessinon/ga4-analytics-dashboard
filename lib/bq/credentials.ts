import fs from 'fs'
import path from 'path'

/**
 * BigQuery アクセス用の認証情報を解決する。
 *
 * BQ は全て xmile-drm に集約されたため、読み書きとも専用SA
 * `ga4-analytics-dashboard@xmile-drm.iam` 1本で賄う（BQ_SERVICE_ACCOUNT_KEY / _PATH）。
 *
 * 外部APIのSAとは意図的に分けている。混ぜると壊れるので注意:
 *   - GA4_SERVICE_ACCOUNT_KEY*        : GA4 Data API（GA4プロパティ側にユーザー登録が必要）
 *   - BQ_WRITE_SERVICE_ACCOUNT_KEY    : Search Console API（sc-domain:x-work.jp に登録済み）
 *
 * 新SAの鍵が未配備の環境（移行途中の本番など）では、旧SAへフォールバックして
 * 動作を継続する。旧SAも xmile-drm の読み取り権限を持つため参照系は無停止で移れる。
 */

export interface BQCredentials { client_email: string; private_key: string }

function readKeyFile(keyPath: string): BQCredentials {
    const resolved = path.isAbsolute(keyPath) ? keyPath : path.resolve(process.cwd(), keyPath)
    return JSON.parse(fs.readFileSync(resolved, 'utf8'))
}

function fromEnv(inlineVar: string, pathVar: string): BQCredentials | null {
    const inline = process.env[inlineVar]
    if (inline && inline.trim() !== '') return JSON.parse(inline)
    const keyPath = process.env[pathVar]
    if (keyPath && keyPath.trim() !== '') return readKeyFile(keyPath)
    return null
}

/** 参照系（GA4エクスポートの読み取り）。新SA → GA4 SA の順に解決する。 */
export function getBQReadCredentials(): BQCredentials {
    const creds =
        fromEnv('BQ_SERVICE_ACCOUNT_KEY', 'BQ_SERVICE_ACCOUNT_KEY_PATH') ??
        fromEnv('GA4_SERVICE_ACCOUNT_KEY', 'GA4_SERVICE_ACCOUNT_KEY_PATH')
    if (!creds) {
        throw new Error(
            'BQ_SERVICE_ACCOUNT_KEY / BQ_SERVICE_ACCOUNT_KEY_PATH（または従来の GA4_SERVICE_ACCOUNT_KEY*）が未設定のため BigQuery に接続できません',
        )
    }
    return creds
}

/**
 * 更新系（ga4_analytics_dashboard への書き込み）。新SA → 旧write SA の順に解決する。
 * 旧write SA は xmile-drm に書き込み権限を持たないため、フォールバックは
 * 「鍵が配備されるまで起動自体は通す」ための暫定措置でしかない点に注意。
 */
export function getBQWriteCredentials(): BQCredentials {
    const creds =
        fromEnv('BQ_SERVICE_ACCOUNT_KEY', 'BQ_SERVICE_ACCOUNT_KEY_PATH') ??
        fromEnv('BQ_WRITE_SERVICE_ACCOUNT_KEY', 'BQ_WRITE_SERVICE_ACCOUNT_KEY_PATH')
    if (!creds) {
        throw new Error(
            'BQ_SERVICE_ACCOUNT_KEY / BQ_SERVICE_ACCOUNT_KEY_PATH（または従来の BQ_WRITE_SERVICE_ACCOUNT_KEY）が未設定のため BigQuery に接続できません',
        )
    }
    return creds
}
