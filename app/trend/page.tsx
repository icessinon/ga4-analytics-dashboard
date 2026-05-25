'use client'

import { useState, useEffect } from 'react'
import BackLink from '@/components/BackLink'
import CustomSelect from '@/components/CustomSelect'
import Loader from '@/components/Loader'
import NeonCheckbox from '@/components/NeonCheckbox'
import { useProduct } from '@/lib/contexts/ProductContext'
import TrendChart from '@/components/trend/TrendChart'
import type { Report, WeeklyResult, TrendData } from './types'
import styles from './TrendPage.module.css'

export default function TrendPage() {
    const { currentProduct } = useProduct()
    const [loading, setLoading] = useState(false)
    const [trendData, setTrendData] = useState<TrendData[] | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [accessToken, setAccessToken] = useState<string>('')
    const [reports, setReports] = useState<Report[]>([])
    const [selectedReportIds, setSelectedReportIds] = useState<number[]>([])
    const [loadingReports, setLoadingReports] = useState(true)
    const [searchQuery, setSearchQuery] = useState<string>('')
    const [currentPage, setCurrentPage] = useState<number>(1)
    const itemsPerPage = 5
    const [startMonth, setStartMonth] = useState<string>(() => {
        const now = new Date()
        const year = now.getFullYear()
        const month = String(now.getMonth() + 1).padStart(2, '0')
        return `${year}-${month}`
    })
    const [endMonth, setEndMonth] = useState<string>(() => {
        const now = new Date()
        const year = now.getFullYear()
        const month = String(now.getMonth() + 1).padStart(2, '0')
        return `${year}-${month}`
    })
    const [showAiAnalysis, setShowAiAnalysis] = useState(false)
    const [aiSummary, setAiSummary] = useState<string | null>(null)
    const [aiSummaryLoading, setAiSummaryLoading] = useState(false)
    const [selectedViewMonth, setSelectedViewMonth] = useState<string>('all')

    useEffect(() => {
        if (currentProduct) {
            fetchReports()
        }
    }, [currentProduct])

    const fetchReports = async () => {
        if (!currentProduct) return

        setLoadingReports(true)
        try {
            const response = await fetch(`/api/reports?productId=${currentProduct.id}&isActive=true`)
            const data = await response.json()

            if (data.success) {
                setReports(data.reports || [])
                const trendReportIds = data.reports
                    .filter((r: Report) => r.executionMode === 'trend')
                    .map((r: Report) => r.id)
                setSelectedReportIds(trendReportIds)
            }
        } catch (err) {
            console.error('Failed to fetch reports:', err)
        } finally {
            setLoadingReports(false)
        }
    }

    const handleReportToggle = async (reportId: number) => {
        const isSelected = selectedReportIds.includes(reportId)
        const newExecutionMode = isSelected ? null : 'trend'

        try {
            const response = await fetch(`/api/reports/${reportId}/execution-mode`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ executionMode: newExecutionMode }),
            })

            if (response.ok) {
                if (isSelected) {
                    setSelectedReportIds(selectedReportIds.filter(id => id !== reportId))
                } else {
                    setSelectedReportIds([...selectedReportIds, reportId])
                }

                await fetchReports()
            } else {
                const data = await response.json()
                throw new Error(data.error || 'レポートの設定に失敗しました')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'エラーが発生しました')
        }
    }

    const handleStartMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value
        setStartMonth(value)
        if (value > endMonth) {
            setEndMonth(value)
        }
    }

    const handleEndMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value
        setEndMonth(value)
        if (value < startMonth) {
            setStartMonth(value)
        }
    }

    const getMonthsBetween = (start: string, end: string): string[] => {
        const months: string[] = []
        const [startYear, startMonth] = start.split('-').map(Number)
        const [endYear, endMonth] = end.split('-').map(Number)
        
        let currentYear = startYear
        let currentMonth = startMonth
        
        while (
            currentYear < endYear ||
            (currentYear === endYear && currentMonth <= endMonth)
        ) {
            months.push(`${currentYear}-${String(currentMonth).padStart(2, '0')}`)
            currentMonth++
            if (currentMonth > 12) {
                currentMonth = 1
                currentYear++
            }
        }
        
        return months
    }

    const filteredReports = reports.filter((report) => {
        if (!searchQuery) return true
        const query = searchQuery.toLowerCase()
        return (
            report.name.toLowerCase().includes(query) ||
            (report.cvrA?.denominatorLabels.some(label => label.toLowerCase().includes(query))) ||
            (report.cvrA?.numeratorLabels.some(label => label.toLowerCase().includes(query)))
        )
    })

    const totalPages = Math.ceil(filteredReports.length / itemsPerPage)
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    const paginatedReports = filteredReports.slice(startIndex, endIndex)

    useEffect(() => {
        setCurrentPage(1)
    }, [searchQuery])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            if (!currentProduct) {
                throw new Error('プロダクトが選択されていません')
            }

            if (!/^\d{4}-\d{2}$/.test(startMonth) || !/^\d{4}-\d{2}$/.test(endMonth)) {
                throw new Error('月はYYYY-MM形式で入力してください')
            }

            if (startMonth > endMonth) {
                throw new Error('開始月は終了月より前である必要があります')
            }

            const months = getMonthsBetween(startMonth, endMonth)
            const allTrendData: TrendData[] = []

            for (const month of months) {
                const response = await fetch('/api/trend/monthly', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        productId: currentProduct.id,
                        month,
                        accessToken: accessToken || undefined,
                    }),
                })

                const result = await response.json()

                if (!response.ok) {
                    const errorMessage = result.error || result.message || `月次トレンドレポートの生成に失敗しました（${month}）`
                    console.error(`Trend report error for ${month}:`, errorMessage)
                    continue
                }

                if (result.trendData && result.trendData.length > 0) {
                    const monthTrendData = result.trendData.map((data: any) => ({
                        ...data,
                        month,
                    }))
                    allTrendData.push(...monthTrendData)
                }
            }

            if (allTrendData.length === 0) {
                setError('トレンド対象のレポートが見つかりませんでした。下記からレポートを選択してください。')
                setTrendData([])
                return
            }

            setTrendData(allTrendData)
            setAiSummary(null)
            setSelectedViewMonth('all')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'エラーが発生しました')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (!showAiAnalysis || !trendData || trendData.length === 0) return
        if (aiSummary !== null) return

        let cancelled = false
        setAiSummaryLoading(true)
        fetch('/api/trend/summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                trendData,
                startMonth,
                endMonth,
            }),
        })
            .then((res) => res.json())
            .then((data) => {
                if (cancelled) return
                if (data.success && data.summary) setAiSummary(data.summary)
                else setAiSummary(data.error || 'AI分析の取得に失敗しました')
            })
            .catch(() => {
                if (!cancelled) setAiSummary('AI分析の取得に失敗しました')
            })
            .finally(() => {
                if (!cancelled) setAiSummaryLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [showAiAnalysis, trendData, startMonth, endMonth])

    if (loading && !trendData) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h1 className={styles.title}>月次トレンドレポート</h1>
                    <BackLink href="/">ダッシュボードに戻る</BackLink>
                </div>
                <div className={styles.loaderContainer}>
                    <div style={{ textAlign: 'center' }}>
                        <Loader />
                        <p className={styles.loaderText}>月次トレンドレポートを生成中...</p>
                    </div>
                </div>
            </div>
        )
    }

    if (!currentProduct) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h1 className={styles.title}>月次トレンドレポート</h1>
                    <BackLink href="/">ダッシュボードに戻る</BackLink>
                </div>
                <div className={styles.errorContainer}>
                    <p className={styles.errorText}>プロダクトが選択されていません</p>
                </div>
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>月次トレンドレポート</h1>
                <BackLink href="/">ダッシュボードに戻る</BackLink>
            </div>

            <div className={styles.formContainer}>
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>トレンド対象レポートの選択</h2>
                    
                    {!loadingReports && reports.length > 0 && (
                        <div className={styles.searchContainer}>
                            <input
                                type="text"
                                placeholder="レポート名、PVラベル、CVラベルで検索..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className={styles.searchInput}
                            />
                        </div>
                    )}

                    {loadingReports ? (
                        <div className={styles.loaderContainer}>
                            <Loader />
                        </div>
                    ) : reports.length === 0 ? (
                        <p className={styles.emptyText}>レポートが見つかりませんでした</p>
                    ) : filteredReports.length === 0 ? (
                        <p className={styles.emptyText}>検索条件に一致するレポートが見つかりませんでした</p>
                    ) : (
                        <>
                            <div className={styles.reportList}>
                                {paginatedReports.map((report) => (
                                <div key={report.id} className={styles.reportItem}>
                                    <NeonCheckbox
                                        checked={selectedReportIds.includes(report.id)}
                                        onChange={() => handleReportToggle(report.id)}
                                        className={styles.reportItemLabel}
                                    >
                                        <span className={styles.reportName}>{report.name}</span>
                                        {report.executionMode === 'trend' && (
                                            <span className={styles.trendBadge}>トレンド対象</span>
                                        )}
                                    </NeonCheckbox>
                                    {report.cvrA && (
                                        <div className={styles.cvrInfo}>
                                            <div className={styles.cvrLabel}>
                                                <span className={styles.cvrLabelTitle}>PVラベル:</span>
                                                <span className={styles.cvrLabelValue}>
                                                    {report.cvrA.denominatorLabels.join(', ') || '未設定'}
                                                </span>
                                            </div>
                                            <div className={styles.cvrLabel}>
                                                <span className={styles.cvrLabelTitle}>CVラベル:</span>
                                                <span className={styles.cvrLabelValue}>
                                                    {report.cvrA.numeratorLabels.join(', ') || '未設定'}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                    {!report.cvrA && (
                                        <div className={styles.cvrInfo}>
                                            <span className={styles.noCvrConfig}>CVR設定なし</span>
                                        </div>
                                    )}
                                </div>
                                ))}
                            </div>

                            {totalPages > 1 && (
                                <div className={styles.pagination}>
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={currentPage === 1}
                                        className={styles.paginationButton}
                                    >
                                        前へ
                                    </button>
                                    <span className={styles.paginationInfo}>
                                        {currentPage} / {totalPages} ページ
                                        ({filteredReports.length}件中 {startIndex + 1}-{Math.min(endIndex, filteredReports.length)}件を表示)
                                    </span>
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                        disabled={currentPage === totalPages}
                                        className={styles.paginationButton}
                                    >
                                        次へ
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                    <p className={styles.helpText}>
                        チェックを入れたレポートが月次トレンドレポートの集計対象になります
                    </p>
                </div>

                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.formGroup}>
                        <label htmlFor="startMonth" className={styles.label}>
                            開始月
                        </label>
                        <input
                            type="month"
                            id="startMonth"
                            value={startMonth}
                            onChange={handleStartMonthChange}
                            className={styles.input}
                            required
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="endMonth" className={styles.label}>
                            終了月
                        </label>
                        <input
                            type="month"
                            id="endMonth"
                            value={endMonth}
                            onChange={handleEndMonthChange}
                            className={styles.input}
                            required
                        />
                        <p className={styles.helpText}>
                            開始月から終了月までの期間を集計します（複数月の比較が可能です）
                        </p>
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="accessToken" className={styles.label}>
                            GA4アクセストークン（オプション）
                        </label>
                        <input
                            type="text"
                            id="accessToken"
                            value={accessToken}
                            onChange={(e) => setAccessToken(e.target.value)}
                            placeholder="環境変数が設定されている場合は不要"
                            className={styles.input}
                        />
                        <p className={styles.helpText}>
                            環境変数にGA4認証情報が設定されていない場合のみ入力してください
                        </p>
                    </div>

                    <div className={styles.formGroup}>
                        <NeonCheckbox
                            checked={showAiAnalysis}
                            onChange={setShowAiAnalysis}
                        >
                            <span>AI分析を表示する（セッション時間・月による傾向で回答）</span>
                        </NeonCheckbox>
                        <p className={styles.helpText}>
                            チェックを付けたときだけ、セッション時間と月による傾向を中心にしたAI分析が表示されます
                        </p>
                    </div>

                    <div className={styles.formGroup}>
                        <button type="submit" className="executionButton" disabled={loading}>
                            <span>{loading ? '生成中...' : '月次トレンドレポートを生成'}</span>
                        </button>
                    </div>
                </form>
            </div>

            {error && (
                <div className={styles.errorContainer}>
                    <p className={styles.errorText}>{error}</p>
                </div>
            )}

            {trendData && trendData.length > 0 && (
                <div className={styles.resultsContainer}>
                    <div className={styles.resultsHeader}>
                        <h2 className={styles.resultsTitle}>
                            {startMonth === endMonth 
                                ? `${startMonth}のトレンドレポート`
                                : `${startMonth} 〜 ${endMonth}のトレンドレポート`
                            }
                        </h2>
                        {(() => {
                            const months = Array.from(new Set(trendData.map((d) => d.month))).sort()
                            if (months.length <= 1) return null
                            return (
                                <div className={styles.monthSwitcher}>
                                    <label htmlFor="viewMonth" className={styles.monthSwitcherLabel}>表示月:</label>
                                    <CustomSelect
                                        value={selectedViewMonth}
                                        onChange={setSelectedViewMonth}
                                        options={[{ value: 'all', label: 'すべての月' }, ...months.map((m) => ({ value: m, label: m }))]}
                                        triggerClassName={styles.monthSwitcherSelect}
                                        aria-label="表示月"
                                    />
                                </div>
                            )
                        })()}
                    </div>
                    {(() => {
                        const reportGroups = new Map<number, Map<string, TrendData[]>>()
                        trendData.forEach((data) => {
                            if (!reportGroups.has(data.reportId)) {
                                reportGroups.set(data.reportId, new Map())
                            }
                            const monthMap = reportGroups.get(data.reportId)!
                            if (!monthMap.has(data.month)) {
                                monthMap.set(data.month, [])
                            }
                            monthMap.get(data.month)!.push(data)
                        })

                        return Array.from(reportGroups.entries()).map(([reportId, monthMap]) => {
                            const useMonth = selectedViewMonth !== 'all' && monthMap.has(selectedViewMonth)
                                ? selectedViewMonth
                                : null
                            const firstData = useMonth
                                ? monthMap.get(useMonth)?.[0]
                                : Array.from(monthMap.values())[0]?.[0]
                            if (!firstData) return null

                            let allWeeklyResults: WeeklyResult[] = []
                            let monthlyDataList: Array<{ month: string; pv: number; cv: number; cvr: number }> = []
                            if (useMonth) {
                                const monthData = monthMap.get(useMonth)![0]
                                allWeeklyResults = monthData.weeklyResults
                                monthlyDataList = [{
                                    month: useMonth,
                                    pv: monthData.monthlyTotal.pv,
                                    cv: monthData.monthlyTotal.cv,
                                    cvr: monthData.monthlyTotal.cvr,
                                }]
                            } else {
                                Array.from(monthMap.entries()).forEach(([, monthData]) => {
                                    const data = monthData[0]
                                    allWeeklyResults.push(...data.weeklyResults)
                                    monthlyDataList.push({
                                        month: data.month,
                                        pv: data.monthlyTotal.pv,
                                        cv: data.monthlyTotal.cv,
                                        cvr: data.monthlyTotal.cvr,
                                    })
                                })
                            }

                            const totalMonthly = monthlyDataList.reduce(
                                (acc, data) => ({
                                    pv: acc.pv + data.pv,
                                    cv: acc.cv + data.cv,
                                }),
                                { pv: 0, cv: 0 }
                            )
                            const totalCVR = totalMonthly.pv > 0 ? totalMonthly.cv / totalMonthly.pv : 0

                            return (
                                <div key={reportId} className={styles.reportGroup}>
                                    <h3 className={styles.reportGroupTitle}>{firstData.reportName}</h3>
                                    <TrendChart
                                        reportName={firstData.reportName}
                                        weeklyResults={allWeeklyResults}
                                        monthlyTotal={{
                                            pv: totalMonthly.pv,
                                            cv: totalMonthly.cv,
                                            cvr: totalCVR,
                                        }}
                                        monthlyData={monthlyDataList}
                                    />
                                </div>
                            )
                        })
                    })()}

                    {showAiAnalysis && (aiSummaryLoading || aiSummary) && (
                        <div className={styles.aiSummarySection}>
                            <h3 className={styles.aiSummaryTitle}>AI分析</h3>
                            {aiSummaryLoading ? (
                                <div className={styles.aiSummaryLoading}>
                                    <Loader />
                                    <span>分析中...</span>
                                </div>
                            ) : (
                                <div className={styles.aiSummaryBox}>
                                    {aiSummary}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {trendData && trendData.length === 0 && (
                <div className={styles.emptyContainer}>
                    <p className={styles.emptyText}>
                        トレンド対象のレポートが見つかりませんでした。
                        <br />
                        上記からレポートを選択してください。
                    </p>
                </div>
            )}
        </div>
    )
}
