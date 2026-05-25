'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/Link'
import { useParams, useRouter } from 'next/navigation'
import BackLink from '@/components/BackLink'
import CustomSelect from '@/components/CustomSelect'
import Loader from '@/components/Loader'
import AbTestCompletionModal from '@/components/ab-test/AbTestCompletionModal'
import { parseJsonResponse } from '@/lib/utils/fetch'
import type { AbTest, AbTestReportExecution } from './types'
import styles from './AbTestDetailPage.module.css'

export default function AbTestDetailPage() {
    const router = useRouter()
    const params = useParams()
    const abTestId = params?.id as string
    const [abTest, setAbTest] = useState<AbTest | null>(null)
    const [reportExecutions, setReportExecutions] = useState<AbTestReportExecution[]>([])
    const [winnerFromLastRun, setWinnerFromLastRun] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [nextExecutionDate, setNextExecutionDate] = useState<Date | null>(null)
    const [updatingStatus, setUpdatingStatus] = useState(false)
    const [showCompletionModal, setShowCompletionModal] = useState(false)

    useEffect(() => {
        if (!abTestId) {
            setError('ABテストIDが指定されていません')
            setLoading(false)
            return
        }

        fetchAbTestDetail()
    }, [abTestId])

    useEffect(() => {
        if (abTest && abTest.scheduleConfig) {
            loadNextExecutionDate()
        }
    }, [abTest])

    useEffect(() => {
        const onFocus = () => {
            if (abTest?.id) loadNextExecutionDate()
        }
        window.addEventListener('focus', onFocus)
        return () => window.removeEventListener('focus', onFocus)
    }, [abTest?.id])

    async function fetchAbTestDetail() {
        try {
            const response = await fetch(`/api/ab-test/${abTestId}`)
            const data = await parseJsonResponse<{ error?: string; message?: string; abTest?: AbTest; reportExecutions?: AbTestReportExecution[]; winnerFromLastRun?: string | null }>(response)

            if (!response.ok || data.error) {
                throw new Error(data.message || data.error || 'ABテスト詳細の取得に失敗しました')
            }

            if (!data.abTest) {
                throw new Error('ABテストデータが見つかりませんでした')
            }

            setAbTest(data.abTest)
            setReportExecutions(data.reportExecutions || [])
            setWinnerFromLastRun(data.winnerFromLastRun ?? null)
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'エラーが発生しました'
            setError(errorMessage)
        } finally {
            setLoading(false)
        }
    }

    async function loadNextExecutionDate() {
        if (!abTest) return
        try {
            const response = await fetch(`/api/ab-test/${abTest.id}/next-execution`)
            if (response.ok) {
                const data = await response.json()
                if (data.nextExecutionDate) {
                    setNextExecutionDate(new Date(data.nextExecutionDate))
                }
            }
        } catch (error) {
            console.error('次回実行予定日時の取得エラー:', error)
        }
    }


    async function handleStatusChange(newStatus: string) {
        if (!abTest) return
        if (newStatus === 'completed') {
            setShowCompletionModal(true)
            return
        }
        setUpdatingStatus(true)
        try {
            const response = await fetch(`/api/ab-test/${abTest.id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            })
            const data = await parseJsonResponse<{ error?: string; message?: string }>(response)

            if (data.error) {
                throw new Error(data.message || data.error)
            }

            await fetchAbTestDetail()
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'エラーが発生しました'
            setError(errorMessage)
        } finally {
            setUpdatingStatus(false)
        }
    }

    async function handleCompletionSubmit(victoryFactors: string, defeatFactors: string) {
        if (!abTest) return
        setUpdatingStatus(true)
        try {
            const response = await fetch(`/api/ab-test/${abTest.id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'completed',
                    victoryFactors: victoryFactors || undefined,
                    defeatFactors: defeatFactors || undefined,
                }),
            })
            const data = await parseJsonResponse<{ error?: string; message?: string }>(response)

            if (data.error) {
                throw new Error(data.message || data.error)
            }

            setShowCompletionModal(false)
            await fetchAbTestDetail()
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'エラーが発生しました'
            setError(errorMessage)
            throw err
        } finally {
            setUpdatingStatus(false)
        }
    }

    function formatDate(dateString: string | null) {
        if (!dateString) return '-'
        return new Date(dateString).toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        })
    }

    function formatDateTime(dateString: string | null) {
        if (!dateString) return '-'
        return new Date(dateString).toLocaleString('ja-JP')
    }

    if (loading) {
        return (
            <div className={styles.container}>
                <h1 className={styles.title}>ABテスト詳細</h1>
                <div className={styles.loaderContainer}>
                    <Loader />
                </div>
            </div>
        )
    }

    if (error || !abTest) {
        return (
            <div className={styles.container}>
                <h1 className={styles.title}>ABテスト詳細</h1>
                <div className={styles.errorContainer}>
                    <p className={styles.errorTitle}>エラーが発生しました</p>
                    <p>{error || 'ABテストが見つかりませんでした'}</p>
                    <Link
                        href="/ab-test"
                        className={styles.errorLink}
                    >
                        一覧に戻る
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.headerRow}>
                    <h1 className={styles.title}>{abTest.name}</h1>
                    <div className={styles.headerActions}>
                        <BackLink href="/ab-test">一覧に戻る</BackLink>
                        <button
                            onClick={() => router.push(`/ab-test/${abTest.id}/segment`)}
                            className={styles.segmentButton}
                        >
                            セグメント別CVR
                        </button>
                        <button
                            onClick={() => router.push(`/ab-test?edit=${abTest.id}`)}
                            className={styles.editButton}
                        >
                            この設定で編集
                        </button>
                    </div>
                </div>
                <p className={styles.subtitle}>
                    作成日時: {formatDateTime(abTest.startDate)}
                </p>
            </div>

            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>基本情報</h2>
                <div className={styles.infoGrid}>
                    <div className={styles.infoItem}>
                        <p className={styles.infoLabel}>ステータス</p>
                        <div className={styles.statusContainer}>
                            <CustomSelect
                                value={abTest.status}
                                onChange={handleStatusChange}
                                options={[
                                    { value: 'running', label: '実行中' },
                                    { value: 'paused', label: '一時停止' },
                                    { value: 'completed', label: '完了' },
                                ]}
                                disabled={updatingStatus}
                                triggerClassName={`${styles.statusSelect} ${
                                    abTest.status === 'running' ? styles.statusSelectRunning :
                                    abTest.status === 'completed' ? styles.statusSelectCompleted :
                                    styles.statusSelectPaused
                                } ${updatingStatus ? styles.statusSelectDisabled : ''}`}
                                aria-label="ステータス"
                            />
                            {updatingStatus && (
                                <span className={styles.statusUpdating}>更新中...</span>
                            )}
                        </div>
                    </div>
                    <div className={styles.infoItem}>
                        <p className={styles.infoLabel}>プロダクト</p>
                        <p className={styles.infoValue}>{abTest.product.name}</p>
                    </div>
                    <div className={styles.infoItem}>
                        <p className={styles.infoLabel}>期間</p>
                        <p className={styles.infoValue}>
                            {formatDate(abTest.startDate)} - {abTest.endDate ? formatDate(abTest.endDate) : '継続中'}
                        </p>
                    </div>
                    <div className={styles.infoItem}>
                        <p className={styles.infoLabel}>バリアント</p>
                        <p className={styles.infoValue}>
                            {(() => {
                                const variants = ['A', 'B']
                                if (abTest.ga4Config?.cvrC?.denominatorDimension) variants.push('C')
                                if (abTest.ga4Config?.cvrD?.denominatorDimension) variants.push('D')
                                return variants.join(' / ')
                            })()}
                        </p>
                    </div>
                    {abTest.description && (
                        <div className={`${styles.infoItem} ${styles.infoItemFull}`}>
                            <p className={styles.infoLabel}>説明</p>
                            <p className={styles.infoValue}>{abTest.description}</p>
                        </div>
                    )}
                </div>
            </div>

            {abTest.ga4Config && (
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>テストしているラベル</h2>
                    <div className={styles.labelSection}>
                        {abTest.ga4Config.dimensions && (
                            <div className={styles.labelBlock}>
                                <p className={styles.labelBlockTitle}>集計ディメンション</p>
                                <p className={styles.labelBlockValue}>
                                    {Array.isArray(abTest.ga4Config.dimensions)
                                        ? abTest.ga4Config.dimensions.map((d: { name?: string }) => d?.name ?? d).join(', ')
                                        : String(abTest.ga4Config.dimensions)}
                                </p>
                            </div>
                        )}
                        {abTest.ga4Config.filter?.dimension && abTest.ga4Config.filter?.expression && (
                            <div className={styles.labelBlock}>
                                <p className={styles.labelBlockTitle}>フィルタ条件</p>
                                <p className={styles.labelBlockValue}>
                                    {abTest.ga4Config.filter.dimension} {abTest.ga4Config.filter.operator || ''} {String(abTest.ga4Config.filter.expression)}
                                </p>
                            </div>
                        )}
                        {(['cvrA', 'cvrB', 'cvrC', 'cvrD'] as const).map((key) => {
                            const cvr = abTest.ga4Config?.[key]
                            if (!cvr) return null
                            const denLabels = Array.isArray(cvr.denominatorLabels) ? cvr.denominatorLabels.join(', ') : (cvr.denominatorLabels ?? '')
                            const numLabels = Array.isArray(cvr.numeratorLabels) ? cvr.numeratorLabels.join(', ') : (cvr.numeratorLabels ?? '')
                            if (!denLabels && !numLabels) return null
                            return (
                                <div key={key} className={styles.labelBlock}>
                                    <p className={styles.labelBlockTitle}>CVR {key.replace('cvr', '')}</p>
                                    <p className={styles.labelBlockValue}>
                                        <span className={styles.labelDenominator}>分母: {denLabels || '-'}</span>
                                        <span className={styles.labelNumerator}>分子（CV）: {numLabels || '-'}</span>
                                    </p>
                                </div>
                            )
                        })}
                        {!abTest.ga4Config.dimensions && !abTest.ga4Config.filter?.dimension &&
                            !(['cvrA', 'cvrB', 'cvrC', 'cvrD'] as const).some((k) => {
                                const c = abTest.ga4Config?.[k]
                                return c && (c.denominatorLabels || c.numeratorLabels)
                            }) && (
                            <p className={styles.labelEmpty}>ラベル設定がありません</p>
                        )}
                    </div>
                </div>
            )}

            {abTest.scheduleConfig && (
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>スケジュール設定</h2>
                    <div className={styles.scheduleList}>
                        <div className={styles.scheduleItem}>
                            <span className={styles.scheduleLabel}>自動実行:</span>
                            <span className={`${styles.scheduleBadge} ${
                                abTest.autoExecute ? styles.scheduleBadgeEnabled : styles.scheduleBadgeDisabled
                            }`}>
                                {abTest.autoExecute ? '有効' : '無効'}
                            </span>
                        </div>
                        {abTest.scheduleConfig.enabled && (
                            <>
                                <div>
                                    <span className={styles.scheduleLabel}>実行タイミング: </span>
                                    <span className={styles.scheduleValue}>
                                        {abTest.scheduleConfig.executionType === 'on_end' && '期間終了後すぐ実行'}
                                        {abTest.scheduleConfig.executionType === 'on_end_delayed' && `期間終了後${abTest.scheduleConfig.delayDays || 0}日後に実行`}
                                        {abTest.scheduleConfig.executionType === 'scheduled' && '特定の日時に実行'}
                                        {abTest.scheduleConfig.executionType === 'recurring' && '期間中も定期的に実行'}
                                    </span>
                                </div>
                                {nextExecutionDate && (
                                    <div>
                                        <span className={styles.scheduleLabel}>次回実行予定: </span>
                                        <span className={styles.scheduleValue}>
                                            {nextExecutionDate.toLocaleString('ja-JP')}
                                        </span>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            <div className={styles.section}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>生成されたレポート</h2>
                </div>

                {reportExecutions.length === 0 ? (
                    <p className={styles.reportEmpty}>レポートがまだ生成されていません</p>
                ) : (
                    <div className={styles.reportList}>
                        {reportExecutions.map((execution) => (
                            <Link
                                key={execution.id}
                                href={execution.status === 'completed' && execution.reportExecutionId 
                                    ? `/reports/${execution.reportExecutionId}` 
                                    : '#'}
                                className={`${styles.reportItem} ${
                                    execution.status === 'completed' && execution.reportExecutionId 
                                        ? styles.reportItemClickable 
                                        : styles.reportItemDefault
                                }`}
                            >
                                <div className={styles.reportItemContent}>
                                    <div className={styles.reportItemLeft}>
                                        <h3 className={styles.reportItemTitle}>
                                            レポート #{execution.id} ({formatDate(execution.createdAt)})
                                        </h3>
                                        <div className={styles.reportItemDetails}>
                                            <p>ステータス: {
                                                execution.status === 'completed' ? '✅ 完了' :
                                                execution.status === 'running' ? '🔄 実行中' :
                                                execution.status === 'failed' ? '❌ 失敗' :
                                                execution.status
                                            }</p>
                                            {execution.startedAt && (
                                                <p>開始: {formatDateTime(execution.startedAt)}</p>
                                            )}
                                            {execution.completedAt && (
                                                <p>完了: {formatDateTime(execution.completedAt)}</p>
                                            )}
                                            {execution.errorMessage && (
                                                <p className={styles.reportItemError}>エラー: {execution.errorMessage}</p>
                                            )}
                                        </div>
                                    </div>
                                    {execution.status === 'completed' && execution.reportExecutionId && (
                                        <span className={styles.reportItemButton}>
                                            詳細を見る
                                        </span>
                                    )}
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>

            <div className={styles.footer}>
                <BackLink href="/ab-test">一覧に戻る</BackLink>
            </div>

            <AbTestCompletionModal
                isOpen={showCompletionModal}
                onClose={() => setShowCompletionModal(false)}
                onSubmit={handleCompletionSubmit}
                testName={abTest?.name}
                winnerVariant={abTest?.winnerVariant ?? winnerFromLastRun}
                initialVictoryFactors={abTest?.victoryFactors ?? ''}
                initialDefeatFactors={abTest?.defeatFactors ?? ''}
            />
        </div>
    )
}
