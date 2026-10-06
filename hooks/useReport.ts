'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { parseJsonResponse } from '@/lib/utils/fetch'

export interface UseReportOptions<TBody> {
    /** 指定時は POST。未指定なら GET */
    body?: TBody
    method?: 'GET' | 'POST'
    /** false の間は取得しない（currentProduct / range が null のガード）。既定 true */
    enabled?: boolean
    /** true なら自動取得せず run() を呼んだときだけ取得する（分析実行ボタン型のページ） */
    manual?: boolean
    /** 再取得中・エラー時に直前の data を保持する。既定 false */
    keepPreviousData?: boolean
}

export interface UseReportResult<T> {
    data: T | null
    loading: boolean
    error: string | null
    /** 手動実行・再試行 */
    run: () => Promise<void>
    reset: () => void
}

/**
 * fetch → parseJsonResponse → loading / error を 1 本にまとめたフック。
 * 全ページが fetch を直書きし、parseJsonResponse を使うページと res.json() 直呼びのページが
 * 混在していたのを吸収する。
 *
 * - 依存キーは url + body の JSON。期間を連打したときの古いレスポンスは AbortController で捨てる
 *   （これまでどのページも未対策で、遅く返った古い結果が新しい結果を上書きしうる状態だった）
 * - エラーは `json.error || json.message` を優先し、無ければ HTTP ステータスで文言を作る
 */
export function useReport<T, TBody = unknown>(url: string, options: UseReportOptions<TBody> = {}): UseReportResult<T> {
    const { body, method = body === undefined ? 'GET' : 'POST', enabled = true, manual = false, keepPreviousData = false } = options
    const [data, setData] = useState<T | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const abortRef = useRef<AbortController | null>(null)
    const bodyKey = body === undefined ? '' : JSON.stringify(body)

    const run = useCallback(async () => {
        abortRef.current?.abort()
        const controller = new AbortController()
        abortRef.current = controller
        setLoading(true)
        setError(null)
        if (!keepPreviousData) setData(null)
        try {
            const res = await fetch(url, {
                method,
                headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
                body: method === 'POST' ? bodyKey : undefined,
                signal: controller.signal,
            })
            const json = await parseJsonResponse<T & { error?: string; message?: string }>(res)
            if (!res.ok || json.error) {
                throw new Error(json.error || json.message || `取得に失敗しました（HTTP ${res.status}）`)
            }
            if (!controller.signal.aborted) setData(json)
        } catch (e) {
            if (controller.signal.aborted) return
            setError(e instanceof Error ? e.message : '取得に失敗しました')
            if (!keepPreviousData) setData(null)
        } finally {
            if (!controller.signal.aborted) setLoading(false)
        }
    }, [url, method, bodyKey, keepPreviousData])

    useEffect(() => {
        if (manual || !enabled) return
        run()
        return () => abortRef.current?.abort()
    }, [run, manual, enabled])

    const reset = useCallback(() => {
        abortRef.current?.abort()
        setData(null)
        setError(null)
        setLoading(false)
    }, [])

    return { data, loading, error, run, reset }
}
