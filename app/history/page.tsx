'use client'

import { Suspense, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from '@/components/Link'
import PageShell from '@/components/PageShell'
import { ui, cx } from '@/components/ui'
import { useProduct } from '@/contexts/ProductContext'
import { useReport } from '@/hooks/useReport'
import { fetchJson } from '@/lib/utils/fetch'
import { HISTORY_KINDS, type HistoryKind, type HistoryRow } from '@/lib/services/history/historyTypes'
import styles from './HistoryPage.module.css'

interface HistoryResponse {
    rows?: HistoryRow[]
    total?: number
    totalPages?: number
}

const LIMIT = 20
const KIND_FILTERS: ReadonlyArray<{ id: HistoryKind | 'all'; label: string }> = [
    { id: 'all', label: 'すべて' },
    ...HISTORY_KINDS,
]
const KIND_LABEL: Record<HistoryKind, string> = {
    abtest: 'ABテスト',
    report: 'レポート',
    funnel: 'ファネル',
}
const EMPTY_ACTION: Record<HistoryKind | 'all', { href: string; label: string }> = {
    all: { href: '/ab-test', label: 'ABテストを見る' },
    abtest: { href: '/ab-test', label: 'ABテストを見る' },
    report: { href: '/analytics', label: 'レポートを生成する' },
    funnel: { href: '/funnel', label: 'ファネル分析を実行する' },
}

const formatDateTime = (s: string) =>
    new Date(s).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

const statusLabel = (status: string) =>
    status === 'completed' ? '完了' : status === 'failed' ? '失敗' : status === 'running' ? '実行中' : status

function HistoryPageContent() {
    const { currentProduct } = useProduct()
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()

    // 旧 /funnel/history・/reports/history からのリダイレクトは ?tab= で着地する種別を指定する
    const tabParam = searchParams?.get('tab')
    const initialKind: HistoryKind | 'all' =
        tabParam === 'funnel' ? 'funnel' : tabParam === 'ab-test' ? 'abtest' : tabParam === 'reports' ? 'report' : 'all'

    const [kind, setKind] = useState<HistoryKind | 'all'>(initialKind)
    const [keywordInput, setKeywordInput] = useState('')
    const [keyword, setKeyword] = useState('')
    const [page, setPage] = useState(1)
    const [deletingKey, setDeletingKey] = useState<string | null>(null)
    const [deleteError, setDeleteError] = useState<string | null>(null)

    // 入力のたびに取得しないよう、キーワードは 300ms 待ってから反映する
    useEffect(() => {
        const timer = setTimeout(() => setKeyword(keywordInput.trim()), 300)
        return () => clearTimeout(timer)
    }, [keywordInput])

    const productIdParam = searchParams?.get('productId')
    const productId = productIdParam ? parseInt(productIdParam, 10) : currentProduct?.id

    const url = `/api/history?${productId ? `productId=${productId}&` : ''}${kind !== 'all' ? `kind=${kind}&` : ''}${keyword ? `search=${encodeURIComponent(keyword)}&` : ''}page=${page}&limit=${LIMIT}`
    const report = useReport<HistoryResponse>(url, { keepPreviousData: true })
    const rows = report.data?.rows ?? []
    const total = report.data?.total ?? 0
    const totalPages = report.data?.totalPages ?? 1

    useEffect(() => { setPage(1) }, [kind, keyword, productId])

    function selectKind(next: HistoryKind | 'all') {
        setKind(next)
        const params = new URLSearchParams(searchParams?.toString())
        params.delete('tab')
        const q = params.toString()
        router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
    }

    async function handleDelete(row: HistoryRow) {
        if (!row.deletePath) return
        if (!confirm(`この実行履歴（${row.title}）を削除しますか？`)) return
        setDeletingKey(row.key)
        setDeleteError(null)
        try {
            await fetchJson(row.deletePath, { method: 'DELETE' })
            await report.run()
        } catch (err) {
            setDeleteError(err instanceof Error ? err.message : '削除に失敗しました')
        } finally {
            setDeletingKey(null)
        }
    }

    return (
        <PageShell
            pageId="history"
            width="wide"
            status={{ loading: report.loading, error: report.error ?? deleteError, source: 'db', onRetry: report.run }}
            keepChildrenWhileLoading
            controls={
                <div className={styles.controls}>
                    <div className={styles.tabScroll}>
                        <div className={ui.tabs} role="tablist">
                            {KIND_FILTERS.map((f) => (
                                <button
                                    key={f.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={kind === f.id}
                                    className={cx(ui.tab, kind === f.id && ui.tabActive)}
                                    onClick={() => selectKind(f.id)}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <input
                        type="search"
                        value={keywordInput}
                        onChange={(e) => setKeywordInput(e.target.value)}
                        placeholder="名前で検索"
                        className={cx(ui.input, styles.search)}
                        aria-label="名前で検索"
                    />
                </div>
            }
        >
            <div className={ui.card}>
                <p className={ui.note}>
                    {total > 0
                        ? `全 ${total} 件中 ${(page - 1) * LIMIT + 1} - ${Math.min(page * LIMIT, total)} 件`
                        : '該当する履歴はありません'}
                </p>

                {rows.length === 0 ? (
                    <div className={styles.empty}>
                        <p className={ui.note}>{keyword ? '検索結果が見つかりませんでした' : '履歴がありません'}</p>
                        {!keyword && (
                            <Link href={EMPTY_ACTION[kind].href} className={ui.btn}>
                                {EMPTY_ACTION[kind].label}
                            </Link>
                        )}
                    </div>
                ) : (
                    <div className={ui.tableWrap}>
                        <table className={cx(ui.dataTable, styles.table)}>
                            <thead>
                                <tr>
                                    <th>実行日時</th>
                                    <th>種別</th>
                                    <th>名前</th>
                                    <th>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr key={row.key}>
                                        <td className={styles.dateCell} data-label="実行日時">{formatDateTime(row.createdAt)}</td>
                                        <td data-label="種別">
                                            <span className={cx(styles.kindBadge, styles[row.kind])}>{KIND_LABEL[row.kind]}</span>
                                        </td>
                                        <td className={styles.nameCell} data-label="名前">
                                            <span className={styles.name}>{row.title}</span>
                                            {row.status !== 'completed' && (
                                                <span className={cx(styles.statusBadge, row.status === 'failed' && styles.statusFailed)}>
                                                    {statusLabel(row.status)}
                                                </span>
                                            )}
                                            {row.note && <span className={styles.note}>{row.note}</span>}
                                            {row.errorMessage && <span className={styles.note}>{row.errorMessage}</span>}
                                        </td>
                                        <td className={styles.actionCell}>
                                            <div className={styles.actions}>
                                                {row.detailHref && <Link href={row.detailHref} className={styles.link}>結果</Link>}
                                                {row.abTestHref && <Link href={row.abTestHref} className={styles.link}>施策</Link>}
                                                {row.deletePath && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(row)}
                                                        disabled={deletingKey === row.key}
                                                        className={cx(styles.link, styles.delete)}
                                                    >
                                                        {deletingKey === row.key ? '削除中…' : '削除'}
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {totalPages > 1 && (
                    <div className={styles.pagination}>
                        <button type="button" className={ui.btnGhost} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                            前へ
                        </button>
                        <span className={ui.note}>{page} / {totalPages} ページ</span>
                        <button type="button" className={ui.btnGhost} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                            次へ
                        </button>
                    </div>
                )}
            </div>
        </PageShell>
    )
}

export default function HistoryPage() {
    return (
        <Suspense fallback={<PageShell pageId="history" width="wide" status={{ loading: true, source: 'db' }}>{null}</PageShell>}>
            <HistoryPageContent />
        </Suspense>
    )
}
