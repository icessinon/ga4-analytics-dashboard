'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/Link'
import { useParams, useRouter } from 'next/navigation'
import AISpinner from '@/components/AISpinner/AISpinner'
import BackLink from '@/components/BackLink'
import CustomSelect from '@/components/CustomSelect'
import Loader from '@/components/Loader'
import AbTestCompletionModal from '@/components/ab-test/AbTestCompletionModal'
import { parseJsonResponse } from '@/lib/utils/fetch'
import type { AbTest, AbTestReportExecution } from './types'
import styles from './AbTestDetailPage.module.css'

interface CurrentVariant {
    key: string
    pv: number
    cv: number
    cvr: number
}

interface CurrentComparison {
    variant: string
    liftVsA: number | null
    significance: number
    requiredSignificance: number
    isSufficient: boolean
}

interface CurrentResult {
    startDate: string
    endDate: string
    elapsedDays: number
    reliability: { level: string; icon: string; description: string }
    variants: CurrentVariant[]
    comparisons: CurrentComparison[]
    leader: string | null
    fetchedAt: string
}

interface FunnelStepValue {
    users: number
    conversionRate: number | null
    dropoffRate: number | null
}

interface FunnelResult {
    mode?: 'manual' | 'auto'
    basis?: 'view' | 'click'
    detectedSuffixes?: string[]
    startDate: string
    endDate: string
    variants: string[]
    steps: Array<{
        stepName: string
        dimension: string
        values: Record<string, FunnelStepValue | undefined>
    }>
    fetchedAt: string
}

// GTMタグ規則によりB/C/DのCVRラベルに「__B-1618」等のサフィックスがあれば、
// funnelSteps未設定でもAPI側の自動検出でファネルを生成できる
function canShowFunnel(ga4Config: AbTest['ga4Config']): boolean {
    if ((ga4Config?.funnelSteps?.length ?? 0) > 0) return true
    for (const cvr of [ga4Config?.cvrB, ga4Config?.cvrC, ga4Config?.cvrD]) {
        const raw = [cvr?.denominatorLabels, cvr?.numeratorLabels].flatMap((l) =>
            Array.isArray(l) ? l : typeof l === 'string' ? l.split(',') : []
        )
        if (raw.some((label) => /__[A-D]-\w+$/.test(label.trim()))) return true
    }
    return false
}

