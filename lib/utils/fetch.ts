/**
 * レスポンスを安全にJSONとしてパースする。
 * サーバーがHTML（エラーページ等）を返した場合に分かりやすいエラーを投げる。
 */
export async function parseJsonResponse<T = unknown>(response: Response): Promise<T> {
    const text = await response.text()
    const trimmed = text.trim()
    if (!trimmed || (trimmed.startsWith('<') && trimmed.includes('<!DOCTYPE'))) {
        const url = response.url || '（URL不明）'
        throw new Error(
            `サーバーがJSON以外を返しました（HTTP ${response.status}）。URL: ${url}`
        )
    }
    try {
        return JSON.parse(text) as T
    } catch {
        throw new Error('サーバーのレスポンスの解析に失敗しました。')
    }
}

/**
 * JSON API を叩いて結果を返す。失敗時はサーバーの error / message を Error にして投げる。
 * 更新系（PUT / DELETE / フォーム送信）など useReport に乗らない呼び出し用。
 */
export async function fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        ...init,
        headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers ?? {}) },
    })
    const json = await parseJsonResponse<T & { error?: string; message?: string }>(res)
    if (!res.ok || (json && typeof json === 'object' && 'error' in json && json.error)) {
        throw new Error(json.error || json.message || `リクエストに失敗しました（HTTP ${res.status}）`)
    }
    return json
}
