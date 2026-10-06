'use client'

import { useState } from 'react'
import Link from '@/components/Link'
import PageShell from '@/components/PageShell'
import FilterBar, { FilterField } from '@/components/FilterBar'
import { ui, cx } from '@/components/ui'
import { useProduct } from '@/lib/contexts/ProductContext'
import { useReport } from '@/hooks/useReport'
import type { CompletedAbTest, FilterMode } from './types'
import styles from './CompletedPage.module.css'

interface CompletedResponse {
    abTests?: CompletedAbTest[]
    total?: number
    totalPages?: number
}

const LIMIT = 20
const FILTERS: ReadonlyArray<{ id: FilterMode; label: string }> = [
    { id: 'all', label: 'すべて' },
    { id: 'win', label: '勝利（B/C/Dが勝ち）' },
    { id: 'lose', label: '負け（Aが勝ち）' },
]

const isWin = (t: CompletedAbTest) => !!t.winnerVariant && ['B', 'C', 'D'].includes(t.winnerVariant)
const formatDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' }) : '—')

export default function AbTestCompletedPage() {
    const { currentProduct, products, setCurrentProduct } = useProduct()
    const [filter, setFilter] = useState<FilterMode>('all')
    const [page, setPage] = useState(1)

    const base = currentProduct ? `/api/ab-test?productId=${currentProduct.id}&status=completed` : '/api/ab-test?status=completed'
    const report = useReport<CompletedResponse>(`${base}&page=${page}&limit=${LIMIT}`, { keepPreviousData: true })
    const tests = report.data?.abTests ?? []
    const total = report.data?.total ?? 0
    const totalPages = report.data?.totalPages ?? 1

    const filtered = tests.filter((t) => (filter === 'all' ? true : filter === 'win' ? isWin(t) : t.winnerVariant === 'A'))
    const colCount = 7 + (filter !== 'lose' ? 1 : 0) + (filter !== 'win' ? 1 : 0)

    return (
        <PageShell
            pageId="abTestCompleted"
            width="wide"
            status={{ loading: report.loading, error: report.error, source: 'db', onRetry: report.run }}
            keepChildrenWhileLoading
            controls={
                <FilterBar>
                    {products.length > 1 && (
                        <FilterField label="プロダクト">
                            <select
                                className={ui.select}
                                value={currentProduct ? String(currentProduct.id) : ''}
                                onChange={(e) => { const p = products.find((x) => x.id === parseInt(e.target.value, 10)); if (p) { setCurrentProduct(p); setPage(1) } }}
                                aria-label="プロダクト"
                            >
                                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </FilterField>
                    )}
                    <FilterField label="表示">
                        <div className={ui.tabs} role="tablist">
                            {FILTERS.map((f) => (
                                <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className={cx(ui.tab, filter === f.id && ui.tabActive)} onClick={() => setFilter(f.id)}>
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </FilterField>
                </FilterBar>
            }
        >
            {report.data && (
                <div className={ui.card}>
                    <div className={ui.tableWrap}>
                        <table className={ui.dataTable}>
                            <thead>
                                <tr>
                                    <th>テスト名</th>
                                    <th>プロダクト</th>
                                    <th>結果</th>
                                    <th>勝利バリアント</th>
                                    <th className={ui.num}>改善率（A比）</th>
                                    {filter !== 'lose' && <th>勝利要因</th>}
                                    {filter !== 'win' && <th>負け要因</th>}
                                    <th>期間</th>
                                    <th>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 ? (
                                    <tr><td colSpan={colCount} className={ui.empty}>完了したABテストがありません</td></tr>
                                ) : filtered.map((t) => (
                                    <tr key={t.id}>
                                        <td>
                                            <span className={styles.name}>{t.name}</span>
                                            {t.description && <span className={styles.desc}>{t.description}</span>}
                                            {t.hypothesis && <span className={styles.desc}>仮説: {t.hypothesis}</span>}
                                        </td>
                                        <td>{t.product.name}</td>
                                        <td><span className={isWin(t) ? styles.badgeWin : styles.badgeLose}>{isWin(t) ? '勝利' : '負け'}</span></td>
                                        <td>{t.winnerVariant ?? '—'}</td>
                                        <td className={ui.num}>
                                            {t.improvementVsAPercent != null ? `+${Number(t.improvementVsAPercent).toFixed(1)}%` : '—'}
                                            {t.expectedImprovement != null && <span className={styles.desc}>期待: {Number(t.expectedImprovement).toFixed(1)}%</span>}
                                        </td>
                                        {filter !== 'lose' && <td className={styles.clip} title={t.victoryFactors ?? ''}>{t.victoryFactors ?? '—'}</td>}
                                        {filter !== 'win' && <td className={styles.clip} title={t.defeatFactors ?? ''}>{t.defeatFactors ?? '—'}</td>}
                                        <td className={styles.nowrap}>{formatDate(t.startDate)} ～ {t.endDate ? formatDate(t.endDate) : '—'}</td>
                                        <td><Link href={`/ab-test/${t.id}`} className={ui.btnGhost}>詳細</Link></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {totalPages > 1 && (
                        <div className={styles.pagination}>
                            <button type="button" className={ui.btnGhost} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>前へ</button>
                            <span className={ui.note}>{page} / {totalPages} ページ（全 {total} 件）</span>
                            <button type="button" className={ui.btnGhost} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>次へ</button>
                        </div>
                    )}
                </div>
            )}
        </PageShell>
    )
}