/** AIレポートの1行をHTML化: エスケープ→**太字**変換。「## 見出し」はマークを外して太字にする */
function renderAiReportLine(line: string, i: number, className: string) {
    const headingMatch = line.match(/^\s*#{1,6}\s+(.*)$/)
    const content = headingMatch ? headingMatch[1] : line
    const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    let html = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    if (headingMatch) html = `<strong>${html}</strong>`
    return <p key={i} className={className} dangerouslySetInnerHTML={{ __html: html }} />
}

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
    const [executingReport, setExecutingReport] = useState(false)
    const [showCompletionModal, setShowCompletionModal] = useState(false)
    const [currentResult, setCurrentResult] = useState<CurrentResult | null>(null)
    const [currentLoading, setCurrentLoading] = useState(false)
    const [currentError, setCurrentError] = useState<string | null>(null)
    const [notStarted, setNotStarted] = useState<string | null>(null)
    const [funnelResult, setFunnelResult] = useState<FunnelResult | null>(null)
    const [funnelLoading, setFunnelLoading] = useState(false)
    const [funnelError, setFunnelError] = useState<string | null>(null)
    const [funnelBasis, setFunnelBasis] = useState<'view' | 'click'>('view')

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
        // completed でも最終結果（期間確定値）として同じ集計を表示する
        if (abTest && abTest.ga4Config) {
            loadCurrentResult()
            if (canShowFunnel(abTest.ga4Config)) {
                loadFunnelResult()
            }
        }
    }, [abTest?.id, abTest?.status])

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


    async function loadCurrentResult() {
        setCurrentLoading(true)
        setCurrentError(null)
        try {
            const response = await fetch(`/api/ab-test/${abTestId}/current`)
            const data = await parseJsonResponse<CurrentResult & { error?: string; message?: string; notStarted?: boolean; startDate?: string }>(response)
            if (!response.ok || data.error) {
                throw new Error(data.message || data.error || '途中経過の取得に失敗しました')
            }
            if (data.notStarted) {
                setNotStarted(data.startDate ?? null)
                setCurrentResult(null)
                return
            }
            setNotStarted(null)
            setCurrentResult(data)
        } catch (err) {
            setCurrentError(err instanceof Error ? err.message : 'エラーが発生しました')
        } finally {
            setCurrentLoading(false)
        }
    }

    async function loadFunnelResult(basis?: 'view' | 'click') {
        const useBasis = basis ?? funnelBasis
        setFunnelLoading(true)
        setFunnelError(null)
        try {
            const response = await fetch(`/api/ab-test/${abTestId}/funnel?basis=${useBasis}`)
            const data = await parseJsonResponse<FunnelResult & { error?: string; message?: string; notStarted?: boolean }>(response)
            if (!response.ok || data.error) {
                throw new Error(data.message || data.error || 'ファネル集計の取得に失敗しました')
            }
            if (data.notStarted) {
                setNotStarted((prev) => prev ?? (data as { startDate?: string }).startDate ?? null)
                setFunnelResult(null)
                return
            }
            setFunnelResult(data)
        } catch (err) {
            setFunnelError(err instanceof Error ? err.message : 'エラーが発生しました')
        } finally {
            setFunnelLoading(false)
        }
    }

    function handleChangeFunnelBasis(basis: 'view' | 'click') {
        if (basis === funnelBasis || funnelLoading) return
        setFunnelBasis(basis)
        loadFunnelResult(basis)
    }

    async function handleExecuteReport() {
        if (!abTest || executingReport) return
        setExecutingReport(true)
        setError(null)
        try {
            const response = await fetch('/api/ab-test/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ abTestId: abTest.id, force: true }),
            })
            const data = await parseJsonResponse<{
                error?: string
                message?: string
                results?: Array<{ status: string; errorMessage?: string }>
            }>(response)
            if (!response.ok || data.error) {
                throw new Error(data.message || data.error || 'レポート実行に失敗しました')
            }
            const failed = (data.results ?? []).find((r) => r.status === 'failed')
            if (failed) {
                throw new Error(failed.errorMessage || 'レポート実行に失敗しました')
            }
            await fetchAbTestDetail()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'レポート実行に失敗しました')
        } finally {
            setExecutingReport(false)
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
                            onClick={() => router.push(`/ab-test/${abTest.id}/daily`)}
                            className={styles.segmentButton}
                        >
                            日次CVR推移
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

            {abTest.status === 'completed' && (
                <div className={`${styles.section} ${styles.resultSummary}`}>
                    <h2 className={styles.sectionTitle}>テスト結果サマリー</h2>
                    <div className={styles.resultSummaryGrid}>
                        <div className={styles.resultSummaryCard}>
                            <p className={styles.resultSummaryLabel}>勝者バリアント</p>
                            <p className={styles.resultSummaryWinner}>
                                {abTest.winnerVariant ? `🏆 ${abTest.winnerVariant}` : '判定なし'}
                            </p>
                        </div>
                        {abTest.improvementVsAPercent != null && (
                            <div className={styles.resultSummaryCard}>
                                <p className={styles.resultSummaryLabel}>A比改善率</p>
                                <p className={`${styles.resultSummaryValue} ${Number(abTest.improvementVsAPercent) >= 0 ? styles.currentLiftUp : styles.currentLiftDown}`}>
                                    {Number(abTest.improvementVsAPercent) >= 0 ? '+' : ''}{Number(abTest.improvementVsAPercent).toFixed(1)}%
                                </p>
                            </div>
                        )}
                        {abTest.expectedImprovement != null && (
                            <div className={styles.resultSummaryCard}>
                                <p className={styles.resultSummaryLabel}>期待改善率（計画時）</p>
                                <p className={styles.resultSummaryValue}>{Number(abTest.expectedImprovement).toFixed(1)}%</p>
                            </div>
                        )}
                        <div className={styles.resultSummaryCard}>
                            <p className={styles.resultSummaryLabel}>テスト期間</p>
                            <p className={styles.resultSummaryValue}>
                                {formatDate(abTest.startDate)} - {abTest.endDate ? formatDate(abTest.endDate) : '-'}
                            </p>
                        </div>
                    </div>
                    {(abTest.victoryFactors || abTest.defeatFactors) && (
                        <div className={styles.resultFactors}>
                            {abTest.victoryFactors && (
                                <div className={styles.resultFactorItem}>
                                    <p className={styles.resultSummaryLabel}>勝因メモ</p>
                                    <p className={styles.resultFactorText}>{abTest.victoryFactors}</p>
                                </div>
                            )}
                            {abTest.defeatFactors && (
                                <div className={styles.resultFactorItem}>
                                    <p className={styles.resultSummaryLabel}>敗因メモ</p>
                                    <p className={styles.resultFactorText}>{abTest.defeatFactors}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {abTest.status === 'completed' && abTest.finalAiReport && (
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>AI最終レポート</h2>
                    {abTest.finalAiReportAt && (
                        <p className={styles.currentMeta}>生成日時: {new Date(abTest.finalAiReportAt).toLocaleString('ja-JP')}</p>
                    )}
                    <div className={styles.aiReport}>
                        {abTest.finalAiReport.split('\n').map((line, i) => renderAiReportLine(line, i, styles.aiReportLine))}
                    </div>
                </div>
            )}

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
                    {abTest.hypothesis && (
                        <div className={`${styles.infoItem} ${styles.infoItemFull}`}>
                            <p className={styles.infoLabel}>仮説</p>
                            <p className={styles.infoValue}>{abTest.hypothesis}</p>
                        </div>
                    )}
                    {abTest.expectedImprovement != null && (
                        <div className={styles.infoItem}>
                            <p className={styles.infoLabel}>期待改善率</p>
                            <p className={styles.infoValue}>{Number(abTest.expectedImprovement).toFixed(1)}%</p>
                        </div>
                    )}
                </div>
            </div>

            {abTest.status !== 'completed' && abTest.finalAiReport && (
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>AI最終レポート</h2>
                    {abTest.finalAiReportAt && (
                        <p className={styles.currentMeta}>生成日時: {new Date(abTest.finalAiReportAt).toLocaleString('ja-JP')}</p>
                    )}
                    <div className={styles.aiReport}>
                        {abTest.finalAiReport.split('\n').map((line, i) => renderAiReportLine(line, i, styles.aiReportLine))}
                    </div>
                </div>
            )}

            {abTest.ga4Config && (
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>
                            {abTest.status === 'completed' ? '最終結果（バリアント別CVR）' : '現在の途中経過'}
                        </h2>
                        {abTest.status !== 'completed' && (
                            <button
                                onClick={loadCurrentResult}
                                disabled={currentLoading}
                                className={styles.refreshButton}
                            >
                                {currentLoading ? '集計中...' : '最新に更新'}
                            </button>
                        )}
                    </div>

                    {notStarted && (
                        <div className={`${styles.currentCallout} ${styles.currentCalloutNeutral}`}>
                            このテストはまだ開始前です（開始日: {formatDate(notStarted)}）。開始後にここに途中経過が表示されます。
                        </div>
                    )}

                    {currentError && (
                        <p className={styles.currentError}>途中経過の取得に失敗しました: {currentError}</p>
                    )}

                    {currentLoading && !currentResult && (
                        <p className={styles.currentMeta}>GA4からリアルタイム集計中です...</p>
                    )}

                    {currentResult && (
                        <div className={styles.currentBody}>
                            <p className={styles.currentMeta}>
                                {abTest.status === 'completed'
                                    ? `集計期間: ${currentResult.startDate} 〜 ${currentResult.endDate}（テスト期間全体の確定値）`
                                    : `集計期間: ${currentResult.startDate} 〜 ${currentResult.endDate}（経過${currentResult.elapsedDays}日 ${currentResult.reliability.icon} ${currentResult.reliability.level}・${currentResult.reliability.description}）／ 集計時刻: ${new Date(currentResult.fetchedAt).toLocaleString('ja-JP')}`}
                            </p>

                            {(() => {
                                const { leader, variants, comparisons } = currentResult
                                if (abTest.status === 'completed') {
                                    if (!abTest.winnerVariant) {
                                        return (
                                            <div className={`${styles.currentCallout} ${styles.currentCalloutNeutral}`}>
                                                勝者判定なしで終了しました
                                            </div>
                                        )
                                    }
                                    const winComp = comparisons.find((c) => c.variant === abTest.winnerVariant)
                                    return (
                                        <div className={`${styles.currentCallout} ${styles.currentCalloutWin}`}>
                                            🏆 勝者: <strong>{abTest.winnerVariant}</strong>
                                            {winComp && `（有意差${winComp.significance}%）`}
                                        </div>
                                    )
                                }
                                if (!leader) {
                                    return (
                                        <div className={`${styles.currentCallout} ${styles.currentCalloutNeutral}`}>
                                            まだ十分なデータがありません
                                        </div>
                                    )
                                }
                                const rivalKey = leader !== 'A'
                                    ? leader
                                    : variants
                                        .filter((v) => v.key !== 'A' && v.pv > 0)
                                        .sort((a, b) => b.cvr - a.cvr)[0]?.key
                                const comp = comparisons.find((c) => c.variant === rivalKey)
                                if (!comp) {
                                    return (
                                        <div className={`${styles.currentCallout} ${styles.currentCalloutNeutral}`}>
                                            現時点では {leader} がリードしています
                                        </div>
                                    )
                                }
                                return comp.isSufficient ? (
                                    <div className={`${styles.currentCallout} ${styles.currentCalloutWin}`}>
                                        現時点では <strong>{leader}</strong> が優勢です（有意差{comp.significance}% ≧ 必要{comp.requiredSignificance}%）
                                    </div>
                                ) : (
                                    <div className={`${styles.currentCallout} ${styles.currentCalloutPending}`}>
                                        現時点では <strong>{leader}</strong> がリードしていますが、まだ判定に足る有意差はありません（有意差{comp.significance}% ／ 必要{comp.requiredSignificance}%）
                                    </div>
                                )
                            })()}

                            {currentResult.variants.some((v) => v.cv > v.pv) && (
                                <div className={`${styles.currentCallout} ${styles.currentCalloutError}`}>
                                    ⚠️ CVがPV（分母）を上回っているバリアントがあります（CVR&gt;100%）。分母ラベルがテスト対象ユーザー全体をカバーしているか、CVR設定を見直してください
                                </div>
                            )}

                            <div className={styles.currentTableWrapper}>
                                <table className={styles.currentTable}>
                                    <thead>
                                        <tr>
                                            <th>バリアント</th>
                                            <th>PV（分母）</th>
                                            <th>CV（分子）</th>
                                            <th>CVR</th>
                                            <th>Aとの差（絶対 / 相対）</th>
                                            <th>有意差(vs A)</th>
                                            <th>判定</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {currentResult.variants.map((v) => {
                                            const comp = currentResult.comparisons.find((c) => c.variant === v.key)
                                            const isCompleted = abTest.status === 'completed'
                                            const isLeader = isCompleted
                                                ? abTest.winnerVariant === v.key
                                                : currentResult.leader === v.key
                                            return (
                                                <tr key={v.key} className={isLeader ? styles.currentLeaderRow : undefined}>
                                                    <td>
                                                        {v.key}
                                                        {isLeader && <span className={styles.leaderBadge}>{isCompleted ? '勝者' : 'リード中'}</span>}
                                                    </td>
                                                    <td>{v.pv.toLocaleString()}</td>
                                                    <td>{v.cv.toLocaleString()}</td>
                                                    <td className={styles.currentCvr}>{(v.cvr * 100).toFixed(2)}%</td>
                                                    <td className={
                                                        comp?.liftVsA == null ? undefined
                                                            : comp.liftVsA >= 0 ? styles.currentLiftUp : styles.currentLiftDown
                                                    }>
                                                        {(() => {
                                                            if (comp?.liftVsA == null) return '-'
                                                            const aCvr = currentResult.variants.find((x) => x.key === 'A')?.cvr
                                                            const absPt = aCvr != null ? (v.cvr - aCvr) * 100 : null
                                                            const rel = `${comp.liftVsA >= 0 ? '+' : ''}${(comp.liftVsA * 100).toFixed(1)}%`
                                                            return absPt != null
                                                                ? `${absPt >= 0 ? '+' : ''}${absPt.toFixed(2)}pt ／ ${rel}`
                                                                : rel
                                                        })()}
                                                    </td>
                                                    <td>{comp ? `${comp.significance}%（必要${comp.requiredSignificance}%）` : '-'}</td>
                                                    <td>{comp ? (comp.isSufficient ? '✅ 有意差あり' : '⏳ 判定中') : '-'}</td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <p className={styles.currentNote}>
                                {abTest.status === 'completed'
                                    ? '※ テスト期間全体をGA4から集計した確定値です'
                                    : '※ GA4からのオンデマンド集計です（当日データを含むため、直近の数値は変動する場合があります）'}
                            </p>
                        </div>
                    )}
                </div>
            )}

            {canShowFunnel(abTest.ga4Config) && (
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>
                            {abTest.status === 'completed' ? '最終ファネル（バリアント別）' : '途中経過ファネル'}
                        </h2>
                        <div className={styles.funnelControls}>
                            <div className={styles.basisToggle}>
                                <button
                                    className={funnelBasis === 'view' ? styles.basisActive : styles.basisButton}
                                    onClick={() => handleChangeFunnelBasis('view')}
                                    disabled={funnelLoading}
                                >
                                    ビュー基準
                                </button>
                                <button
                                    className={funnelBasis === 'click' ? styles.basisActive : styles.basisButton}
                                    onClick={() => handleChangeFunnelBasis('click')}
                                    disabled={funnelLoading}
                                >
                                    クリック基準
                                </button>
                            </div>
                            {abTest.status !== 'completed' && (
                                <button
                                    onClick={() => loadFunnelResult()}
                                    disabled={funnelLoading}
                                    className={styles.refreshButton}
                                >
                                    {funnelLoading ? '集計中...' : '最新に更新'}
                                </button>
                            )}
                        </div>
                    </div>

                    {notStarted && (
                        <div className={`${styles.currentCallout} ${styles.currentCalloutNeutral}`}>
                            このテストはまだ開始前です（開始日: {formatDate(notStarted)}）。開始後にここにファネルが表示されます。
                        </div>
                    )}

                    {funnelError && (
                        <p className={styles.currentError}>ファネル集計の取得に失敗しました: {funnelError}</p>
                    )}

                    {funnelLoading && !funnelResult && (
                        <p className={styles.currentMeta}>GA4からリアルタイム集計中です...</p>
                    )}

                    {funnelResult && (
                        <div className={styles.currentBody}>
                            <p className={styles.currentMeta}>
                                集計期間: {funnelResult.startDate} 〜 {funnelResult.endDate}
                                ／ 集計時刻: {new Date(funnelResult.fetchedAt).toLocaleString('ja-JP')}
                                {funnelResult.mode === 'auto' && funnelResult.detectedSuffixes && (
                                    <>
                                        {' ／ '}
                                        <span className={styles.leaderBadge}>自動検出</span>
                                        {' '}タグサフィックス「{funnelResult.detectedSuffixes.map((s) => `__${s}`).join(', ')}」からテスト範囲を自動抽出
                                    </>
                                )}
                            </p>
                            <div className={styles.currentTableWrapper}>
                                <table className={styles.currentTable}>
                                    <thead>
                                        <tr>
                                            <th>ステップ</th>
                                            {funnelResult.variants.map((v) => (
                                                <th key={v}>{v}（離脱率）</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {funnelResult.steps.map((step, i) => {
                                            const dropoffs = funnelResult.variants
                                                .map((v) => step.values[v]?.dropoffRate)
                                                .filter((d): d is number => d != null)
                                            const bestDropoff = dropoffs.length >= 2 ? Math.min(...dropoffs) : null
                                            return (
                                                <tr key={i}>
                                                    <td>{i + 1}. {step.stepName}</td>
                                                    {funnelResult.variants.map((v) => {
                                                        const val = step.values[v]
                                                        if (!val) return <td key={v}>-</td>
                                                        const isBest = bestDropoff != null && val.dropoffRate === bestDropoff
                                                        return (
                                                            <td key={v} className={isBest ? styles.funnelBestCell : undefined}>
                                                                {val.users.toLocaleString()}
                                                                {val.dropoffRate != null && (
                                                                    <span className={styles.funnelDropoff}>
                                                                        （-{(val.dropoffRate * 100).toFixed(1)}%）
                                                                    </span>
                                                                )}
                                                                {isBest && <span className={styles.funnelBestMark}>★</span>}
                                                            </td>
                                                        )
                                                    })}
                                                </tr>
                                            )
                                        })}
                                        {funnelResult.steps.length > 1 && (() => {
                                            // 起点: 全バリアントにユーザーがいる最初のステップ（Step0のような片側計測ステップを起点にすると到達率が歪むため）
                                            const steps = funnelResult.steps
                                            const baselineIndex = steps.findIndex((s) =>
                                                funnelResult.variants.every((v) => (s.values[v]?.users ?? 0) > 0)
                                            )
                                            if (baselineIndex < 0 || baselineIndex >= steps.length - 1) return null
                                            const baseStep = steps[baselineIndex]
                                            const lastStep = steps[steps.length - 1]
                                            const reach: Record<string, number | null> = {}
                                            for (const v of funnelResult.variants) {
                                                const base = baseStep.values[v]?.users ?? 0
                                                const last = lastStep.values[v]?.users
                                                reach[v] = base > 0 && last != null ? last / base : null
                                            }
                                            const reachA = reach['A']
                                            return (
                                                <>
                                                    <tr className={styles.funnelTotalRow}>
                                                        <td>全体到達率（{baseStep.stepName.split('_')[0]}→最終）</td>
                                                        {funnelResult.variants.map((v) => (
                                                            <td key={v} className={styles.currentCvr}>
                                                                {reach[v] != null ? `${(reach[v]! * 100).toFixed(2)}%` : '-'}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                    {reachA != null && reachA > 0 && funnelResult.variants.length > 1 && (
                                                        <tr className={styles.funnelTotalRow}>
                                                            <td>Aとの差（絶対 / 相対）</td>
                                                            {funnelResult.variants.map((v) => {
                                                                if (v === 'A') return <td key={v} className={styles.currentCvr}>-（基準）</td>
                                                                const r = reach[v]
                                                                if (r == null) return <td key={v}>-</td>
                                                                const absPt = (r - reachA) * 100
                                                                const rel = ((r - reachA) / reachA) * 100
                                                                const up = absPt >= 0
                                                                return (
                                                                    <td key={v} className={up ? styles.currentLiftUp : styles.currentLiftDown}>
                                                                        {`${up ? '+' : ''}${absPt.toFixed(1)}pt ／ ${up ? '+' : ''}${rel.toFixed(1)}%`}
                                                                    </td>
                                                                )
                                                            })}
                                                        </tr>
                                                    )}
                                                </>
                                            )
                                        })()}
                                    </tbody>
                                </table>
                            </div>
                            <p className={styles.currentNote}>
                                ※ ★は同ステップで離脱率が最も低いバリアント。ユーザー数はtotalUsers基準のGA4オンデマンド集計です
                                {funnelResult.basis === 'click'
                                    ? '。クリック基準: 各ステップで何か操作（選択肢・次へ・戻る等のタップ）をしたユニークユーザー数。表示時間の条件がないため取りこぼしが少なく、ステップ通過の実数に近い値です'
                                    : '。ビュー基準: ステップタイトルが50%以上×1秒連続表示されたユニークユーザー数。プリセット流入などで即通過したユーザーは数えられないことがあります（クリック基準との比較で確認できます）'}
                            </p>
                        </div>
                    )}
                </div>
            )}

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

            {abTest.status !== 'completed' && abTest.scheduleConfig && (
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
                    {abTest.status === 'running' && (
                        <button
                            className={styles.refreshButton}
                            onClick={handleExecuteReport}
                            disabled={executingReport}
                        >
                            {executingReport ? <span className={styles.buttonInner}><AISpinner /> レポート生成中...</span> : '今すぐレポート実行'}
                        </button>
                    )}
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
