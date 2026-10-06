'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from '@/components/Link'
import Loader from '@/components/Loader'
import type { Pagination, FunnelExecutionListItem, FunnelHistoryTabProps } from './types'
import styles from './HistoryTab.module.css'

export default function FunnelHistoryTab({ productId }: FunnelHistoryTabProps) {
    const [executions, setExecutions] = useState<FunnelExecutionListItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [currentPage, setCurrentPage] = useState(1)
    const [pagination, setPagination] = useState<Pagination | null>(null)
    const [deletingId, setDeletingId] = useState<number | null>(null)

    const fetchHistory = useCallback(async (page: number = 1) => {
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

            const response = await fetch(`/api/funnel/executions?${params.toString()}`)
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
        fetchHistory(currentPage)
    }, [currentPage, fetchHistory])

    const handleDelete = async (id: number) => {
        if (!confirm('このファネル実行履歴を削除しますか？')) return

        setDeletingId(id)
        try {
            const response = await fetch(`/api/funnel/executions/${id}`, {
                method: 'DELETE',
            })

            if (!response.ok) {
                throw new Error('削除に失敗しました')
            }

            await fetchHistory(currentPage)
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : '削除中にエラーが発生しました'
            alert(errorMessage)
        } finally {
            setDeletingId(null)
        }
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

    if (loading && !deletingId) {
        return (
            <div className={styles.loaderContainer}>
                <Loader />
            </div>
        )
    }

    if (error) {
        return (
            <div className={styles.errorContainer}>
                <p className={styles.errorTitle}>エラーが発生しました</p>
                <p>{error}</p>
                <button
                    onClick={() => fetchHistory(currentPage)}
                    className={styles.retryButton}
                >
                    再試行
                </button>
            </div>
        )
    }

    return (
        <>
            {pagination && (
                <div className={styles.countText}>
                    全 {pagination.total} 件中 {((currentPage - 1) * pagination.limit) + 1} - {Math.min(currentPage * pagination.limit, pagination.total)} 件を表示
                </div>
            )}

            {executions.length === 0 ? (
                <div className={styles.emptyState}>
                    <p className={styles.emptyText}>履歴がありません</p>
                    <Link
                        href="/funnel"
                        className={styles.createButton}
                    >
                        ファネル分析を実行する
                    </Link>
                </div>
            ) : (
                <>
                    <div className={styles.table}>
                        <table style={{ width: '100%' }}>
                            <thead className={styles.tableHead}>
                                <tr>
                                    <th className={styles.tableHeader}>実行日時</th>
                                    <th className={styles.tableHeader}>名前</th>
                                    <th className={styles.tableHeader}>プロダクト</th>
                                    <th className={styles.tableHeader}>期間</th>
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
                                            {exec.name}
                                        </td>
                                        <td className={styles.tableCell}>
                                            {exec.productName}
                                        </td>
                                        <td className={styles.tableCell}>
                                            {new Date(exec.startDate).toLocaleDateString('ja-JP')} - {new Date(exec.endDate).toLocaleDateString('ja-JP')}
                                        </td>
                                        <td className={styles.tableCell}>
                                            <span className={getStatusBadge(exec.status)}>
                                                {exec.status === 'completed' ? '完了' : exec.status === 'failed' ? '失敗' : exec.status === 'running' ? '実行中' : exec.status}
                                            </span>
                                        </td>
                                        <td className={styles.actionCell}>
                                            <div className={styles.actionContainer}>
                                                {exec.hasResultData ? (
                                                    <Link
                                                        href={`/funnel/${exec.id}`}
                                                        className={styles.actionLink}
                                                    >
                                                        詳細を見る
                                                    </Link>
                                                ) : (
                                                    <span style={{ color: 'var(--gray-400)', fontSize: '0.875rem' }}>-</span>
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
