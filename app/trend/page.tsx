'use client'

import { useEffect, useState } from 'react'
import NeonCheckbox from '@/components/NeonCheckbox'
import PageShell from '@/components/PageShell'
import LoadState from '@/components/LoadState'
import { ui, cx } from '@/components/ui'
import { useReport } from '@/hooks/useReport'
import { fetchJson } from '@/lib/utils/fetch'
import { useProduct } from '@/contexts/ProductContext'
import TrendChart from '@/components/trend/TrendChart'
import type { Report, WeeklyResult, TrendData } from './types'
import styles from './TrendPage.module.css'

const ITEMS_PER_PAGE = 5

function currentYm(): string {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function getMonthsBetween(start: string, end: string): string[] {
    const months: string[] = []
    const [startYear, startMonth] = start.split('-').map(Number)
    const [endYear, endMonth] = end.split('-').map(Number)
    let y = startYear
    let m = startMonth
    while (y < endYear || (y === endYear && m <= endMonth)) {
        months.push(`${y}-${String(m).padStart(2, '0')}`)
        m++
        if (m > 12) { m = 1; y++ }
    }
    return months
}

export default function TrendPage() {
    const { currentProduct } = useProduct()
    const [loading, setLoading] = useState(false)
    const [trendData, setTrendData] = useState<TrendData[] | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [currentPage, setCurrentPage] = useState(1)
    const [startMonth, setStartMonth] = useState(currentYm)
    const [endMonth, setEndMonth] = useState(currentYm)
    const [showAiAnalysis, setShowAiAnalysis] = useState(false)
    const [aiSummary, setAiSummary] = useState<string | null>(null)
    const [aiSummaryLoading, setAiSummaryLoading] = useState(false)
    const [selectedViewMonth, setSelectedViewMonth] = useState('all')

    // トレンド対象のレポート一覧（executionMode = 'trend' が集計対象）
    const reportsReport = useReport<{ success: boolean; reports?: Report[] }>(
        `/api/reports?productId=${currentProduct?.id ?? ''}&isActive=true`,
        { enabled: !!currentProduct, keepPreviousData: true },
    )
    const reports = reportsReport.data?.reports ?? []
    const selectedReportIds = reports.filter((r) => r.executionMode === 'trend').map((r) => r.id)

    const handleReportToggle = async (reportId: number) => {
        const isSelected = selectedReportIds.includes(reportId)
        try {
            await fetchJson(`/api/reports/${reportId}/execution-mode`, {
                method: 'PATCH',
                body: JSON.stringify({ executionMode: isSelected ? null : 'trend' }),
            })
            await reportsReport.run()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'レポートの設定に失敗しました')
        }
    }

    const handleStartMonthChange = (value: string) => {
        setStartMonth(value)
        if (value > endMonth) setEndMonth(value)
    }
    const handleEndMonthChange = (value: string) => {
        setEndMonth(value)
        if (value < startMonth) setStartMonth(value)
    }

    const filteredReports = reports.filter((report) => {
        if (!searchQuery) return true
        const query = searchQuery.toLowerCase()
        return (
            report.name.toLowerCase().includes(query) ||
            report.cvrA?.denominatorLabels.some((label) => label.toLowerCase().includes(query)) ||
            report.cvrA?.numeratorLabels.some((label) => label.toLowerCase().includes(query))
        )
    })
    const totalPages = Math.ceil(filteredReports.length / ITEMS_PER_PAGE)
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const endIndex = startIndex + ITEMS_PER_PAGE
    const paginatedReports = filteredReports.slice(startIndex, endIndex)
    useEffect(() => { setCurrentPage(1) }, [searchQuery])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        try {
            if (!currentProduct) throw new Error('プロダクトが選択されていません')
            if (!/^\d{4}-\d{2}$/.test(startMonth) || !/^\d{4}-\d{2}$/.test(endMonth)) throw new Error('月はYYYY-MM形式で入力してください')
            if (startMonth > endMonth) throw new Error('開始月は終了月より前である必要があります')

            const allTrendData: TrendData[] = []
            for (const month of getMonthsBetween(startMonth, endMonth)) {
                try {
                    const result = await fetchJson<{ trendData?: TrendData[] }>('/api/trend/monthly', {
                        method: 'POST',
                        body: JSON.stringify({ productId: currentProduct.id, month }),
                    })
                    if (result.trendData && result.trendData.length > 0) {
                        allTrendData.push(...result.trendData.map((d) => ({ ...d, month })))
                    }
                } catch (err) {
                    // 月単位の失敗（レポート未設定など）は飛ばして他の月を続ける
                    console.error(`Trend report error for ${month}:`, err)
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
        fetchJson<{ success?: boolean; summary?: string; error?: string }>('/api/trend/summary', {
            method: 'POST',
            body: JSON.stringify({ trendData, startMonth, endMonth }),
        })
            .then((data) => { if (!cancelled) setAiSummary(data.success && data.summary ? data.summary : data.error || 'AI分析の取得に失敗しました') })
            .catch((e) => { if (!cancelled) setAiSummary(e instanceof Error ? e.message : 'AI分析の取得に失敗しました') })
            .finally(() => { if (!cancelled) setAiSummaryLoading(false) })
        return () => { cancelled = true }
    }, [showAiAnalysis, trendData, startMonth, endMonth, aiSummary])

    const months = trendData ? Array.from(new Set(trendData.map((d) => d.month))).sort() : []

    return (
        <PageShell
            pageId="trend"
            requireProduct
            status={{ loading, error, source: 'ga4', loadingText: '月次トレンドレポートを生成中...' }}
        >
            <div className={ui.card}>
                <h2 className={ui.sectionTitle}>トレンド対象レポートの選択</h2>
                <LoadState variant="inline" loading={reportsReport.loading && reports.length === 0} error={reportsReport.error} source="db" onRetry={reportsReport.run}>
                    {reports.length > 0 && (
                        <div className={ui.controls}>
                            <input
                                type="text"
                                placeholder="レポート名、PVラベル、CVラベルで検索..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className={styles.searchInput}
                            />
                        </div>
                    )}
                    {reports.length === 0 ? (
                        <p className={ui.empty}>レポートが見つかりませんでした</p>
                    ) : filteredReports.length === 0 ? (
                        <p className={ui.empty}>検索条件に一致するレポートが見つかりませんでした</p>
                    ) : (
                        <>
                            <div className={styles.reportList}>
                                {paginatedReports.map((report) => (
                                    <div key={report.id} className={styles.reportItem}>
                                        <NeonCheckbox checked={selectedReportIds.includes(report.id)} onChange={() => handleReportToggle(report.id)} className={styles.reportItemLabel}>
                                            <span className={styles.reportName}>{report.name}</span>
                                            {report.executionMode === 'trend' && <span className={styles.trendBadge}>トレンド対象</span>}
                                        </NeonCheckbox>
                                        {report.cvrA ? (
                                            <div className={styles.cvrInfo}>
                                                <div className={styles.cvrLabel}><span className={styles.cvrLabelTitle}>PVラベル:</span><span className={styles.cvrLabelValue}>{report.cvrA.denominatorLabels.join(', ') || '未設定'}</span></div>
                                                <div className={styles.cvrLabel}><span className={styles.cvrLabelTitle}>CVラベル:</span><span className={styles.cvrLabelValue}>{report.cvrA.numeratorLabels.join(', ') || '未設定'}</span></div>
                                            </div>
                                        ) : (
                                            <div className={styles.cvrInfo}><span className={styles.noCvrConfig}>CVR設定なし</span></div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {totalPages > 1 && (
                                <div className={styles.pagination}>
                                    <button type="button" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className={ui.btn}>前へ</button>
                                    <span className={ui.note}>{currentPage} / {totalPages} ページ（{filteredReports.length}件中 {startIndex + 1}-{Math.min(endIndex, filteredReports.length)}件を表示）</span>
                                    <button type="button" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className={ui.btn}>次へ</button>
                                </div>
                            )}
                        </>
                    )}
                </LoadState>
                <p className={ui.note}>チェックを入れたレポートが月次トレンドレポートの集計対象になります</p>
            </div>

            <form onSubmit={handleSubmit} className={cx(ui.card, styles.form)}>
                <div className={styles.formRow}>
                    <label className={styles.formField}>
                        <span className={ui.controlLabel}>開始月</span>
                        <input type="month" value={startMonth} onChange={(e) => handleStartMonthChange(e.target.value)} className={styles.monthInput} required />
                    </label>
                    <label className={styles.formField}>
                        <span className={ui.controlLabel}>終了月</span>
                        <input type="month" value={endMonth} onChange={(e) => handleEndMonthChange(e.target.value)} className={styles.monthInput} required />
                    </label>
                </div>
                <p className={ui.note}>開始月から終了月までの期間を集計します（複数月の比較が可能です）</p>
                <div>
                    <NeonCheckbox checked={showAiAnalysis} onChange={setShowAiAnalysis}>
                        <span>AI分析を表示する（セッション時間・月による傾向で回答）</span>
                    </NeonCheckbox>
                    <p className={ui.note}>チェックを付けたときだけ、セッション時間と月による傾向を中心にしたAI分析が表示されます</p>
                </div>
                <div>
                    <button type="submit" className={ui.btnPrimary} disabled={loading}>
                        {loading ? '生成中...' : '月次トレンドレポートを生成'}
                    </button>
                </div>
            </form>

            {trendData && trendData.length > 0 && (
                <div className={styles.results}>
                    <div className={styles.resultsHeader}>
                        <h2 className={ui.sectionTitle} style={{ marginBottom: 0 }}>
                            {startMonth === endMonth ? `${startMonth}のトレンドレポート` : `${startMonth} 〜 ${endMonth}のトレンドレポート`}
                        </h2>
                        {months.length > 1 && (
                            <label className={styles.monthSwitcher}>
                                <span className={ui.controlLabel}>表示月:</span>
                                <select className={ui.select} value={selectedViewMonth} onChange={(e) => setSelectedViewMonth(e.target.value)}>
                                    <option value="all">すべての月</option>
                                    {months.map((m) => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </label>
                        )}
                    </div>
                    {(() => {
                        const reportGroups = new Map<number, Map<string, TrendData[]>>()
                        for (const d of trendData) {
                            if (!reportGroups.has(d.reportId)) reportGroups.set(d.reportId, new Map())
                            const monthMap = reportGroups.get(d.reportId)!
                            if (!monthMap.has(d.month)) monthMap.set(d.month, [])
                            monthMap.get(d.month)!.push(d)
                        }
                        return Array.from(reportGroups.entries()).map(([reportId, monthMap]) => {
                            const useMonth = selectedViewMonth !== 'all' && monthMap.has(selectedViewMonth) ? selectedViewMonth : null
                            const firstData = useMonth ? monthMap.get(useMonth)?.[0] : Array.from(monthMap.values())[0]?.[0]
                            if (!firstData) return null

                            let allWeeklyResults: WeeklyResult[] = []
                            const monthlyDataList: Array<{ month: string; pv: number; cv: number; cvr: number }> = []
                            if (useMonth) {
                                const monthData = monthMap.get(useMonth)![0]
                                allWeeklyResults = monthData.weeklyResults
                                monthlyDataList.push({ month: useMonth, ...monthData.monthlyTotal })
                            } else {
                                for (const [, monthData] of monthMap) {
                                    const d = monthData[0]
                                    allWeeklyResults.push(...d.weeklyResults)
                                    monthlyDataList.push({ month: d.month, ...d.monthlyTotal })
                                }
                            }
                            const totalMonthly = monthlyDataList.reduce((acc, d) => ({ pv: acc.pv + d.pv, cv: acc.cv + d.cv }), { pv: 0, cv: 0 })
                            const totalCVR = totalMonthly.pv > 0 ? totalMonthly.cv / totalMonthly.pv : 0

                            return (
                                <div key={reportId} className={styles.reportGroup}>
                                    <h3 className={styles.reportGroupTitle}>{firstData.reportName}</h3>
                                    <TrendChart
                                        reportName={firstData.reportName}
                                        weeklyResults={allWeeklyResults}
                                        monthlyTotal={{ pv: totalMonthly.pv, cv: totalMonthly.cv, cvr: totalCVR }}
                                        monthlyData={monthlyDataList}
                                    />
                                </div>
                            )
                        })
                    })()}

                    {showAiAnalysis && (aiSummaryLoading || aiSummary) && (
                        <div className={cx(ui.card, styles.aiSummarySection)}>
                            <h3 className={styles.aiSummaryTitle}>AI分析</h3>
                            <LoadState variant="inline" loading={aiSummaryLoading} source="ai">
                                <div className={styles.aiSummaryBox}>{aiSummary}</div>
                            </LoadState>
                        </div>
                    )}
                </div>
            )}

            {trendData && trendData.length === 0 && (
                <p className={ui.empty}>トレンド対象のレポートが見つかりませんでした。<br />上記からレポートを選択してください。</p>
            )}
        </PageShell>
    )
}
