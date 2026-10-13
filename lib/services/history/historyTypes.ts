/** 履歴一覧（レポート実行・ABテスト実行・ファネル実行）の行と検索条件 */

export type HistoryKind = 'abtest' | 'report' | 'funnel'

export const HISTORY_KINDS: ReadonlyArray<{ id: HistoryKind; label: string }> = [
    { id: 'abtest', label: 'ABテスト' },
    { id: 'report', label: 'レポート' },
    { id: 'funnel', label: 'ファネル' },
]

export interface HistoryRow {
    /** kind と id の組。同じ id が種別違いで並ぶので React の key にはこれを使う */
    key: string
    kind: HistoryKind
    title: string
    /** タイトルの下に出す補足（ファネルの集計期間、ABテスト実行の元レポート名など） */
    note: string | null
    status: string
    createdAt: string
    /** 結果ページ。結果データが無い実行は null */
    detailHref: string | null
    /** ABテスト実行から施策ページへ戻る導線 */
    abTestHref: string | null
    /** DELETE を投げる先。消せない実行は null */
    deletePath: string | null
    errorMessage: string | null
}

export interface HistoryQuery {
    productId?: number
    kind?: HistoryKind
    search?: string
    page: number
    limit: number
}

export interface HistoryListResult {
    rows: HistoryRow[]
    total: number
    page: number
    limit: number
    totalPages: number
}
