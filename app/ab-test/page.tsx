'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from '@/components/Link'
import CustomSelect from '@/components/CustomSelect'
import PageShell from '@/components/PageShell'
import Alert from '@/components/Alert'
import { ui } from '@/components/ui'
import { useReport } from '@/hooks/useReport'
import AbTestCalendar from '@/components/ab-test/AbTestCalendar'
import AbTestFormModal from '@/components/ab-test/AbTestFormModal'
import { useProduct } from '@/lib/contexts/ProductContext'
import { fetchJson } from '@/lib/utils/fetch'
import type { AbTest } from './types'
import { resolveIssueLink } from '@/lib/utils/issueUrl'
import styles from './AbTestPage.module.css'

function AbTestPageContent() {
    const { currentProduct, products, setCurrentProduct } = useProduct()
    const searchParams = useSearchParams()
    const router = useRouter()
    const [error, setError] = useState<string | null>(null)
    const [editingTest, setEditingTest] = useState<AbTest | null>(null)
    const [showModal, setShowModal] = useState(false)
    const [selectedDate, setSelectedDate] = useState<Date | null>(null)
    const [selectedTests, setSelectedTests] = useState<AbTest[]>([])
    const [listPage, setListPage] = useState(1)
    const LIST_PAGE_SIZE = 5

    const listUrl = `/api/ab-test?${currentProduct ? `productId=${currentProduct.id}&` : ''}page=${listPage}&limit=${LIST_PAGE_SIZE}`
    const list = useReport<{ abTests?: AbTest[]; total?: number; totalPages?: number }>(listUrl)
    const abTests = list.data?.abTests ?? []
    const listTotal = list.data?.total ?? 0
    const listTotalPages = list.data?.totalPages ?? 1

    // プロダクトを切り替えたら 1 ページ目に戻す
    useEffect(() => { setListPage(1) }, [currentProduct?.id])

    useEffect(() => {
        const editId = searchParams?.get('edit')
        if (editId && abTests.length > 0) {
            const testId = parseInt(editId, 10)
            const test = abTests.find(t => t.id === testId)
            if (test) {
                setEditingTest(test)
                setShowModal(true)
            }
        }
    }, [searchParams, abTests])

    async function handleSubmit(data: any) {
        try {
            if (editingTest) {
                await fetchJson('/api/ab-test', { method: 'PUT', body: JSON.stringify({ id: editingTest.id, ...data }) })
            } else {
                await fetchJson('/api/ab-test', { method: 'POST', body: JSON.stringify(data) })
            }
            setEditingTest(null)
            setShowModal(false)
            clearEditParam()
            await list.run()
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'エラーが発生しました'
            console.error('AB Test submit error:', err)
            setError(errorMessage)
            setEditingTest(null)
            setShowModal(false)
            clearEditParam()
        }
    }

    function handleEdit(test: AbTest) {
        setEditingTest(test)
        setShowModal(true)
    }

    function clearEditParam() {
        if (searchParams?.get('edit')) {
            const next = new URLSearchParams(searchParams)
            next.delete('edit')
            const q = next.toString()
            router.replace(q ? `/ab-test?${q}` : '/ab-test')
        }
    }

    function handleCloseModal() {
        setEditingTest(null)
        setShowModal(false)
        clearEditParam()
    }

    async function handleDelete(id: number) {
        if (!confirm('このABテストを削除しますか？')) return
        try {
            await fetchJson(`/api/ab-test?id=${id}`, { method: 'DELETE' })
            await list.run()
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'エラーが発生しました'
            setError(errorMessage)
        }
    }

    function handleDateClick(date: Date, tests: AbTest[]) {
        setSelectedDate(date)
        setSelectedTests(tests)
    }

    function handleNewTest() {
        setEditingTest(null)
        setShowModal(true)
    }

    return (
        <PageShell
            pageId="abTest"
            status={{ loading: list.loading, error: list.error, source: 'db', onRetry: list.run }}
            actions={
                <>
                    <Link
                        href={currentProduct ? `/ab-test/completed?productId=${currentProduct.id}` : '/ab-test/completed'}
                        className={ui.btn}
                    >
                        完了一覧
                    </Link>
                    <button type="button" onClick={handleNewTest} className={ui.btnPrimary}>
                        + 新しいテストを追加
                    </button>
                </>
            }
        >
            {error && (
                <Alert tone="error" action={<button type="button" className={ui.btn} onClick={() => setError(null)}>閉じる</button>}>
                    {error}
                </Alert>
            )}

            {products.length > 1 && (
                <div className={styles.productSelector}>
                    <label className={styles.productLabel}>プロダクト</label>
                    <div className={styles.productSelectWrapper}>
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
                </div>
            )}

            <div className={styles.calendarContainer}>
                <AbTestCalendar abTests={abTests} onDateClick={handleDateClick} />
            </div>

            {selectedDate && selectedTests.length > 0 && (
                <div className={ui.card}>
                    <h2 className={ui.sectionTitle}>
                        {selectedDate.toLocaleDateString('ja-JP', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                        })} のABテスト
                    </h2>
                    <div className={styles.testList}>
                        {selectedTests.map((test) => (
                            <div
                                key={test.id}
                                className={styles.testItem}
                            >
                                <div className={styles.testItemContent}>
                                    <div className={styles.testInfo}>
                                        <h3 className={styles.testName}>{test.name}</h3>
                                        {test.description && (
                                            <p className={styles.testDescription}>
                                                {test.description}
                                            </p>
                                        )}
                                        <div className={styles.testDetails}>
                                            <p>
                                                バリアント: {(() => {
                                                    const variants = ['A', 'B']
                                                    if (test.ga4Config?.cvrC?.denominatorDimension) variants.push('C')
                                                    if (test.ga4Config?.cvrD?.denominatorDimension) variants.push('D')
                                                    return variants.join(' / ')
                                                })()}
                                            </p>
                                            <p>
                                                期間:{' '}
                                                {new Date(test.startDate).toLocaleDateString('ja-JP')} -{' '}
                                                {test.endDate
                                                    ? new Date(test.endDate).toLocaleDateString('ja-JP')
                                                    : '継続中'}
                                            </p>
                                            <p>ステータス: {
                                                test.status === 'running' ? '実行中' :
                                                test.status === 'paused' ? '一時停止' :
                                                test.status === 'completed' ? '完了' :
                                                test.status
                                            }</p>
                                        </div>
                                    </div>
                                    <div className={styles.testActions}>
                                        <button
                                            onClick={() => handleEdit(test)}
                                            className={`${styles.testButton} ${styles.testButtonEdit}`}
                                        >
                                            編集
                                        </button>
                                        <button
                                            onClick={() => handleDelete(test.id)}
                                            className={`${styles.testButton} ${styles.testButtonDelete}`}
                                        >
                                            削除
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <AbTestFormModal
                isOpen={showModal}
                onClose={handleCloseModal}
                onSubmit={handleSubmit}
                editingTest={editingTest}
                products={products}
                currentProductId={currentProduct?.id}
            />

            <div className={styles.tableContainer}>
                <div className={styles.tableHeader}>
                    <h2 className={ui.sectionTitle} style={{ marginBottom: 0 }}>ABテスト一覧</h2>
                </div>
                <div className={ui.tableWrap}>
                    <table className={ui.dataTable}>
                        <thead className={styles.tableHead}>
                            <tr>
                                <th className={styles.tableHeaderCell}>テスト名</th>
                                <th className={styles.tableHeaderCell}>プロダクト</th>
                                <th className={styles.tableHeaderCell}>バリアント</th>
                                <th className={styles.tableHeaderCell}>期間</th>
                                <th className={styles.tableHeaderCell}>ステータス</th>
                                <th className={styles.tableHeaderCell}>操作</th>
                            </tr>
                        </thead>
                        <tbody className={styles.tableBody}>
                            {abTests.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className={`${styles.tableCell} ${styles.tableCellCenter}`}>
                                        ABテストがありません
                                    </td>
                                </tr>
                            ) : (
                                abTests.map((test) => (
                                    <tr key={test.id} className={styles.tableRow}>
                                        <td className={styles.tableCell}>
                                            <div className={styles.tableCellName}>{test.name}</div>
                                            {(() => {
                                                const issue = resolveIssueLink(test.issueUrl)
                                                return issue && (
                                                    <a href={issue.href} target="_blank" rel="noopener noreferrer" className={styles.issueLink} onClick={(e) => e.stopPropagation()}>
                                                        🔗 {issue.text}
                                                    </a>
                                                )
                                            })()}
                                            {test.description && (
                                                <div className={styles.tableCellDescription}>
                                                    {test.description}
                                                </div>
                                            )}
                                        </td>
                                        <td className={styles.tableCell}>
                                            {test.product.name}
                                        </td>
                                        <td className={styles.tableCell}>
                                            {(() => {
                                                const variants = ['A', 'B']
                                                if (test.ga4Config?.cvrC?.denominatorDimension) variants.push('C')
                                                if (test.ga4Config?.cvrD?.denominatorDimension) variants.push('D')
                                                return variants.join(' / ')
                                            })()}
                                        </td>
                                        <td className={styles.tableCell}>
                                            {new Date(test.startDate).toLocaleDateString('ja-JP')} -{' '}
                                            {test.endDate
                                                ? new Date(test.endDate).toLocaleDateString('ja-JP')
                                                : '継続中'}
                                        </td>
                                        <td className={styles.tableCell}>
                                            <div className={styles.statusContainer}>
                                                <span
                                                    className={`${styles.statusBadge} ${
                                                        test.status === 'running'
                                                            ? styles.statusBadgeRunning
                                                            : test.status === 'completed'
                                                            ? styles.statusBadgeCompleted
                                                            : styles.statusBadgeDefault
                                                    }`}
                                                >
                                                    {test.status === 'running'
                                                        ? '実行中'
                                                        : test.status === 'paused'
                                                        ? '一時停止'
                                                        : test.status === 'completed'
                                                        ? '完了'
                                                        : test.status}
                                                </span>
                                                {test._count && test._count.reportExecutions > 0 && (
                                                    <span className={styles.statusCount}>
                                                        実行履歴: {test._count.reportExecutions}件
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className={styles.actionCell}>
                                            <div className={styles.actionContainer}>
                                                <Link
                                                    href={`/ab-test/${test.id}`}
                                                    className={styles.actionLink}
                                                >
                                                    詳細
                                                </Link>
                                                <button
                                                    onClick={() => handleEdit(test)}
                                                    className={styles.actionButton}
                                                >
                                                    編集
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(test.id)}
                                                    className={`${styles.actionButton} ${styles.actionButtonDelete}`}
                                                >
                                                    削除
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                {listTotalPages > 1 && (
                    <div className={styles.pagination}>
                        <button
                            type="button"
                            className={styles.paginationButton}
                            onClick={() => setListPage((p) => p - 1)}
                            disabled={listPage <= 1}
                            aria-label="前のページ"
                        >
                            前へ
                        </button>
                        <span className={styles.paginationInfo}>
                            {listPage} / {listTotalPages} ページ（全 {listTotal} 件）
                        </span>
                        <button
                            type="button"
                            className={styles.paginationButton}
                            onClick={() => setListPage((p) => p + 1)}
                            disabled={listPage >= listTotalPages}
                            aria-label="次のページ"
                        >
                            次へ
                        </button>
                    </div>
                )}
            </div>
        </PageShell>
    )
}

export default function AbTestPage() {
    return (
        <Suspense fallback={<PageShell pageId="abTest" status={{ loading: true, source: 'db' }}>{null}</PageShell>}>
            <AbTestPageContent />
        </Suspense>
    )
}
