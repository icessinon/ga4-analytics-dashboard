'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/Link'
import { useParams, useRouter } from 'next/navigation'
import BackLink from '@/components/BackLink'
import Loader from '@/components/Loader'
import FunnelChart from '@/components/funnel/FunnelChart'
import ConversionRateChart from '@/components/funnel/ConversionRateChart'
import DropoffRateChart from '@/components/funnel/DropoffRateChart'
import ComparisonCharts from '@/components/funnel/ComparisonCharts'
import ComparisonTable from '@/components/funnel/ComparisonTable'
import ViewModeTabs from './components/ViewModeTabs'
import PeriodSelector from './components/PeriodSelector'
import ComparisonSummary from './components/ComparisonSummary'
import type {
    FunnelData,
    ComparisonData,
    FunnelExecution,
    ViewMode,
} from './types'
import {
    translateErrorMessage,
    getMaxDropoffStep,
    formatDate,
    hasComparisonData,
    getPeriodsFromComparisonData,
    extractFunnelDataFromPeriod,
} from './utils'
import styles from './FunnelExecutionDetailPage.module.css'

export default function FunnelExecutionDetailPage() {
    const router = useRouter()
    const params = useParams()
    const executionId = (params?.executionId || params?.id) as string
    const [execution, setExecution] = useState<FunnelExecution | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [viewMode, setViewMode] = useState<ViewMode>('single')
    const [selectedPeriod, setSelectedPeriod] = useState<string>('0')

    useEffect(() => {
        if (!executionId) {
            setError('実行IDが指定されていません')
            setLoading(false)
            return
        }

        async function fetchDetail() {
            try {
                const response = await fetch(`/api/funnel/executions/${executionId}`)
                const data = await response.json()

                if (!response.ok || data.error) {
                    const errorMsg = data.message || data.error || 'ファネル実行詳細の取得に失敗しました'
                    throw new Error(translateErrorMessage(errorMsg))
                }

                if (!data.execution) {
                    throw new Error('ファネル実行データが見つかりませんでした')
                }

                setExecution(data.execution)
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'エラーが発生しました'
                setError(errorMessage)
            } finally {
                setLoading(false)
            }
        }

        fetchDetail()
    }, [executionId])

    useEffect(() => {
        if (!execution?.resultData) return

        const resultData = execution.resultData
        const hasComparison = resultData && (
            ('periods' in resultData && Array.isArray((resultData as any).periods) && (resultData as any).periods.length > 1) ||
            ('periodA' in resultData && 'periodB' in resultData)
        )

        if (hasComparison) {
            setViewMode('compare')
            setSelectedPeriod('0')
        } else {
            setViewMode('single')
        }
    }, [execution])

    const handleRerun = () => {
        if (execution) {
            router.push(`/funnel?executionId=${executionId}&mode=${viewMode}`)
        }
    }

    const handlePrint = () => {
        window.print()
    }

    if (loading) {
        return (
            <div className={styles.container}>
                <h1 className={styles.title}>ファネル実行詳細</h1>
                <div className={styles.loaderContainer}>
                    <Loader />
                </div>
            </div>
        )
    }

    if (error || !execution) {
        return (
            <div className={styles.container}>
                <h1 className={styles.title}>ファネル実行詳細</h1>
                <div className={styles.errorContainer}>
                    <p className={styles.errorTitle}>エラーが発生しました</p>
                    <p>{error || 'ファネル実行が見つかりませんでした'}</p>
                    <Link href="/funnel/history" className={styles.errorLink}>
                        履歴に戻る
                    </Link>
                </div>
            </div>
        )
    }

    const resultData = execution.resultData
    const hasComparison = hasComparisonData(resultData)
    const hasSingle = resultData && !hasComparison
    
    const comparisonData = hasComparison ? (resultData as ComparisonData) : null
    const funnelData = hasSingle ? (resultData as FunnelData) : null
    const periods = getPeriodsFromComparisonData(comparisonData)
    
    const periodFunnelDataMap: { [key: string]: FunnelData } = {}
    periods.forEach((period, index) => {
        periodFunnelDataMap[index.toString()] = extractFunnelDataFromPeriod(period, execution.geminiEvaluation)
    })
    
    const periodAFunnelData = comparisonData?.periodA 
        ? extractFunnelDataFromPeriod(comparisonData.periodA, execution.geminiEvaluation)
        : null
    
    const periodBFunnelData = comparisonData?.periodB 
        ? extractFunnelDataFromPeriod(comparisonData.periodB, execution.geminiEvaluation)
        : null
    
    const displaySingleData = funnelData || 
        periodFunnelDataMap[selectedPeriod] || 
        (selectedPeriod === 'A' ? periodAFunnelData : selectedPeriod === 'B' ? periodBFunnelData : null)

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.headerRow}>
                    <h1 className={styles.title}>{execution.name || 'ファネル分析'}</h1>
                    <div className={styles.headerActions}>
                        <BackLink href="/funnel/history">履歴一覧に戻る</BackLink>
                        <button onClick={handlePrint} className={styles.pdfButton}>
                            PDFで書き出し
                        </button>
                        <button onClick={handleRerun} className={styles.rerunButton}>
                            この設定で再実行
                        </button>
                    </div>
                </div>
                <p className={styles.executionDate}>
                    実行日時: {formatDate(execution.createdAt)}
                </p>
            </div>

            <div className={styles.card}>
                <h2 className={styles.cardTitle}>基本情報</h2>
                <div className={styles.infoGrid}>
                    <div>
                        <p className={styles.infoLabel}>ステータス</p>
                        <p className={styles.infoValue}>
                            {execution.status === 'completed' ? '完了' : execution.status === 'failed' ? '失敗' : execution.status}
                        </p>
                    </div>
                    <div>
                        <p className={styles.infoLabel}>プロダクト</p>
                        <p className={styles.infoValue}>{execution.productName}</p>
                    </div>
                    <div>
                        <p className={styles.infoLabel}>期間</p>
                        <p className={styles.infoValue}>
                            {new Date(execution.startDate).toLocaleDateString('ja-JP')} - {new Date(execution.endDate).toLocaleDateString('ja-JP')}
                        </p>
                    </div>
                </div>
                {execution.errorMessage && (
                    <div className={styles.errorMessage}>
                        <p className={styles.errorMessageTitle}>エラーメッセージ:</p>
                        <p className={styles.errorMessageText}>
                            {execution.errorMessage}
                        </p>
                    </div>
                )}
            </div>

            {hasComparison && (
                <ViewModeTabs viewMode={viewMode} onViewModeChange={setViewMode} />
            )}

            {viewMode === 'compare' && comparisonData && periods.length > 0 ? (
                <>
                    <ComparisonSummary periods={periods} />

                    <div className={styles.card}>
                        <ComparisonCharts
                            periods={periods}
                            periodA={comparisonData.periodA}
                            periodB={comparisonData.periodB}
                        />
                    </div>

                    <div className={styles.card}>
                        <h2 className={styles.cardTitle}>詳細比較テーブル</h2>
                        <ComparisonTable
                            comparison={comparisonData.comparison}
                            periods={periods}
                            periodALabel={comparisonData.periodA?.label}
                            periodBLabel={comparisonData.periodB?.label}
                        />
                    </div>

                    {(comparisonData.geminiEvaluation || execution.geminiEvaluation) && (
                        <div className={styles.card}>
                            <h2 className={styles.cardTitle}>Gemini評価（期間比較分析）</h2>
                            <div className={styles.geminiContainer}>
                                <p className={styles.geminiText}>
                                    {comparisonData.geminiEvaluation || execution.geminiEvaluation}
                                </p>
                            </div>
                        </div>
                    )}
                </>
            ) : viewMode === 'single' && (funnelData || displaySingleData) ? (
                <>
                    {comparisonData && !funnelData && viewMode === 'single' && periods.length > 0 && (
                        <PeriodSelector
                            periods={periods}
                            selectedPeriod={selectedPeriod}
                            onPeriodSelect={setSelectedPeriod}
                            comparisonData={comparisonData}
                        />
                    )}
                    
                    {(() => {
                        if (!displaySingleData) return null
                        
                        return (
                            <>
                                <div className={styles.card}>
                                    <h2 className={styles.cardTitle}>サマリー</h2>
                                    <div className={styles.summaryGrid}>
                                        <div>
                                            <p className={styles.summaryLabel}>総エントリー数</p>
                                            <p className={`${styles.summaryValue} ${styles.summaryValueBlue}`}>
                                                {displaySingleData.totalUsers.toLocaleString()} 人
                                            </p>
                                        </div>
                                        <div>
                                            <p className={styles.summaryLabel}>最終ステップ到達数</p>
                                            <p className={`${styles.summaryValue} ${styles.summaryValueGreen}`}>
                                                {displaySingleData.steps[displaySingleData.steps.length - 1]?.users.toLocaleString() || 0} 人
                                            </p>
                                        </div>
                                        <div>
                                            <p className={styles.summaryLabel}>全体コンバージョン率</p>
                                            <p className={`${styles.summaryValue} ${styles.summaryValuePurple}`}>
                                                {((displaySingleData.steps[displaySingleData.steps.length - 1]?.conversionRate || 0) * 100).toFixed(2)}%
                                            </p>
                                        </div>
                                        <div>
                                            <p className={styles.summaryLabel}>最大離脱ステップ</p>
                                            <p className={`${styles.summaryValue} ${styles.summaryValueRed}`}>
                                                {getMaxDropoffStep(displaySingleData.steps)}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.card}>
                                    <h2 className={styles.cardTitle}>ファネルチャート</h2>
                                    <FunnelChart data={displaySingleData.steps} />
                                </div>

                                <div className={styles.card}>
                                    <h2 className={styles.cardTitle}>コンバージョン率グラフ</h2>
                                    <ConversionRateChart data={displaySingleData.steps} />
                                </div>

                                <div className={styles.card}>
                                    <h2 className={styles.cardTitle}>ドロップオフ率グラフ</h2>
                                    <DropoffRateChart data={displaySingleData.steps} />
                                </div>

                                {(displaySingleData.geminiEvaluation || execution.geminiEvaluation) && (
                                    <div className={styles.card}>
                                        <h2 className={styles.cardTitle}>Gemini評価</h2>
                                        <div className={styles.geminiContainer}>
                                            <p className={styles.geminiText}>
                                                {displaySingleData.geminiEvaluation || execution.geminiEvaluation}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <div className={styles.card}>
                                    <h2 className={styles.cardTitle}>詳細データ</h2>
                                    <div className={styles.tableContainer}>
                                        <table className={styles.table}>
                                            <thead className={styles.tableHeader}>
                                                <tr>
                                                    <th className={`${styles.tableHeaderCell}`}>ステップ</th>
                                                    <th className={`${styles.tableHeaderCell}`}>カスタムイベントラベル</th>
                                                    <th className={`${styles.tableHeaderCell} ${styles.tableHeaderCellRight}`}>ユーザー数</th>
                                                    <th className={`${styles.tableHeaderCell} ${styles.tableHeaderCellRight}`}>クリック数</th>
                                                    <th className={`${styles.tableHeaderCell} ${styles.tableHeaderCellRight}`}>ビュー数</th>
                                                    <th className={`${styles.tableHeaderCell} ${styles.tableHeaderCellRight}`}>コンバージョン率</th>
                                                    <th className={`${styles.tableHeaderCell} ${styles.tableHeaderCellRight}`}>ドロップオフ率</th>
                                                    <th className={`${styles.tableHeaderCell} ${styles.tableHeaderCellRight}`}>継続率</th>
                                                </tr>
                                            </thead>
                                            <tbody className={styles.tableBody}>
                                                {displaySingleData.steps.map((step, index) => {
                                                    const continuationRate = index > 0 ? 1 - step.dropoffRate : 1
                                                    return (
                                                        <tr key={index} className={styles.tableRow}>
                                                            <td className={styles.tableCell}>{step.stepName}</td>
                                                            <td className={styles.tableCell}>{step.customEventLabel}</td>
                                                            <td className={`${styles.tableCell} ${styles.tableCellRight}`}>
                                                                {step.users.toLocaleString()}
                                                            </td>
                                                            <td className={`${styles.tableCell} ${styles.tableCellRight}`}>
                                                                {step.clickUsers.toLocaleString()}
                                                            </td>
                                                            <td className={`${styles.tableCell} ${styles.tableCellRight}`}>
                                                                {step.viewUsers.toLocaleString()}
                                                            </td>
                                                            <td className={`${styles.tableCell} ${styles.tableCellRight}`}>
                                                                {(step.conversionRate * 100).toFixed(2)}%
                                                            </td>
                                                            <td className={`${styles.tableCell} ${styles.tableCellRight}`}>
                                                                {(step.dropoffRate * 100).toFixed(2)}%
                                                            </td>
                                                            <td className={`${styles.tableCell} ${styles.tableCellRight}`}>
                                                                {(continuationRate * 100).toFixed(2)}%
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        )
                    })()}
                </>
            ) : null}

            <div className={styles.footer}>
                <BackLink href="/funnel/history">履歴一覧に戻る</BackLink>
            </div>
        </div>
    )
}
