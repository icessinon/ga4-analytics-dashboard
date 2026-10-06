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

/**
 * catch 節の定型。レスポンスの形は従来どおり `{ error: string }`。
 *
 * - HttpError ならそのステータス
 * - それ以外は 500 で、Error の message（無ければ fallback）
 *
 * `label` は console.error の接頭辞（'Occupation API Error' など、これまで各 route が
 * 書いていたもの）。
 */
export function errorResponse(error: unknown, fallback: string, label?: string): NextResponse {
    if (error instanceof HttpError) {
        return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error(`${label ?? 'API Error'}:`, error)
    const message = error instanceof Error && error.message ? error.message : fallback
    return NextResponse.json({ error: message }, { status: 500 })
}
