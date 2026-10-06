'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import NeonCheckbox from '@/components/NeonCheckbox'
import PageShell from '@/components/PageShell'
import PeriodSelect from '@/components/PeriodSelect'
import LoadState from '@/components/LoadState'
import { ui, cx } from '@/components/ui'
import { usePeriodRange } from '@/hooks/usePeriodRange'
import { useReport } from '@/hooks/useReport'
import { fetchJson } from '@/lib/utils/fetch'
import { useProduct } from '@/contexts/ProductContext'
import { ENGAGEMENT_MILESTONES, type EngagementFunnelData } from '@/lib/services/funnel/engagementFunnelTypes'
import styles from './EngagementFunnelPage.module.css'

interface EngagementResponse {
    success: true
    data: EngagementFunnelData
}

function getMonthsInRange(startDate: string, endDate: string): string[] {
    const start = new Date(startDate)
    const end = new Date(endDate)
    const months: string[] = []
    const curr = new Date(start.getFullYear(), start.getMonth(), 1)
    const endFirst = new Date(end.getFullYear(), end.getMonth(), 1)
    while (curr <= endFirst) {
        months.push(`${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}`)
        curr.setMonth(curr.getMonth() + 1)
    }
    return months
}

function monthToRange(month: string): { startDate: string; endDate: string } {
    const [y, m] = month.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    return { startDate: `${month}-01`, endDate: `${month}-${String(lastDay).padStart(2, '0')}` }
}

const PAGE_SIZE = 200

