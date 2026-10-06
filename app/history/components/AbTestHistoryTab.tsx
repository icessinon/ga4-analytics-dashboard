'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from '@/components/Link'
import Loader from '@/components/Loader'
import type { Pagination, AbTestExecution, AbTestHistoryTabProps } from './types'
import styles from './HistoryTab.module.css'

export default function AbTestHistoryTab({ productId }: AbTestHistoryTabProps) {
    const [executions, setExecutions] = useState<AbTestExecution[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [currentPage, setCurrentPage] = useState(1)
    const [pagination, setPagination] = useState<Pagination | null>(null)
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    const fetchHistory = useCallback(async (page: number = 1, search: string = '') => {
        setLoading(true)
        setError(null)
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: '10',
            })
            if (productId) {
                params.append('productId', productId.toString())
            }
            if (search) {
                params.append('search', search)
            }

            const response = await fetch(`/api/ab-test/history?${params.toString()}`)
            if (!response.ok) {
                throw new Error('履歴の取得に失敗しました')
            }
            const data = await response.json()
            if (data.error) {
                throw new Error(data.message || data.error)
            }
            setExecutions(data.executions || [])
            setPagination(data.pagination || null)
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'エラーが発生しました'
            setError(errorMessage)
        } finally {
            setLoading(false)
        }
    }, [productId])

    useEffect(() => {
        fetchHistory(1, '')
    }, [fetchHistory])

    useEffect(() => {
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current)
        }
        setCurrentPage(1)
        searchTimeoutRef.current = setTimeout(() => {
            fetchHistory(1, searchQuery)
        }, 500)
        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current)
            }
        }
    }, [searchQuery, fetchHistory])

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            fetchHistory(currentPage, searchQuery)
        }, 0)
        return () => clearTimeout(timeoutId)
    }, [currentPage, fetchHistory, searchQuery])

    const formatDate = (dateString: string | null) => {
        if (!dateString) return '-'
        const date = new Date(dateString)
        return date.toLocaleString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    const getStatusBadge = (status: string) => {
        const baseClass = styles.statusBadge
        switch (status) {
            case 'completed':
                return `${baseClass} ${styles.statusBadgeCompleted}`
            case 'failed':
                return `${baseClass} ${styles.statusBadgeFailed}`
            case 'running':
                return `${baseClass} ${styles.statusBadgeRunning}`
            default:
                return `${baseClass} ${styles.statusBadgeDefault}`
        }
    }

    const getPageNumbers = () => {
        if (!pagination) return []
        const { totalPages, page } = pagination
        const pageNumbers = []
        const maxPagesToShow = 5

        let startPage = Math.max(1, page - Math.floor(maxPagesToShow / 2))
        const endPage = Math.min(totalPages, startPage + maxPagesToShow - 1)

        if (endPage - startPage + 1 < maxPagesToShow) {
            startPage = Math.max(1, endPage - maxPagesToShow + 1)
        }

        for (let i = startPage; i <= endPage; i++) {
            pageNumbers.push(i)
        }
        return pageNumbers
    }

    if (loading && executions.length === 0) {
        return (
            <div className={styles.loaderContainer}>
                <Loader />
            </div>
        )
    }

    if (error && executions.length === 0) {
        return (
            <div className={styles.errorContainer}>
                <p className={styles.errorTitle}>エラーが発生しました</p>
                <p>{error}</p>
                <button
                    onClick={() => fetchHistory(currentPage, searchQuery)}
                    className={styles.retryButton}
                >
                    再試行
                </button>
            </div>
        )
    }

    return (
        <>
            <div className={styles.searchForm}>
                <div className={styles.searchInputContainer}>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="ABテスト名またはプロダクト名で検索（入力中に自動検索）..."
                        className={styles.searchInput}
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => {
                                setSearchQuery('')
                                setCurrentPage(1)
                                fetchHistory(1, '')
                            }}
                            className={styles.clearButton}
                        >
                            クリア
                        </button>
                    )}
                </div>
                <p className={styles.helpText}>
                    入力中に自動的に検索されます
                </p>
            </div>

            {pagination && (
                <div className={styles.countText}>
                    全 {pagination.total} 件中 {((currentPage - 1) * pagination.limit) + 1} - {Math.min(currentPage * pagination.limit, pagination.total)} 件を表示
                </div>
            )}

            {executions.length === 0 ? (
                <div className={styles.emptyState}>
                    <p className={styles.emptyText}>
                        {searchQuery ? '検索結果が見つかりませんでした' : '履歴がありません'}
                    </p>
                    {!searchQuery && (
                        <Link
                            href="/ab-test"
                            className={styles.createButton}
                        >
                            ABテストを作成する
                        </Link>
                    )}
                </div>
            ) : (
                <>
                    <div className={styles.table}>
                        <table style={{ width: '100%' }}>
                            <thead className={styles.tableHead}>
                                <tr>
                                    <th className={styles.tableHeader}>実行日時</th>
                                    <th className={styles.tableHeader}>ABテスト名</th>
                                    <th className={styles.tableHeader}>プロダクト</th>
                                    <th className={styles.tableHeader}>ステータス</th>
                                    <th className={styles.tableHeader}>操作</th>
                                </tr>
                            </thead>
                            <tbody className={styles.tableBody}>
                                {executions.map((exec) => (
                                    <tr key={exec.id} className={styles.tableRow}>
                                        <td className={styles.tableCell}>
                                            {formatDate(exec.createdAt)}
                                        </td>
                                        <td className={styles.tableCell}>
                                            {exec.abTestName}
                                        </td>
                                        <td className={styles.tableCell}>
                                            {exec.productName}
                                        </td>
                                        <td className={styles.tableCell}>
                                            <span className={getStatusBadge(exec.status)}>
                                                {exec.status === 'completed' ? '完了' : exec.status === 'failed' ? '失敗' : exec.status === 'running' ? '実行中' : exec.status}
                                            </span>
                                        </td>
                                        <td className={styles.actionCell}>
                                            <div className={styles.actionContainer}>
                                                {exec.hasResultData && exec.reportExecutionId ? (
                                                    <Link
                                                        href={`/reports/${exec.reportExecutionId}`}
                                                        className={styles.actionLink}
                                                    >
                                                        詳細
                                                    </Link>
                                                ) : (
                                                    <Link
                                                        href={`/ab-test/${exec.abTestId}`}
                                                        className={styles.actionLink}
                                                    >
                                                        ABテスト詳細
                                                    </Link>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {pagination && pagination.totalPages > 1 && (
                        <div className={styles.pagination}>
                            <button
                                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                                disabled={currentPage === 1}
                                className={styles.paginationButton}
                            >
                                前へ
                            </button>
                            <div className={styles.paginationNumbers}>
                                {getPageNumbers().map((pageNumber) => (
                                    <button
                                        key={pageNumber}
                                        onClick={() => setCurrentPage(pageNumber)}
                                        className={`${styles.paginationButton} ${
                                            pageNumber === currentPage ? styles.paginationButtonActive : ''
                                        }`}
                                    >
                                        {pageNumber}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={() => setCurrentPage(Math.min(pagination.totalPages, currentPage + 1))}
                                disabled={currentPage === pagination.totalPages}
                                className={styles.paginationButton}
                            >
                                次へ
                            </button>
                        </div>
                    )}
                </>
            )}
        </>
    )
}
