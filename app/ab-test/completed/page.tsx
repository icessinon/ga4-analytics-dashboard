'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/Link'
import BackLink from '@/components/BackLink'
import CustomSelect from '@/components/CustomSelect'
import Loader from '@/components/Loader'
import { useProduct } from '@/lib/contexts/ProductContext'
import { parseJsonResponse } from '@/lib/utils/fetch'
import type { CompletedAbTest, FilterMode } from './types'
import styles from './CompletedPage.module.css'

export default function AbTestCompletedPage() {
    const { currentProduct, products, setCurrentProduct } = useProduct()
    const [tests, setTests] = useState<CompletedAbTest[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [filter, setFilter] = useState<FilterMode>('all')
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const [totalPages, setTotalPages] = useState(0)
    const limit = 20

    useEffect(() => {
        fetchCompleted()
    }, [currentProduct, page])

    async function fetchCompleted() {
        try {
            setLoading(true)
            const base = currentProduct
                ? `/api/ab-test?productId=${currentProduct.id}&status=completed`
                : '/api/ab-test?status=completed'
            const url = `${base}&page=${page}&limit=${limit}`
            const response = await fetch(url)
            const data = await parseJsonResponse<{ error?: string; message?: string; abTests?: CompletedAbTest[]; total?: number; totalPages?: number }>(response)

            if (data.error) {
                throw new Error(data.message || data.error)
            }

            setTests(data.abTests || [])
            setTotal(data.total ?? 0)
            setTotalPages(data.totalPages ?? 1)
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'エラーが発生しました'
            setError(errorMessage)
        } finally {
            setLoading(false)
        }
    }

    const filtered = tests.filter((t) => {
        if (filter === 'all') return true
        const isWin = t.winnerVariant && ['B', 'C', 'D'].includes(t.winnerVariant)
        if (filter === 'win') return isWin
        if (filter === 'lose') return t.winnerVariant === 'A'
        return false
    })

    function formatDate(dateString: string | null) {
        if (!dateString) return '—'
        return new Date(dateString).toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        })
    }

    function isWin(t: CompletedAbTest) {
        return t.winnerVariant && ['B', 'C', 'D'].includes(t.winnerVariant)
    }

    if (loading && tests.length === 0) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h1 className={styles.title}>ABテスト完了一覧</h1>
                    <BackLink href="/ab-test">ABテスト一覧に戻る</BackLink>
                </div>
                <div className={styles.loaderWrap}>
                    <Loader />
                </div>
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>ABテスト完了一覧</h1>
                <BackLink href="/ab-test">ABテスト一覧に戻る</BackLink>
            </div>

            {products.length > 1 && (
                <div className={styles.productRow}>
                    <label className={styles.productLabel}>プロダクト</label>
                    <CustomSelect
                        value={currentProduct ? String(currentProduct.id) : ''}
                        onChange={(v) => {
                            const product = products.find((p) => p.id === parseInt(v, 10))
                            if (product) setCurrentProduct(product)
                        }}
                        options={products.map((p) => ({ value: String(p.id), label: p.name }))}
                        triggerClassName={styles.productSelect}
                        aria-label="プロダクト"
                    />
                </div>
            )}

            {error && (
                <div className={styles.errorBox}>
                    <p>{error}</p>
                </div>
            )}

            <div className={styles.filterRow}>
                <span className={styles.filterLabel}>表示:</span>
                <div className={styles.filterTabs}>
                    <button
                        type="button"
                        className={`${styles.filterTab} ${filter === 'all' ? styles.filterTabActive : ''}`}
                        onClick={() => setFilter('all')}
                    >
                        すべて
                    </button>
                    <button
                        type="button"
                        className={`${styles.filterTab} ${filter === 'win' ? styles.filterTabActive : ''}`}
                        onClick={() => setFilter('win')}
                    >
                        勝利（B/C/Dが勝ち）
                    </button>
                    <button
                        type="button"
                        className={`${styles.filterTab} ${filter === 'lose' ? styles.filterTabActive : ''}`}
                        onClick={() => setFilter('lose')}
                    >
                        負け（Aが勝ち）
                    </button>
                </div>
            </div>

            <div className={styles.tableWrap}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.th}>テスト名</th>
                            <th className={styles.th}>プロダクト</th>
                            <th className={styles.th}>結果</th>
                            <th className={styles.th}>勝利バリアント</th>
                            <th className={styles.th}>改善率（A比）</th>
                            {filter !== 'lose' && <th className={styles.th}>勝利要因</th>}
                            {filter !== 'win' && <th className={styles.th}>負け要因</th>}
                            <th className={styles.th}>期間</th>
                            <th className={styles.th}>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={filter === 'win' || filter === 'lose' ? 8 : 9} className={styles.emptyCell}>
                                    完了したABテストがありません
                                </td>
                            </tr>
                        ) : (
                            filtered.map((t) => (
                                <tr key={t.id} className={styles.tr}>
                                    <td className={styles.td}>
                                        <span className={styles.name}>{t.name}</span>
                                        {t.description && (
                                            <span className={styles.desc}>{t.description}</span>
                                        )}
                                        {t.hypothesis && (
                                            <span className={styles.desc}>仮説: {t.hypothesis}</span>
                                        )}
                                    </td>
                                    <td className={styles.td}>{t.product.name}</td>
                                    <td className={styles.td}>
                                        <span className={isWin(t) ? styles.badgeWin : styles.badgeLose}>
                                            {isWin(t) ? '勝利' : '負け'}
                                        </span>
                                    </td>
                                    <td className={styles.td}>{t.winnerVariant ?? '—'}</td>
                                    <td className={styles.td}>
                                        {t.improvementVsAPercent != null
                                            ? `+${Number(t.improvementVsAPercent).toFixed(1)}%`
                                            : '—'}
                                        {t.expectedImprovement != null && (
                                            <span className={styles.desc}>期待: {Number(t.expectedImprovement).toFixed(1)}%</span>
                                        )}
                                    </td>
                                    {filter !== 'lose' && (
                                        <td className={styles.tdClip}>{t.victoryFactors ?? '—'}</td>
                                    )}
                                    {filter !== 'win' && (
                                        <td className={styles.tdClip}>{t.defeatFactors ?? '—'}</td>
                                    )}
                                    <td className={styles.td}>
                                        {formatDate(t.startDate)} ～ {t.endDate ? formatDate(t.endDate) : '—'}
                                    </td>
                                    <td className={styles.td}>
                                        <Link href={`/ab-test/${t.id}`} className={styles.link}>
                                            詳細
                                        </Link>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {totalPages > 1 && (
                <div className={styles.pagination}>
                    <button
                        type="button"
                        className={styles.pageBtn}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                    >
                        前へ
                    </button>
                    <span className={styles.pageInfo}>
                        {page} / {totalPages} ページ（全 {total} 件）
                    </span>
                    <button
                        type="button"
                        className={styles.pageBtn}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                    >
                        次へ
                    </button>
                </div>
            )}
        </div>
    )
}
