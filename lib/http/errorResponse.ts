import { NextResponse } from 'next/server'

/**
 * route が返す HTTP ステータス付きのエラー。readGa4Body の 400 など、
 * try の中で投げて catch 1 箇所で JSON にする。
 */
export class HttpError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message)
        this.name = 'HttpError'
    }
}

export interface ErrorResponseOptions {
    /**
     * `{ error: fallback, message: <Error.message> }` の形で返す。
     * route によって `{ error: message }` と `{ error: 固定文言, message }` の 2 系統があり、
     * ページ側は `data.message || data.error` で読んでいる。形の統一はユーザー可視の変更なので
     * 本リファクタでは行わず、各 route が従来使っていた形を指定する。
     */
    withMessage?: boolean
}

/**
 * catch 節の定型。
 *
 * - HttpError ならそのステータスで `{ error: message }`
 * - それ以外は 500。既定は `{ error: <Error.message か fallback> }`、
 *   withMessage なら `{ error: fallback, message: <Error.message か 'Unknown error'> }`
 *
 * `label` は console.error の接頭辞（'Occupation API Error' など、これまで各 route が
 * 書いていたもの）。
 */
export function errorResponse(error: unknown, fallback: string, label?: string, opts: ErrorResponseOptions = {}): NextResponse {
    if (error instanceof HttpError) {
        return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error(`${label ?? 'API Error'}:`, error)
    if (opts.withMessage) {
        return NextResponse.json(
            { error: fallback, message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 },
        )
    }
    const message = error instanceof Error && error.message ? error.message : fallback
    return NextResponse.json({ error: message }, { status: 500 })
}
