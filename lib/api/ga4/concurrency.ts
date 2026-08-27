/**
 * GA4 Data API の同時リクエスト制御 + 429リトライ
 *
 * GA4 Data API はプロパティあたりの「同時リクエスト数」に上限（既定10）がある。
 * ダッシュボードは1エンドポイントで10本超のレポートを Promise.all で並列発火する箇所が
 * 複数あり（例: insights=12本、cv-types=11本）、上限を超えると
 * 「Exhausted concurrent requests quota」エラーになる。
 *
 * 全GA4呼び出しは lib/api/ga4/client.ts の fetch を通るので、その1経路を
 * プロパティ単位のセマフォで直列度を絞り、429/503は指数バックオフでリトライする。
 * これでルート側の Promise.all はそのままでも実際のHTTP同時数が上限内に収まる。
 */

/** プロパティあたりの最大同時リクエスト数（GA4上限10に対し安全マージンを取る） */
const MAX_CONCURRENCY = Number(process.env.GA4_MAX_CONCURRENCY) || 8
/** 429/503時の最大リトライ回数 */
const MAX_RETRIES = Number(process.env.GA4_MAX_RETRIES) || 4
/** バックオフの基準ミリ秒（指数 + ジッター） */
const BASE_DELAY_MS = 500

/** FIFOセマフォ。acquire() は解放関数を返し、release は最大1回だけ有効。 */
class Semaphore {
    private active = 0
    private readonly waiters: Array<() => void> = []

    constructor(private readonly max: number) {}

    acquire(): Promise<() => void> {
        return new Promise((resolve) => {
            const grant = () => {
                this.active++
                let released = false
                resolve(() => {
                    if (released) return
                    released = true
                    this.active--
                    const next = this.waiters.shift()
                    if (next) next()
                })
            }
            if (this.active < this.max) grant()
            else this.waiters.push(grant)
        })
    }
}

/** プロパティIDごとにセマフォを保持（プロセス内シングルトン） */
const limiters = new Map<string, Semaphore>()

function getLimiter(propertyId: string): Semaphore {
    let s = limiters.get(propertyId)
    if (!s) {
        s = new Semaphore(MAX_CONCURRENCY)
        limiters.set(propertyId, s)
    }
    return s
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * GA4 Data API への POST を「プロパティ単位の同時実行制御 + 429/503リトライ」付きで実行する。
 * レスポンスの解釈（!response.ok の扱いやJSONパース）は呼び出し側に委ねるため Response を返す。
 * リトライを使い切った場合は最後の（エラー）レスポンスをそのまま返し、呼び出し側の
 * エラーメッセージ生成に任せる。
 */
export async function ga4Fetch(
    propertyId: string,
    url: string,
    body: unknown,
    accessToken: string,
): Promise<Response> {
    const release = await getLimiter(propertyId).acquire()
    try {
        let attempt = 0
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            })

            // 429 (RESOURCE_EXHAUSTED) / 503 (UNAVAILABLE) は一時的なので指数バックオフでリトライ
            if ((response.status === 429 || response.status === 503) && attempt < MAX_RETRIES) {
                // リトライするレスポンスのボディは読まないので破棄しておく
                await response.body?.cancel().catch(() => {})
                const delay = BASE_DELAY_MS * 2 ** attempt + Math.floor(Math.random() * 250)
                await sleep(delay)
                attempt++
                continue
            }

            return response
        }
    } finally {
        release()
    }
}
