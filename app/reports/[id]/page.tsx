'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/Link'
import { useParams, useRouter } from 'next/navigation'
import BackLink from '@/components/BackLink'
import Loader from '@/components/Loader'
import type { ReportDetail } from './types'
import InfoTooltip from '@/components/InfoTooltip/InfoTooltip'
import styles from './ReportDetailPage.module.css'

export default function ReportDetailPage() {
    const router = useRouter()
    const params = useParams()
    const executionId = params?.id as string
    const [detail, setDetail] = useState<ReportDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const handleRerun = () => {
        if (detail) {
            router.push(`/analytics?executionId=${executionId}`)
        }
    }

    useEffect(() => {
        if (!executionId) {
            setError('実行IDが指定されていません')
            setLoading(false)
            return
        }

        async function fetchDetail() {
            try {
                const response = await fetch(`/api/reports/${executionId}`)
                const data = await response.json()
                
                if (!response.ok) {
                    throw new Error(data.message || data.error || 'レポート詳細の取得に失敗しました')
                }
                
                if (data.error) {
                    throw new Error(data.message || data.error)
                }
                
                if (!data.execution) {
                    throw new Error('レポートデータが見つかりませんでした')
                }
                
                setDetail(data.execution)
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'エラーが発生しました'
                console.error('Detail fetch error:', err)
                setError(errorMessage)
            } finally {
                setLoading(false)
            }
        }

        fetchDetail()
    }, [executionId])

    const formatDate = (dateString: string | null) => {
        if (!dateString) return '-'
        const date = new Date(dateString)
        return date.toLocaleString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        })
    }

    if (loading) {
        return (
            <div className={styles.container}>
                <h1 className={styles.title}>レポート詳細</h1>
                <div className={styles.loaderContainer}>
                    <Loader />
                </div>
            </div>
        )
    }

    if (error || !detail) {
        return (
            <div className={styles.container}>
                <h1 className={styles.title}>レポート詳細</h1>
                <div className={styles.errorContainer}>
                    <p className={styles.errorTitle}>エラーが発生しました</p>
                    <p>{error || 'レポートが見つかりませんでした'}</p>
                    <Link href="/reports/history" className={styles.errorLink}>
                        履歴に戻る
                    </Link>
                </div>
            </div>
        )
    }

    const resultData = detail.resultData || {}
    const cvrResults = resultData.cvrResults || {}
    const abTestEvaluation = resultData.abTestEvaluation || null

    if (!detail.report) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <div className={styles.headerRow}>
                        <h1 className={styles.title}>ABテストレポート</h1>
                        <BackLink href="/reports/history">履歴一覧に戻る</BackLink>
                    </div>
                    <p className={styles.executionDate}>
                        実行日時: {formatDate(detail.createdAt)}
                    </p>
                </div>

                <div className={styles.card}>
                    <h2 className={styles.cardTitle}>基本情報</h2>
                    <div className={styles.infoGrid}>
                        <div>
                            <p className={styles.infoLabel}>ステータス</p>
                            <p className={styles.infoValue}>
                                {detail.status === 'completed' ? '完了' : detail.status === 'failed' ? '失敗' : detail.status}
                            </p>
                        </div>
                        <div>
                            <p className={styles.infoLabel}>開始日時</p>
                            <p className={styles.infoValue}>{formatDate(detail.startedAt)}</p>
                        </div>
                        <div>
                            <p className={styles.infoLabel}>完了日時</p>
                            <p className={styles.infoValue}>{formatDate(detail.completedAt)}</p>
                        </div>
                        <div>
                            <p className={styles.infoLabel}>実行日時</p>
                            <p className={styles.infoValue}>{formatDate(detail.createdAt)}</p>
                        </div>
                    </div>
                    {detail.errorMessage && (
                        <div className={styles.errorMessage}>
                            <p className={styles.errorMessageTitle}>エラーメッセージ</p>
                            <p className={styles.errorMessageText}>{detail.errorMessage}</p>
                        </div>
                    )}
                </div>

                {(cvrResults.dataA || cvrResults.dataB || cvrResults.dataC || cvrResults.dataD) && (
                    <div className={styles.card}>
                        <h2 className={styles.cardTitle}>CVR結果</h2>
                        <div className={styles.cvrGrid}>
                            {cvrResults.dataA && (
                                <div className={styles.cvrCard}>
                                    <h3 className={styles.cvrCardTitle}>パターン A</h3>
                                    <p className={styles.cvrLabel}>PV: {cvrResults.dataA.pv?.toLocaleString() || 0}</p>
                                    <p className={styles.cvrLabel}>CV: {cvrResults.dataA.cv?.toLocaleString() || 0}</p>
                                    <p className={`${styles.cvrValue} ${styles.cvrValueBlue}`}>
                                        CVR: {((cvrResults.dataA.cvr || 0) * 100).toFixed(2)}%
                                    </p>
                                </div>
                            )}
                            {cvrResults.dataB && (
                                <div className={styles.cvrCard}>
                                    <h3 className={styles.cvrCardTitle}>パターン B</h3>
                                    <p className={styles.cvrLabel}>PV: {cvrResults.dataB.pv?.toLocaleString() || 0}</p>
                                    <p className={styles.cvrLabel}>CV: {cvrResults.dataB.cv?.toLocaleString() || 0}</p>
                                    <p className={`${styles.cvrValue} ${styles.cvrValueGreen}`}>
                                        CVR: {((cvrResults.dataB.cvr || 0) * 100).toFixed(2)}%
                                    </p>
                                </div>
                            )}
                            {cvrResults.dataC && (
                                <div className={styles.cvrCard}>
                                    <h3 className={styles.cvrCardTitle}>パターン C</h3>
                                    <p className={styles.cvrLabel}>PV: {cvrResults.dataC.pv?.toLocaleString() || 0}</p>
                                    <p className={styles.cvrLabel}>CV: {cvrResults.dataC.cv?.toLocaleString() || 0}</p>
                                    <p className={`${styles.cvrValue} ${styles.cvrValuePurple}`}>
                                        CVR: {((cvrResults.dataC.cvr || 0) * 100).toFixed(2)}%
                                    </p>
                                </div>
                            )}
                            {cvrResults.dataD && (
                                <div className={styles.cvrCard}>
                                    <h3 className={styles.cvrCardTitle}>パターン D</h3>
                                    <p className={styles.cvrLabel}>PV: {cvrResults.dataD.pv?.toLocaleString() || 0}</p>
                                    <p className={styles.cvrLabel}>CV: {cvrResults.dataD.cv?.toLocaleString() || 0}</p>
                                    <p className={`${styles.cvrValue} ${styles.cvrValueOrange}`}>
                                        CVR: {((cvrResults.dataD.cvr || 0) * 100).toFixed(2)}%
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {abTestEvaluation && (
                    <div className={styles.card}>
                        <h2 className={styles.cardTitle}>ABテスト評価</h2>
                        <div className={styles.evaluationSection}>
                            <div>
                                <p className={styles.evaluationLabel}>総合判定</p>
                                <p className={styles.evaluationValueLarge}>
                                    {abTestEvaluation.recommendation}
                                </p>
                            </div>
                            {abTestEvaluation.checks && (
                                <div className={styles.evaluationSection}>
                                    <div className={styles.evaluationGrid}>
                                        <div>
                                            <p className={styles.evaluationLabel}>統計的有意差<InfoTooltip text="Z検定による有意差検定。信頼水準95%（Z値≥1.96）を超えると「有意差あり」と判定。CVRの差が偶然ではない可能性を示す。" /></p>
                                            <p className={styles.evaluationValue}>
                                                {abTestEvaluation.checks.significance?.passed ? '✅' : '❌'}{' '}
                                                {abTestEvaluation.checks.significance?.value !== undefined
                                                    ? `${abTestEvaluation.checks.significance.value.toFixed(2)}%`
                                                    : 'N/A'}
                                            </p>
                                            {abTestEvaluation.checks.significance?.zScore && (
                                                <p className={styles.evaluationSubtext}>
                                                    Zスコア: {abTestEvaluation.checks.significance.zScore}
                                                </p>
                                            )}
                                        </div>
                                        <div>
                                            <p className={styles.evaluationLabel}>サンプルサイズ（最低PV数）<InfoTooltip text="統計的に信頼できる結果を得るために必要な最低PV数。両バリアントが基準を満たしていると✅となる。" /></p>
                                            <p className={styles.evaluationValue}>
                                                {abTestEvaluation.checks.sampleSize?.passed ? '✅' : '❌'}{' '}
                                                {(() => {
                                                    const pvs = []
                                                    if (abTestEvaluation.checks.sampleSize?.aPV !== undefined) {
                                                        pvs.push(`A: ${abTestEvaluation.checks.sampleSize.aPV.toLocaleString()}`)
                                                    }
                                                    if (abTestEvaluation.checks.sampleSize?.bPV !== undefined) {
                                                        pvs.push(`B: ${abTestEvaluation.checks.sampleSize.bPV.toLocaleString()}`)
                                                    }
                                                    if (abTestEvaluation.checks.sampleSize?.cPV !== undefined) {
                                                        pvs.push(`C: ${abTestEvaluation.checks.sampleSize.cPV.toLocaleString()}`)
                                                    }
                                                    if (abTestEvaluation.checks.sampleSize?.dPV !== undefined) {
                                                        pvs.push(`D: ${abTestEvaluation.checks.sampleSize.dPV.toLocaleString()}`)
                                                    }
                                                    return pvs.length > 0 ? pvs.join(', ') : 'N/A'
                                                })()}
                                            </p>
                                            {abTestEvaluation.checks.sampleSize?.minRequiredPV && (
                                                <p className={styles.evaluationSubtext}>
                                                    最低必要PV: {abTestEvaluation.checks.sampleSize.minRequiredPV.toLocaleString()}
                                                </p>
                                            )}
                                        </div>
                                        <div>
                                            <p className={styles.evaluationLabel}>テスト期間</p>
                                            <p className={styles.evaluationValue}>
                                                {abTestEvaluation.checks.period?.passed ? '✅' : '❌'}{' '}
                                                {abTestEvaluation.checks.period?.days !== undefined
                                                    ? `${abTestEvaluation.checks.period.days}日`
                                                    : 'N/A'}
                                            </p>
                                            {abTestEvaluation.checks.period?.reliabilityLevel && (
                                                <p className={styles.evaluationSubtext}>
                                                    {abTestEvaluation.checks.period.reliabilityIcon} {abTestEvaluation.checks.period.reliabilityLevel}
                                                    {abTestEvaluation.checks.period.reliabilityDescription && ` - ${abTestEvaluation.checks.period.reliabilityDescription}`}
                                                </p>
                                            )}
                                        </div>
                                        <div>
                                            <p className={styles.evaluationLabel}>改善率<InfoTooltip text="(バリアントB CVR − A CVR) ÷ A CVR × 100。バリアントBがAより何%CVRが改善しているかを示す。" /></p>
                                            <p className={styles.evaluationValue}>
                                                {abTestEvaluation.checks.improvement?.passed ? '✅' : '❌'}{' '}
                                                {abTestEvaluation.checks.improvement?.improvementRate !== undefined
                                                    ? `${abTestEvaluation.checks.improvement.improvementRate.toFixed(2)}%`
                                                    : 'N/A'}
                                            </p>
                                            {abTestEvaluation.checks.improvement?.differencePt !== undefined && (
                                                <p className={styles.evaluationSubtext}>
                                                    差分: {abTestEvaluation.checks.improvement.differencePt.toFixed(2)}pt
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                            {abTestEvaluation.aiEvaluation && (
                                <div className={styles.geminiContainer}>
                                    <p className={styles.geminiTitle}>AI評価</p>
                                    <p className={styles.geminiText}>
                                        {abTestEvaluation.aiEvaluation}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className={styles.footer}>
                    <BackLink href="/reports/history">履歴一覧に戻る</BackLink>
                </div>
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.headerRow}>
                    <h1 className={styles.title}>{detail.report.name}</h1>
                    <div className={styles.headerActions}>
                        <BackLink href="/reports/history">履歴一覧に戻る</BackLink>
                        <button onClick={handleRerun} className={styles.rerunButton}>
                            再実行
                        </button>
                    </div>
                </div>
                <p className={styles.executionDate}>
                    実行日時: {formatDate(detail.createdAt)}
                </p>
            </div>

            <div className={styles.card}>
                <h2 className={styles.cardTitle}>基本情報</h2>
                <div className={styles.infoGrid}>
                    <div>
                        <p className={styles.infoLabel}>ステータス</p>
                        <p className={styles.infoValue}>
                            {detail.status === 'completed' ? '完了' : detail.status === 'failed' ? '失敗' : detail.status}
                        </p>
                    </div>
                    <div>
                        <p className={styles.infoLabel}>プロダクト</p>
                        <p className={styles.infoValue}>{detail.report.product?.name || 'N/A'}</p>
                    </div>
                    <div>
                        <p className={styles.infoLabel}>開始日時</p>
                        <p className={styles.infoValue}>{formatDate(detail.startedAt)}</p>
                    </div>
                    <div>
                        <p className={styles.infoLabel}>完了日時</p>
                        <p className={styles.infoValue}>{formatDate(detail.completedAt)}</p>
                    </div>
                </div>
                {detail.errorMessage && (
                    <div className={styles.errorMessage}>
                        <p className={styles.errorMessageTitle}>エラーメッセージ</p>
                        <p className={styles.errorMessageText}>{detail.errorMessage}</p>
                    </div>
                )}
            </div>

            {((cvrResults.dataA && (cvrResults.dataA.pv !== undefined || cvrResults.dataA.cv !== undefined)) ||
                (cvrResults.dataB && (cvrResults.dataB.pv !== undefined || cvrResults.dataB.cv !== undefined)) ||
                (cvrResults.dataC && (cvrResults.dataC.pv !== undefined || cvrResults.dataC.cv !== undefined)) ||
                (cvrResults.dataD && (cvrResults.dataD.pv !== undefined || cvrResults.dataD.cv !== undefined))) && (
                <div className={styles.card}>
                    <h2 className={styles.cardTitle}>CVR結果</h2>
                    <div className={styles.cvrGrid}>
                        {cvrResults.dataA && (
                            <div className={styles.cvrCard}>
                                <h3 className={styles.cvrCardTitle}>パターン A</h3>
                                <p className={styles.cvrLabel}>PV: {cvrResults.dataA.pv?.toLocaleString() || 0}</p>
                                <p className={styles.cvrLabel}>CV: {cvrResults.dataA.cv?.toLocaleString() || 0}</p>
                                <p className={`${styles.cvrValue} ${styles.cvrValueBlue}`}>
                                    CVR: {((cvrResults.dataA.cvr || 0) * 100).toFixed(2)}%
                                </p>
                            </div>
                        )}
                        {cvrResults.dataB && (
                            <div className={styles.cvrCard}>
                                <h3 className={styles.cvrCardTitle}>パターン B</h3>
                                <p className={styles.cvrLabel}>PV: {cvrResults.dataB.pv?.toLocaleString() || 0}</p>
                                <p className={styles.cvrLabel}>CV: {cvrResults.dataB.cv?.toLocaleString() || 0}</p>
                                <p className={`${styles.cvrValue} ${styles.cvrValueGreen}`}>
                                    CVR: {((cvrResults.dataB.cvr || 0) * 100).toFixed(2)}%
                                </p>
                            </div>
                        )}
                        {cvrResults.dataC && (
                            <div className={styles.cvrCard}>
                                <h3 className={styles.cvrCardTitle}>パターン C</h3>
                                <p className={styles.cvrLabel}>PV: {cvrResults.dataC.pv?.toLocaleString() || 0}</p>
                                <p className={styles.cvrLabel}>CV: {cvrResults.dataC.cv?.toLocaleString() || 0}</p>
                                <p className={`${styles.cvrValue} ${styles.cvrValuePurple}`}>
                                    CVR: {((cvrResults.dataC.cvr || 0) * 100).toFixed(2)}%
                                </p>
                            </div>
                        )}
                        {cvrResults.dataD && (
                            <div className={styles.cvrCard}>
                                <h3 className={styles.cvrCardTitle}>パターン D</h3>
                                <p className={styles.cvrLabel}>PV: {cvrResults.dataD.pv?.toLocaleString() || 0}</p>
                                <p className={styles.cvrLabel}>CV: {cvrResults.dataD.cv?.toLocaleString() || 0}</p>
                                <p className={`${styles.cvrValue} ${styles.cvrValueOrange}`}>
                                    CVR: {((cvrResults.dataD.cvr || 0) * 100).toFixed(2)}%
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {abTestEvaluation && (
                <div className={styles.card}>
                    <h2 className={styles.cardTitle}>ABテスト評価</h2>
                    <div className={styles.evaluationSection}>
                        <div>
                            <p className={styles.evaluationLabel}>総合判定</p>
                            <p className={styles.evaluationValueLarge}>
                                {abTestEvaluation.recommendation}
                            </p>
                        </div>
                        {abTestEvaluation.checks && (
                            <div className={styles.evaluationSection}>
                                <div className={styles.evaluationGrid}>
                                    <div>
                                        <p className={styles.evaluationLabel}>統計的有意差</p>
                                        <p className={styles.evaluationValue}>
                                            {abTestEvaluation.checks.significance?.passed ? '✅' : '❌'}{' '}
                                            {abTestEvaluation.checks.significance?.value !== undefined
                                                ? `${abTestEvaluation.checks.significance.value.toFixed(2)}%`
                                                : 'N/A'}
                                        </p>
                                        {abTestEvaluation.checks.significance?.zScore && (
                                            <p className={styles.evaluationSubtext}>
                                                Zスコア: {abTestEvaluation.checks.significance.zScore}
                                            </p>
                                        )}
                                    </div>
                                    <div>
                                        <p className={styles.evaluationLabel}>サンプルサイズ（最低PV数）</p>
                                        <p className={styles.evaluationValue}>
                                            {abTestEvaluation.checks.sampleSize?.passed ? '✅' : '❌'}{' '}
                                            {(() => {
                                                const pvs = []
                                                if (abTestEvaluation.checks.sampleSize?.aPV !== undefined) {
                                                    pvs.push(`A: ${abTestEvaluation.checks.sampleSize.aPV.toLocaleString()}`)
                                                }
                                                if (abTestEvaluation.checks.sampleSize?.bPV !== undefined) {
                                                    pvs.push(`B: ${abTestEvaluation.checks.sampleSize.bPV.toLocaleString()}`)
                                                }
                                                if (abTestEvaluation.checks.sampleSize?.cPV !== undefined) {
                                                    pvs.push(`C: ${abTestEvaluation.checks.sampleSize.cPV.toLocaleString()}`)
                                                }
                                                if (abTestEvaluation.checks.sampleSize?.dPV !== undefined) {
                                                    pvs.push(`D: ${abTestEvaluation.checks.sampleSize.dPV.toLocaleString()}`)
                                                }
                                                return pvs.length > 0 ? pvs.join(', ') : 'N/A'
                                            })()}
                                        </p>
                                        {abTestEvaluation.checks.sampleSize?.minRequiredPV && (
                                            <p className={styles.evaluationSubtext}>
                                                最低必要PV: {abTestEvaluation.checks.sampleSize.minRequiredPV.toLocaleString()}
                                            </p>
                                        )}
                                    </div>
                                    <div>
                                        <p className={styles.evaluationLabel}>テスト期間</p>
                                        <p className={styles.evaluationValue}>
                                            {abTestEvaluation.checks.period?.passed ? '✅' : '❌'}{' '}
                                            {abTestEvaluation.checks.period?.days !== undefined
                                                ? `${abTestEvaluation.checks.period.days}日`
                                                : 'N/A'}
                                        </p>
                                        {abTestEvaluation.checks.period?.reliabilityLevel && (
                                            <p className={styles.evaluationSubtext}>
                                                {abTestEvaluation.checks.period.reliabilityIcon} {abTestEvaluation.checks.period.reliabilityLevel}
                                                {abTestEvaluation.checks.period.reliabilityDescription && ` - ${abTestEvaluation.checks.period.reliabilityDescription}`}
                                            </p>
                                        )}
                                    </div>
                                    <div>
                                        <p className={styles.evaluationLabel}>改善率</p>
                                        <p className={styles.evaluationValue}>
                                            {abTestEvaluation.checks.improvement?.passed ? '✅' : '❌'}{' '}
                                            {abTestEvaluation.checks.improvement?.improvementRate !== undefined
                                                ? `${abTestEvaluation.checks.improvement.improvementRate.toFixed(2)}%`
                                                : 'N/A'}
                                        </p>
                                        {abTestEvaluation.checks.improvement?.differencePt !== undefined && (
                                            <p className={styles.evaluationSubtext}>
                                                差分: {abTestEvaluation.checks.improvement.differencePt.toFixed(2)}pt
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                        {abTestEvaluation.aiEvaluation && (
                            <div className={styles.geminiContainer}>
                                <p className={styles.geminiTitle}>AI評価</p>
                                <p className={styles.geminiText}>
                                    {abTestEvaluation.aiEvaluation}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className={styles.card}>
                <h2 className={styles.cardTitle}>設定情報</h2>
                <div className={styles.configContainer}>
                    <pre className={styles.configPre}>
                        {JSON.stringify(detail.report.config, null, 2)}
                    </pre>
                </div>
            </div>

            <div className={styles.footer}>
                <BackLink href="/reports/history">履歴一覧に戻る</BackLink>
            </div>
        </div>
    )
}
