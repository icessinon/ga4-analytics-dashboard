'use client'

import React, { useState, useEffect } from 'react'
import Link from '@/components/Link'
import BackLink from '@/components/BackLink'
import CustomSelect from '@/components/CustomSelect'
import Loader from '@/components/Loader'
import NeonCheckbox from '@/components/NeonCheckbox'
import { useProduct } from '@/lib/contexts/ProductContext'
import {
    ENGAGEMENT_MILESTONES,
    type EngagementFunnelData,
} from '@/lib/services/funnel/engagementFunnelTypes'
import styles from './EngagementFunnelPage.module.css'

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

export default function EngagementFunnelPage() {
    const { currentProduct } = useProduct()
    const [loading, setLoading] = useState(false)
    const [data, setData] = useState<EngagementFunnelData | null>(null)
    const [dataFullRange, setDataFullRange] = useState<EngagementFunnelData | null>(null)
    const [selectedViewMonth, setSelectedViewMonth] = useState<string>('all')
    const [error, setError] = useState<string | null>(null)
    const [accessToken, setAccessToken] = useState('')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [pagePathSearch, setPagePathSearch] = useState('')
    const [showAiAnalysis, setShowAiAnalysis] = useState(false)
    const [geminiApiKey, setGeminiApiKey] = useState('')
    const [aiSummary, setAiSummary] = useState<string | null>(null)
    const [aiSummaryLoading, setAiSummaryLoading] = useState(false)

    useEffect(() => {
        const end = new Date()
        end.setDate(end.getDate() - 1)
        const start = new Date(end)
        start.setDate(start.getDate() - 27)
        setEndDate(end.toISOString().slice(0, 10))
        setStartDate(start.toISOString().slice(0, 10))
    }, [])

    const propertyId = currentProduct?.ga4PropertyId ?? ''

    const fetchForMonth = async (month: string) => {
        const [y, m] = month.split('-').map(Number)
        const start = `${month}-01`
        const lastDay = new Date(y, m, 0).getDate()
        const end = `${month}-${String(lastDay).padStart(2, '0')}`
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/funnel/engagement', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    propertyId,
                    startDate: start,
                    endDate: end,
                    accessToken: accessToken || undefined,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error || json.message || '取得に失敗しました')
            if (json.success && json.data) {
                setData({
                    startDate: json.data.startDate,
                    endDate: json.data.endDate,
                    rows: json.data.rows,
                })
                setAiSummary(null)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'エラーが発生しました')
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!propertyId?.trim()) {
            setError('プロダクトのGA4プロパティIDが設定されていません')
            return
        }
        setLoading(true)
        setError(null)
        setData(null)
        setDataFullRange(null)
        try {
            const res = await fetch('/api/funnel/engagement', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    propertyId,
                    startDate,
                    endDate,
                    accessToken: accessToken || undefined,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error || json.message || '取得に失敗しました')
            if (json.success && json.data) {
                const result = {
                    startDate: json.data.startDate,
                    endDate: json.data.endDate,
                    rows: json.data.rows,
                }
                setData(result)
                setDataFullRange(result)
                setSelectedViewMonth('all')
                setPagePathSearch('')
                setAiSummary(null)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'エラーが発生しました')
        } finally {
            setLoading(false)
        }
    }

    const handleViewMonthChange = (value: string) => {
        setSelectedViewMonth(value)
        if (value === 'all' && dataFullRange) {
            setData(dataFullRange)
            setAiSummary(null)
        } else if (value !== 'all') {
            fetchForMonth(value)
        }
    }

    useEffect(() => {
        if (!showAiAnalysis || !data || data.rows.length === 0) return

        let cancelled = false
        setAiSummaryLoading(true)
        fetch('/api/funnel/engagement/summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                engagementData: { startDate: data.startDate, endDate: data.endDate, rows: data.rows },
                geminiApiKey: geminiApiKey || undefined,
            }),
        })
            .then((res) => res.json())
            .then((resData) => {
                if (cancelled) return
                if (resData.success && resData.summary) setAiSummary(resData.summary)
                else setAiSummary(resData.error || 'AI分析の取得に失敗しました')
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
    }, [showAiAnalysis, data, geminiApiKey])

    if (!currentProduct) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h1 className={styles.title}>エンゲージメントファネル</h1>
                    <BackLink href="/">ダッシュボードに戻る</BackLink>
                </div>
                <div className={styles.warningBox}>
                    <p>プロダクトを選択してください。ダッシュボードから選択できます。</p>
                </div>
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>エンゲージメントファネル</h1>
                    <p className={styles.subtitle}>
                        ページごと・滞在時間（time_on_page）のファネル。10秒〜180秒の到達ユーザー・到達率を表示します。
                    </p>
                    {currentProduct && (
                        <div className={styles.infoBox}>
                            <p><strong>プロダクト:</strong> {currentProduct.name}</p>
                            {currentProduct.ga4PropertyId && (
                                <p><strong>GA4プロパティID:</strong> {currentProduct.ga4PropertyId}</p>
                            )}
                        </div>
                    )}
                </div>
                <BackLink href="/">ダッシュボードに戻る</BackLink>
            </div>

            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>集計期間</h2>
                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.formRow}>
                        <div className={styles.formField}>
                            <label className={styles.label}>開始日</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className={styles.input}
                                required
                            />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.label}>終了日</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className={styles.input}
                                required
                            />
                        </div>
                    </div>
                    <div className={styles.formField}>
                        <label className={styles.label}>GA4アクセストークン（オプション）</label>
                        <input
                            type="password"
                            value={accessToken}
                            onChange={(e) => setAccessToken(e.target.value)}
                            placeholder="環境変数が設定されていれば不要"
                            className={`${styles.input} ${styles.inputWide}`}
                        />
                    </div>
                    <div className={styles.formField}>
                        <NeonCheckbox
                            checked={showAiAnalysis}
                            onChange={setShowAiAnalysis}
                        >
                            <span>AI分析を表示する</span>
                        </NeonCheckbox>
                        {showAiAnalysis && (
                            <input
                                type="password"
                                value={geminiApiKey}
                                onChange={(e) => setGeminiApiKey(e.target.value)}
                                placeholder="Gemini APIキー（未入力の場合は環境変数を使用）"
                                className={`${styles.input} ${styles.inputWide} ${styles.geminiApiKeyInput}`}
                            />
                        )}
                        <p className={styles.helpText}>
                            チェックを付けたときだけ、ファネル結果に対するAI分析が表示されます
                        </p>
                    </div>
                    <button type="submit" className="executionButton" disabled={loading}>
                        <span>{loading ? '集計中...' : 'エンゲージメントファネルを実行'}</span>
                    </button>
                </form>
            </div>

            {error && (
                <div className={styles.errorBox}>
                    <p>{error}</p>
                </div>
            )}

            {loading && (
                <div className={styles.loaderContainer}>
                    <Loader />
                    <p className={styles.loaderText}>ファネルデータを集計中...</p>
                </div>
            )}

            {data && data.rows.length > 0 && (
                <div className={styles.resultSection}>
                    <div className={styles.resultsHeader}>
                        <div className={styles.resultsHeaderTop}>
                            <h2 className={styles.sectionTitle}>
                                {data.startDate} 〜 {data.endDate} の結果
                            </h2>
                            <input
                                type="text"
                                value={pagePathSearch}
                                onChange={(e) => setPagePathSearch(e.target.value)}
                                placeholder="ページパスで絞り込み"
                                className={styles.searchInput}
                            />
                        </div>
                        {(() => {
                            const months = getMonthsInRange(dataFullRange?.startDate ?? data.startDate, dataFullRange?.endDate ?? data.endDate)
                            if (months.length <= 1) return null
                            return (
                                <div className={styles.monthSwitcher}>
                                    <label htmlFor="viewMonth" className={styles.monthSwitcherLabel}>表示月:</label>
                                    <CustomSelect
                                        value={selectedViewMonth}
                                        onChange={handleViewMonthChange}
                                        options={[{ value: 'all', label: 'すべて' }, ...months.map((m) => ({ value: m, label: m }))]}
                                        triggerClassName={styles.monthSwitcherSelect}
                                        aria-label="表示月"
                                    />
                                </div>
                            )
                        })()}
                    </div>
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th className={styles.th}>ページパス</th>
                                    <th className={styles.thRight}>10秒到達ユーザー</th>
                                    <th className={styles.thRight}>10秒イベント数</th>
                                    {ENGAGEMENT_MILESTONES.slice(1).map((m) => {
                                        const short = m.replace('以上滞在', '')
                                        return (
                                            <React.Fragment key={m}>
                                                <th className={styles.thRight}>{short}到達ユーザー</th>
                                                <th className={styles.thRight}>{short}イベント数</th>
                                                <th className={styles.thRight}>{short}到達率</th>
                                            </React.Fragment>
                                        )
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.filter((row) =>
                                    !pagePathSearch || row.pagePath.includes(pagePathSearch)
                                ).map((row, i) => (
                                    <tr key={i}>
                                        <td className={styles.tdPagePath}>{row.pagePath}</td>
                                        <td className={styles.tdRight}>{row.baseUsers.toLocaleString()}</td>
                                        <td className={styles.tdRight}>{row.baseEvents.toLocaleString()}</td>
                                        {ENGAGEMENT_MILESTONES.slice(1).map((m) => {
                                            const d = row.milestones[m]
                                            const short = m.replace('以上滞在', '')
                                            const rate = row.rates[short] ?? 0
                                            const rateClass = rate >= 0.5 ? styles.rateHigh : rate >= 0.2 ? styles.rateMid : styles.rateLow
                                            return (
                                                <React.Fragment key={m}>
                                                    <td className={styles.tdRight}>{d.users.toLocaleString()}</td>
                                                    <td className={styles.tdRight}>{d.events.toLocaleString()}</td>
                                                    <td className={`${styles.tdRight} ${styles.tdRate} ${rateClass}`}>{(rate * 100).toFixed(2)}%</td>
                                                </React.Fragment>
                                            )
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {showAiAnalysis && (aiSummaryLoading || aiSummary) && (
                        <div className={styles.aiSummarySection}>
                            <h3 className={styles.aiSummaryTitle}>AI分析</h3>
                            {aiSummaryLoading ? (
                                <div className={styles.aiSummaryLoading}>
                                    <Loader />
                                    <span>AI分析を取得中...</span>
                                </div>
                            ) : (
                                <div className={styles.aiSummaryBox}>{aiSummary}</div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {data && data.rows.length === 0 && !loading && (
                <div className={styles.emptyBox}>
                    <p>指定期間に time_on_page イベントのデータがありません。</p>
                </div>
            )}
        </div>
    )
}
