'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from '@/components/Link'
import Loader from '@/components/Loader'
import type { Pagination, ReportExecution, ReportHistoryTabProps } from './types'
import styles from './HistoryTab.module.css'

export default function ReportHistoryTab({ productId }: ReportHistoryTabProps) {
    const [executions, setExecutions] = useState<ReportExecution[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [currentPage, setCurrentPage] = useState(1)
    const [pagination, setPagination] = useState<Pagination | null>(null)
    const [deletingId, setDeletingId] = useState<number | null>(null)
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

            const response = await fetch(`/api/reports/history?${params.toString()}`)
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

    const handleDelete = async (id: number) => {
        if (!confirm('このレポート実行履歴を削除しますか？')) return

        setDeletingId(id)
        try {
            const response = await fetch(`/api/reports/history/${id}`, {
                method: 'DELETE',
            })
            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.message || data.error || '削除に失敗しました')
            }
            fetchHistory(currentPage, searchQuery)
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : '削除に失敗しました'
            alert(errorMessage)
        } finally {
            setDeletingId(null)
        }
    }

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
                        placeholder="レポート名・施策(ABテスト)名で検索（入力中に自動検索）..."
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
                            href="/analytics"
                            className={styles.createButton}
                        >
                            レポートを生成する
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
                                    <th className={styles.tableHeader}>レポート / 施策</th>
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
                                            <div className={styles.reportNameCell}>
                                                {exec.abTestName && <span className={styles.abTestBadge}>ABテスト</span>}
                                                <span className={styles.reportNameMain}>{exec.abTestName ?? exec.reportName}</span>
                                                {exec.status !== 'completed' && (
                                                    <span className={getStatusBadge(exec.status)}>
                                                        {exec.status === 'failed' ? '失敗' : exec.status === 'running' ? '実行中' : exec.status}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className={styles.actionCell}>
                                            <div className={styles.actionContainer}>
                                                {exec.hasResultData && (
                                                    <Link
                                                        href={`/reports/${exec.id}`}
                                                        className={styles.actionLink}
                                                    >
                                                        詳細
                                                    </Link>
                                                )}
                                                <button
                                                    onClick={() => handleDelete(exec.id)}
                                                    disabled={deletingId === exec.id}
                                                    className={styles.deleteButton}
                                                >
                                                    {deletingId === exec.id ? '削除中...' : '削除'}
                                                </button>
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
                                {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                                    let pageNum: number
                                    if (pagination.totalPages <= 5) {
                                        pageNum = i + 1
                                    } else if (currentPage <= 3) {
                                        pageNum = i + 1
                                    } else if (currentPage >= pagination.totalPages - 2) {
                                        pageNum = pagination.totalPages - 4 + i
                                    } else {
                                        pageNum = currentPage - 2 + i
                                    }
                                    return (
                                        <button
                                            key={pageNum}
                                            onClick={() => setCurrentPage(pageNum)}
                                            className={`${styles.paginationButton} ${
                                                currentPage === pageNum ? styles.paginationButtonActive : ''
                                            }`}
                                        >
                                            {pageNum}
                                        </button>
                                    )
                                })}
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