export default function EngagementFunnelPage() {
    const { currentProduct } = useProduct()
    const propertyId = currentProduct?.ga4PropertyId ?? ''
    // 旧実装の既定は今月（1日〜今日）
    const periodState = usePeriodRange('thisMonth')
    const { range } = periodState
    const [selectedViewMonth, setSelectedViewMonth] = useState<string>('all')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const searchInputRef = useRef<HTMLInputElement>(null)
    const [showAiAnalysis, setShowAiAnalysis] = useState(false)
    const [aiSummary, setAiSummary] = useState<string | null>(null)
    const [aiSummaryLoading, setAiSummaryLoading] = useState(false)

    // 期間を変えると即再取得（旧実装は「エンゲージメントファネルを実行」ボタン）
    const full = useReport<EngagementResponse>('/api/funnel/engagement', {
        body: { propertyId, startDate: range?.startDate, endDate: range?.endDate },
        enabled: !!propertyId && !!range,
    })
    // 表示月を選んだときはその月だけ取り直す（全期間の結果は残す）
    const monthRange = selectedViewMonth !== 'all' ? monthToRange(selectedViewMonth) : null
    const month = useReport<EngagementResponse>('/api/funnel/engagement', {
        body: { propertyId, startDate: monthRange?.startDate, endDate: monthRange?.endDate },
        enabled: !!propertyId && !!monthRange,
    })
    const dataFullRange = full.data?.data ?? null
    const data = monthRange ? (month.data?.data ?? null) : dataFullRange

    // 期間を変えたら表示月・検索・AI 結果をリセット
    useEffect(() => {
        setSelectedViewMonth('all')
        setDebouncedSearch('')
        if (searchInputRef.current) searchInputRef.current.value = ''
    }, [full.data])
    useEffect(() => { setAiSummary(null) }, [data])

    const handlePagePathSearchChange = (value: string) => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current)
        debounceTimer.current = setTimeout(() => setDebouncedSearch(value), 300)
    }

    const matchedRows = useMemo(
        () => data?.rows.filter((row) => !debouncedSearch || row.pagePath.includes(debouncedSearch)) ?? [],
        [data?.rows, debouncedSearch],
    )
    const filteredRows = matchedRows.slice(0, PAGE_SIZE)

    const runAiAnalysis = async (targetData: EngagementFunnelData | null) => {
        if (!targetData || targetData.rows.length === 0) return
        setAiSummaryLoading(true)
        setAiSummary(null)
        try {
            const res = await fetchJson<{ success?: boolean; summary?: string; error?: string }>('/api/funnel/engagement/summary', {
                method: 'POST',
                body: JSON.stringify({ engagementData: { startDate: targetData.startDate, endDate: targetData.endDate, rows: targetData.rows } }),
            })
            setAiSummary(res.success && res.summary ? res.summary : res.error || 'AI分析の取得に失敗しました')
        } catch (e) {
            setAiSummary(e instanceof Error ? e.message : 'AI分析の取得に失敗しました')
        } finally {
            setAiSummaryLoading(false)
        }
    }

    const months = dataFullRange ? getMonthsInRange(dataFullRange.startDate, dataFullRange.endDate) : []

    return (
        <PageShell
            pageId="funnelEngagement"
            requireProduct
            width="wide"
            status={{ loading: full.loading, error: full.error, source: 'ga4', loadingText: 'ファネルデータを集計中...', onRetry: full.run }}
            controls={
                <>
                    <PeriodSelect state={periodState} resolved={dataFullRange} />
                    <NeonCheckbox checked={showAiAnalysis} onChange={setShowAiAnalysis}>
                        <span>AI分析を表示する</span>
                    </NeonCheckbox>
                </>
            }
        >
            {currentProduct && !currentProduct.ga4PropertyId && (
                <p className={ui.note}>プロダクトのGA4プロパティIDが設定されていません</p>
            )}

            {dataFullRange && (
                <div className={ui.card}>
                    <div className={styles.resultsHeader}>
                        <h2 className={ui.sectionTitle} style={{ marginBottom: 0 }}>
                            {(data ?? dataFullRange).startDate} 〜 {(data ?? dataFullRange).endDate} の結果
                        </h2>
                        <input
                            ref={searchInputRef}
                            type="text"
                            defaultValue=""
                            onChange={(e) => handlePagePathSearchChange(e.target.value)}
                            placeholder="ページパスで絞り込み"
                            className={styles.searchInput}
                        />
                        {months.length > 1 && (
                            <label className={styles.monthSwitcher}>
                                <span className={ui.controlLabel}>表示月:</span>
                                <select className={ui.select} value={selectedViewMonth} onChange={(e) => setSelectedViewMonth(e.target.value)}>
                                    <option value="all">すべて</option>
                                    {months.map((m) => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </label>
                        )}
                    </div>

                    {showAiAnalysis && (
                        <div className={styles.aiSummarySection}>
                            <div className={styles.aiSummaryHeader}>
                                <h3 className={styles.aiSummaryTitle}>AI分析</h3>
                                {!aiSummaryLoading && (
                                    <button type="button" onClick={() => runAiAnalysis(data)} className={ui.btn} disabled={!data || data.rows.length === 0}>
                                        {aiSummary ? '再実行' : 'AI分析を実行'}
                                    </button>
                                )}
                            </div>
                            <LoadState variant="inline" loading={aiSummaryLoading} source="ai">
                                {aiSummary ? <div className={styles.aiSummaryBox}>{aiSummary}</div> : <p className={ui.note}>「AI分析を実行」ボタンを押すと分析結果が表示されます。</p>}
                            </LoadState>
                        </div>
                    )}

                    <LoadState variant="inline" loading={!!monthRange && month.loading} error={monthRange ? month.error : null} source="ga4" onRetry={month.run}>
                        {data && data.rows.length === 0 && <p className={ui.empty}>指定期間に time_on_page イベントのデータがありません。</p>}
                        {data && data.rows.length > 0 && (
                            <>
                                {matchedRows.length > PAGE_SIZE && (
                                    <p className={ui.note}>{matchedRows.length.toLocaleString()} 件中 {PAGE_SIZE} 件を表示しています。絞り込みで件数を絞ってください。</p>
                                )}
                                <div className={ui.tableWrap}>
                                    <table className={ui.dataTable}>
                                        <thead>
                                            <tr>
                                                <th>ページパス</th>
                                                <th className={ui.num}>10秒到達ユーザー</th>
                                                <th className={ui.num}>10秒イベント数</th>
                                                {ENGAGEMENT_MILESTONES.slice(1).map((m) => {
                                                    const short = m.replace('以上滞在', '')
                                                    return (
                                                        <React.Fragment key={m}>
                                                            <th className={ui.num}>{short}到達ユーザー</th>
                                                            <th className={ui.num}>{short}イベント数</th>
                                                            <th className={ui.num}>{short}到達率</th>
                                                        </React.Fragment>
                                                    )
                                                })}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredRows.map((row, i) => (
                                                <tr key={i}>
                                                    <td className={styles.tdPagePath} title={row.pagePath}>{row.pagePath}</td>
                                                    <td className={ui.num}>{row.baseUsers.toLocaleString()}</td>
                                                    <td className={ui.num}>{row.baseEvents.toLocaleString()}</td>
                                                    {ENGAGEMENT_MILESTONES.slice(1).map((m) => {
                                                        const d = row.milestones[m]
                                                        const short = m.replace('以上滞在', '')
                                                        const rate = row.rates[short] ?? 0
                                                        const rateClass = rate >= 0.5 ? styles.rateHigh : rate >= 0.2 ? styles.rateMid : styles.rateLow
                                                        return (
                                                            <React.Fragment key={m}>
                                                                <td className={ui.num}>{d.users.toLocaleString()}</td>
                                                                <td className={ui.num}>{d.events.toLocaleString()}</td>
                                                                <td className={cx(ui.num, styles.tdRate, rateClass)}>{(rate * 100).toFixed(2)}%</td>
                                                            </React.Fragment>
                                                        )
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </LoadState>
                </div>
            )}
        </PageShell>
    )
}
