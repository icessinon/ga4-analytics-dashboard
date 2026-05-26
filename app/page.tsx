'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DateInput from '@/components/DateInput'
import Link from '@/components/Link'
import CustomSelect from '@/components/CustomSelect'
import Loader from '@/components/Loader'
import AbTestDonutCharts from '@/components/dashboard/AbTestDonutCharts'
import PageMetricsChart from '@/components/dashboard/PageMetricsChart'
import { useProduct } from '@/lib/contexts/ProductContext'
import type { ChartMetric, DashboardStats, PageMetrics, PageMetricsSeriesPoint, SeriesDataPoint } from '@/app/dashboard/types'
import { CV_DIMENSION_OPTIONS, QUICK_ACCESS_GROUPS } from '@/app/dashboard/types'
import { getChartPeriodLabel, getMonthOptions, getRangeForGranularity, periodToTimestamp } from '@/app/dashboard/utils'
import { parseJsonResponse } from '@/lib/utils/fetch'
import InfoTooltip from '@/components/InfoTooltip/InfoTooltip'
import styles from './DashboardPage.module.css'

export default function DashboardPage() {
    const { currentProduct, setCurrentProduct, products, loading: productsLoading } = useProduct()
    const [stats, setStats] = useState<DashboardStats | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const now = new Date()
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const [selectedMonth, setSelectedMonth] = useState(defaultMonth)
    const [pagePaths, setPagePaths] = useState<string[]>([])
    const [pagePathsLoading, setPagePathsLoading] = useState(false)
    const [selectedPagePath, setSelectedPagePath] = useState('/')
    const [pageMetrics, setPageMetrics] = useState<PageMetrics | null>(null)
    const [pageMetricsPrev, setPageMetricsPrev] = useState<PageMetrics | null>(null)
    const [granularity, setGranularity] = useState<'daily' | 'weekly' | 'monthly'>('daily')
    const [seriesData, setSeriesData] = useState<PageMetricsSeriesPoint[]>([])
    const [seriesLoading, setSeriesLoading] = useState(false)
    const [chartMetric, setChartMetric] = useState<ChartMetric>('pv')
    const [customStartDate, setCustomStartDate] = useState<string>('')
    const [customEndDate, setCustomEndDate] = useState<string>('')
    const [pageMetricsLoading, setPageMetricsLoading] = useState(false)
    const [ga4AccessToken, setGa4AccessToken] = useState('')
    const [cvConfig, setCvConfig] = useState<Record<string, { cvEventName: string; cvDimension: string }>>({})
    const [cvEventInput, setCvEventInput] = useState('')
    const [cvDimensionInput, setCvDimensionInput] = useState('eventName')
    const [cvConfigSaving, setCvConfigSaving] = useState(false)
    const selectedPagePathRef = useRef('')
    selectedPagePathRef.current = selectedPagePath

    const chartData = useMemo<SeriesDataPoint[]>(() => {
        return seriesData.map((d) => ({
            ...d,
            t: periodToTimestamp(d.period, granularity),
        }))
    }, [seriesData, granularity])

    const momChanges = useMemo(() => {
        if (!pageMetrics || !pageMetricsPrev) {
            return {
                pv: null,
                cv: null,
                cvr: null,
                exitRate: null,
                newUserRate: null,
                bounceCount: null,
                averageSessionDuration: null,
                engagementRate: null,
            }
        }
        const prev = pageMetricsPrev
        const cur = pageMetrics
        const pv = prev.pv === 0 ? null : (cur.pv - prev.pv) / prev.pv * 100
        const cv = prev.cv === 0 ? null : (cur.cv - prev.cv) / prev.cv * 100
        const cvr = prev.cvr === 0 ? null : (cur.cvr - prev.cvr) / prev.cvr * 100
        const exitRate =
            prev.exitRate == null || prev.exitRate === 0
                ? null
                : (cur.exitRate != null ? (cur.exitRate - prev.exitRate) / prev.exitRate * 100 : null)
        const newUserRate = prev.newUserRate === 0 ? null : (cur.newUserRate - prev.newUserRate) / prev.newUserRate * 100
        const bounceCount = prev.bounceCount === 0 ? null : (cur.bounceCount - prev.bounceCount) / prev.bounceCount * 100
        const averageSessionDuration =
            prev.averageSessionDurationSeconds === 0
                ? null
                : (cur.averageSessionDurationSeconds - prev.averageSessionDurationSeconds) / prev.averageSessionDurationSeconds * 100
        const engagementRate = prev.engagementRate === 0 ? null : (cur.engagementRate - prev.engagementRate) / prev.engagementRate * 100
        return {
            pv,
            cv,
            cvr,
            exitRate: exitRate ?? null,
            newUserRate,
            bounceCount,
            averageSessionDuration,
            engagementRate,
        }
    }, [pageMetrics, pageMetricsPrev])

    const fetchStats = useCallback(async () => {
        if (!currentProduct) {
            setLoading(false)
            return
        }
        setLoading(true)
        setError(null)
        try {
            const url = `/api/dashboard?productId=${currentProduct.id}&month=${selectedMonth}`
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-store',
            })
            if (!response.ok) {
                let errorData: { message?: string; error?: string }
                try {
                    errorData = await response.json()
                } catch {
                    errorData = { message: `HTTP ${response.status}: ${response.statusText}` }
                }
                throw new Error(errorData.message || errorData.error || `HTTP ${response.status}: データの取得に失敗しました`)
            }
            const data = await parseJsonResponse<DashboardStats & { error?: string; message?: string }>(response)
            if (data.error) throw new Error(data.message || data.error)
            setStats(data)
        } catch (err) {
            let errorMessage = 'エラーが発生しました'
            if (err instanceof TypeError && err.message.includes('fetch')) {
                errorMessage = 'サーバーに接続できませんでした。開発サーバーが起動しているか確認してください。'
            } else if (err instanceof Error) {
                errorMessage = err.message
            }
            setError(errorMessage)
        } finally {
            setLoading(false)
        }
    }, [currentProduct, selectedMonth])

    useEffect(() => {
        fetchStats()
    }, [fetchStats])

    const monthToRange = useCallback((month: string) => {
        const [y, m] = month.split('-').map(Number)
        const start = new Date(y, m - 1, 1)
        const end = new Date(y, m, 0)
        return {
            startDate: start.toISOString().slice(0, 10),
            endDate: end.toISOString().slice(0, 10),
        }
    }, [])

    const getPreviousMonth = useCallback((month: string) => {
        const [y, m] = month.split('-').map(Number)
        if (m <= 1) return `${y - 1}-12`
        return `${y}-${String(m - 1).padStart(2, '0')}`
    }, [])

    useEffect(() => {
        if (!currentProduct?.ga4PropertyId) {
            setPagePaths([])
            setSelectedPagePath('')
            return
        }
        let cancelled = false
        setPagePathsLoading(true)
        const { startDate, endDate } = monthToRange(selectedMonth)
        fetch('/api/funnel/engagement/page-paths', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                propertyId: currentProduct.ga4PropertyId,
                startDate,
                endDate,
                accessToken: ga4AccessToken || undefined,
            }),
        })
            .then((r) => parseJsonResponse<{ error?: string; pagePaths?: string[] }>(r))
            .then((data) => {
                if (cancelled) return
                if (data.error) throw new Error(data.error)
                const paths = data.pagePaths || []
                setPagePaths(paths)
                const current = selectedPagePathRef.current
                if (paths.length && !paths.includes(current)) {
                    setSelectedPagePath(paths.includes('/') ? '/' : (paths[0] ?? ''))
                } else if (paths.length && (current === '' || current === '/') && paths.includes('/')) {
                    setSelectedPagePath('/')
                }
            })
            .catch(() => {
                if (!cancelled) setPagePaths([])
            })
            .finally(() => {
                if (!cancelled) setPagePathsLoading(false)
            })
        return () => { cancelled = true }
    }, [currentProduct?.id, currentProduct?.ga4PropertyId, selectedMonth, ga4AccessToken])

    useEffect(() => {
        if (!currentProduct?.ga4PropertyId || !selectedPagePath) {
            setPageMetrics(null)
            setPageMetricsPrev(null)
            return
        }
        let cancelled = false
        setPageMetricsLoading(true)
        const useCustomRange = Boolean(customStartDate && customEndDate)
        const body = useCustomRange
            ? { propertyId: currentProduct.ga4PropertyId, productId: currentProduct.id, pagePath: selectedPagePath, startDate: customStartDate, endDate: customEndDate, accessToken: ga4AccessToken || undefined }
            : granularity === 'daily'
                ? { propertyId: currentProduct.ga4PropertyId, productId: currentProduct.id, pagePath: selectedPagePath, month: selectedMonth, accessToken: ga4AccessToken || undefined }
                : (() => {
                        const { startDate, endDate } = getRangeForGranularity(selectedMonth, granularity)
                        return { propertyId: currentProduct.ga4PropertyId, productId: currentProduct.id, pagePath: selectedPagePath, startDate, endDate, accessToken: ga4AccessToken || undefined }
                    })()
        const prevMonth = getPreviousMonth(selectedMonth)
        const bodyPrev = useCustomRange
            ? null
            : { propertyId: currentProduct.ga4PropertyId, productId: currentProduct.id, pagePath: selectedPagePath, month: prevMonth, accessToken: ga4AccessToken || undefined }
        if (!useCustomRange && bodyPrev) {
            Promise.all([
                fetch('/api/dashboard/page-metrics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => parseJsonResponse<PageMetrics & { error?: string }>(r)),
                fetch('/api/dashboard/page-metrics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyPrev) }).then((r) => parseJsonResponse<PageMetrics & { error?: string }>(r)),
            ])
                .then(([data, dataPrev]) => {
                    if (cancelled) return
                    if (data.error) throw new Error(data.error)
                    setPageMetrics(data)
                    setPageMetricsPrev(dataPrev?.error ? null : dataPrev)
                })
                .catch(() => {
                    if (!cancelled) {
                        setPageMetrics(null)
                        setPageMetricsPrev(null)
                    }
                })
                .finally(() => {
                    if (!cancelled) setPageMetricsLoading(false)
                })
        } else {
            setPageMetricsPrev(null)
            fetch('/api/dashboard/page-metrics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
                .then((r) => parseJsonResponse<PageMetrics & { error?: string }>(r))
                .then((data) => {
                    if (cancelled) return
                    if (data.error) throw new Error(data.error)
                    setPageMetrics(data)
                })
                .catch(() => {
                    if (!cancelled) setPageMetrics(null)
                })
                .finally(() => {
                    if (!cancelled) setPageMetricsLoading(false)
                })
        }
        return () => { cancelled = true }
    }, [currentProduct?.id, currentProduct?.ga4PropertyId, selectedMonth, selectedPagePath, granularity, customStartDate, customEndDate, ga4AccessToken, getPreviousMonth])

    useEffect(() => {
        if (!currentProduct?.ga4PropertyId || !selectedPagePath) {
            setSeriesData([])
            return
        }
        const useCustomRange = Boolean(customStartDate && customEndDate)
        if (!useCustomRange && !selectedMonth) return
        let cancelled = false
        setSeriesLoading(true)
        const seriesBody = useCustomRange
            ? { propertyId: currentProduct.ga4PropertyId, productId: currentProduct.id, pagePath: selectedPagePath, startDate: customStartDate, endDate: customEndDate, granularity, accessToken: ga4AccessToken || undefined }
            : { propertyId: currentProduct.ga4PropertyId, productId: currentProduct.id, pagePath: selectedPagePath, month: selectedMonth, granularity, accessToken: ga4AccessToken || undefined }
        fetch('/api/dashboard/page-metrics/series', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(seriesBody),
        })
            .then((r) => parseJsonResponse<{ error?: string; series?: PageMetricsSeriesPoint[] }>(r))
            .then((data) => {
                if (cancelled) return
                if (data.error) throw new Error(data.error)
                setSeriesData(data.series ?? [])
            })
            .catch(() => {
                if (!cancelled) setSeriesData([])
            })
            .finally(() => {
                if (!cancelled) setSeriesLoading(false)
            })
        return () => { cancelled = true }
    }, [currentProduct?.id, currentProduct?.ga4PropertyId, selectedMonth, selectedPagePath, granularity, customStartDate, customEndDate, ga4AccessToken])

    useEffect(() => {
        if (!currentProduct?.id) {
            setCvConfig({})
            return
        }
        fetch(`/api/dashboard/page-cv-config?productId=${currentProduct.id}`)
            .then((r) => parseJsonResponse<{ error?: string; configs?: Record<string, { cvEventName?: string; cvDimension?: string } | string> }>(r))
            .then((data) => {
                if (data.error) return
                const configs = data.configs ?? {}
                const normalized: Record<string, { cvEventName: string; cvDimension: string }> = {}
                Object.keys(configs).forEach((path) => {
                    const c = configs[path]
                    normalized[path] = {
                        cvEventName: typeof c === 'string' ? c : (c?.cvEventName ?? ''),
                        cvDimension: typeof c === 'object' && c?.cvDimension ? c.cvDimension : 'eventName',
                    }
                })
                setCvConfig(normalized)
            })
            .catch(() => setCvConfig({}))
    }, [currentProduct?.id])

    useEffect(() => {
        const c = cvConfig[selectedPagePath]
        setCvEventInput(c?.cvEventName ?? '')
        setCvDimensionInput(c?.cvDimension ?? 'eventName')
    }, [selectedPagePath, cvConfig])

    const saveCvConfig = () => {
        if (!currentProduct?.id || !selectedPagePath) return
        setCvConfigSaving(true)
        fetch('/api/dashboard/page-cv-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                productId: currentProduct.id,
                pagePath: selectedPagePath,
                cvEventName: cvEventInput.trim(),
                cvDimension: cvDimensionInput,
            }),
        })
            .then((r) => parseJsonResponse<{ error?: string; cvEventName?: string; cvDimension?: string }>(r))
            .then((data) => {
                if (data.error) throw new Error(data.error)
                setCvConfig((prev) => {
                    const next = { ...prev }
                    if (data.cvEventName) {
                        next[selectedPagePath] = {
                            cvEventName: data.cvEventName,
                            cvDimension: data.cvDimension ?? 'eventName',
                        }
                    } else delete next[selectedPagePath]
                    return next
                })
                setPageMetrics(null)
                setPageMetricsLoading(true)
                fetch('/api/dashboard/page-metrics', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        propertyId: currentProduct.ga4PropertyId,
                        productId: currentProduct.id,
                        pagePath: selectedPagePath,
                        month: selectedMonth,
                        accessToken: ga4AccessToken || undefined,
                    }),
                })
                    .then((res) => parseJsonResponse<PageMetrics & { error?: string }>(res))
                    .then((d) => { if (!d.error) setPageMetrics(d) })
                    .finally(() => setPageMetricsLoading(false))
            })
            .catch(() => {})
            .finally(() => setCvConfigSaving(false))
    }

    if (loading) {
        return (
            <div className={styles.container}>
                <h1 className={styles.title}>ダッシュボード</h1>
                <div className={styles.loaderContainer}>
                    <Loader />
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className={styles.container}>
                <h1 className={styles.title}>ダッシュボード</h1>
                <div className={styles.errorContainer}>
                    <p className={styles.errorTitle}>エラーが発生しました</p>
                    <p className={styles.errorMessage}>{error}</p>
                    <div className={styles.errorList}>
                        <p className={styles.errorListTitle}>確認事項：</p>
                        <ul className={styles.errorListItems}>
                            <li className={styles.errorListItem}>データベースが起動しているか確認してください</li>
                            <li className={styles.errorListItem}>.env または .env.local が正しく設定されているか確認してください（Docker の場合は .env）</li>
                            <li className={styles.errorListItem}>ブラウザのコンソールで詳細なエラーを確認してください</li>
                        </ul>
                    </div>
                    <button
                        onClick={() => {
                            setError(null)
                            fetchStats()
                        }}
                        className={styles.retryButton}
                    >
                        再試行
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.headerContent}>
                    <div>
                        <h1 className={styles.title}>ダッシュボード</h1>
                        <p className={styles.subtitle}>GA4 Analytics Dashboard の概要</p>
                    </div>
                    <div className={styles.headerSelectors}>
                        <div className={styles.productSelector}>
                            <label className={styles.productLabel}>プロダクト:</label>
                            <CustomSelect
                                value={String(currentProduct?.id ?? '')}
                                onChange={(v) => {
                                    const product = products.find((p) => p.id === parseInt(v, 10))
                                    if (product) setCurrentProduct(product)
                                }}
                                options={products.length === 0 ? [{ value: '', label: 'プロダクトがありません' }] : products.map((p) => ({ value: String(p.id), label: `${p.name} ${p.domain ? `(${p.domain})` : ''}` }))}
                                triggerClassName={styles.productSelect}
                                disabled={productsLoading}
                                aria-label="プロダクト選択"
                            />
                        </div>
                        <div className={styles.monthSelector}>
                            <label className={styles.monthLabel}>表示月:</label>
                            <CustomSelect
                                value={selectedMonth}
                                onChange={setSelectedMonth}
                                options={getMonthOptions().map((opt) => ({ value: opt.value, label: opt.label }))}
                                triggerClassName={styles.monthSelect}
                                aria-label="表示月選択"
                            />
                        </div>
                    </div>
                </div>
                {currentProduct && (
                    <div className={styles.currentProduct}>
                        <p className={styles.currentProductText}>
                            <strong>現在のプロダクト:</strong> {currentProduct.name}
                            {currentProduct.domain && ` (${currentProduct.domain})`}
                            {currentProduct.ga4PropertyId && ` - GA4プロパティID: ${currentProduct.ga4PropertyId}`}
                        </p>
                    </div>
                )}
            </div>

            <p className={styles.monthCaption}>
                {stats?.month ? (() => {
                    const [y, m] = stats.month.split('-').map(Number)
                    return `${y}年${m}月` + (stats.month === defaultMonth ? '（今月）' : '')
                })() : ''}
            </p>

            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <h3 className={styles.statTitle}>テスト中のAB施策</h3>
                    <p className={`${styles.statValue} ${styles.statValueGreen}`}>
                        {stats?.abTestCount ?? 0}
                    </p>
                </div>
                <div className={styles.statCard}>
                    <h3 className={styles.statTitle}>ABテスト勝利数</h3>
                    <p className={`${styles.statValue} ${styles.statValueCyan}`}>
                        {stats?.abTestVictoryCount ?? 0}
                    </p>
                </div>
                <div className={styles.statCard}>
                    <h3 className={styles.statTitle}>追加したAB施策</h3>
                    <p className={`${styles.statValue} ${styles.statValuePurple}`}>
                        {stats?.abTestAddedThisMonth ?? 0}
                    </p>
                </div>
            </div>

            {stats?.abTestCountByStatus != null && stats?.abTestCompletedOutcome != null && (
                <AbTestDonutCharts
                    countByStatus={stats.abTestCountByStatus}
                    completedOutcome={stats.abTestCompletedOutcome}
                />
            )}

            {currentProduct?.ga4PropertyId && (
                <div className={styles.pageMetricsSection}>
                    <h2 className={styles.pageMetricsSectionTitle}>ページ別指標</h2>
                    <p className={styles.pageMetricsSectionDesc}>
                        エンゲージメントファネルで取得しているページパスを選択すると、そのページのGA4指標を表示します。
                    </p>
                    <div className={styles.pagePathRow}>
                        <div className={styles.pageControlRow}>
                            <label className={styles.pageControlLabel}>ページパス:</label>
                            <CustomSelect
                                className={styles.pagePathSelectWrapper}
                                value={pagePaths.length && pagePaths.includes(selectedPagePath) ? selectedPagePath : (pagePaths[0] ?? '')}
                                onChange={setSelectedPagePath}
                                options={pagePathsLoading ? [{ value: '', label: '取得中...' }] : pagePaths.length === 0 ? [{ value: '', label: '選択してください' }] : pagePaths.map((path) => ({ value: path, label: path === '/' ? '/' : path.length > 60 ? path.slice(0, 57) + '...' : path }))}
                                triggerClassName={styles.pagePathSelect}
                                disabled={pagePathsLoading}
                                placeholder="選択してください"
                                aria-label="ページパス選択"
                            />
                        </div>
                        <div className={styles.pageControlRow}>
                            <span className={styles.pageControlLabel}>集計:</span>
                            <div className={styles.granularityRow}>
                                <button
                                    type="button"
                                    onClick={() => setGranularity('daily')}
                                    className={granularity === 'daily' ? styles.granularityBtnActive : styles.granularityBtn}
                                >
                                    日別
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setGranularity('weekly')}
                                    className={granularity === 'weekly' ? styles.granularityBtnActive : styles.granularityBtn}
                                >
                                    週別
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setGranularity('monthly')}
                                    className={granularity === 'monthly' ? styles.granularityBtnActive : styles.granularityBtn}
                                >
                                    月別
                                </button>
                            </div>
                        </div>
                        <div className={styles.pageControlRow}>
                            <span className={styles.pageControlLabel}>期間を指定:</span>
                            <div className={styles.pageDateRangeRow}>
                                                                    <DateInput
                                                                    value={customStartDate}
                                    onChange={(e) => setCustomStartDate(e.target.value)}
                                    className={styles.pageDateInput}
                                />
                                <span className={styles.pageDateRangeSep}>〜</span>
                                                                    <DateInput
                                                                    value={customEndDate}
                                    onChange={(e) => setCustomEndDate(e.target.value)}
                                    className={styles.pageDateInput}
                                />
                                {(customStartDate || customEndDate) && (
                                    <button
                                        type="button"
                                        onClick={() => { setCustomStartDate(''); setCustomEndDate('') }}
                                        className={styles.pageDateClearBtn}
                                    >
                                        クリア
                                    </button>
                                )}
                            </div>
                        </div>
                        {selectedPagePath && (
                            <div className={styles.cvEventBlock}>
                                <div className={styles.cvEventRow}>
                                    <label className={styles.cvEventLabel}>CVの参照:</label>
                                    <CustomSelect
                                        className={styles.cvDimensionSelectWrapper}
                                        value={cvDimensionInput}
                                        onChange={setCvDimensionInput}
                                        options={CV_DIMENSION_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
                                        triggerClassName={styles.cvDimensionSelect}
                                        aria-label="CVの参照"
                                    />
                                </div>
                                <div className={styles.cvEventRow}>
                                    <label className={styles.cvEventLabel}>CVイベント名（このパス）:</label>
                                    <input
                                        type="text"
                                        value={cvEventInput}
                                        onChange={(e) => setCvEventInput(e.target.value)}
                                        placeholder="例: EF_StepForm_Step5-連絡先-CVボタン"
                                        className={styles.cvEventInput}
                                    />
                                    <button
                                        type="button"
                                        onClick={saveCvConfig}
                                        disabled={cvConfigSaving}
                                        className={styles.cvEventSaveButton}
                                    >
                                        {cvConfigSaving ? '保存中...' : '保存'}
                                    </button>
                                </div>
                            </div>
                        )}
                        <div className={styles.pageControlRow}>
                            <label className={styles.pageControlLabel}>GA4トークン（任意）:</label>
                            <input
                                type="password"
                                placeholder="未入力時は環境変数を使用"
                                value={ga4AccessToken}
                                onChange={(e) => setGa4AccessToken(e.target.value)}
                                className={styles.ga4TokenInput}
                            />
                        </div>
                    </div>
                    {pageMetricsLoading && selectedPagePath && (
                        <div className={styles.pageMetricsLoader}>
                            <Loader />
                        </div>
                    )}
                    {pageMetrics && !pageMetricsLoading && (
                        <>
                            <div className={styles.pageMetricsGrid}>
                                <div
                                    role="button"
                                    tabIndex={0}
                                    className={`${styles.statCard} ${styles.statCardClickable} ${styles.statCardFrame} ${chartMetric === 'pv' ? styles.statCardSelected : ''}`}
                                    onClick={() => setChartMetric('pv')}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setChartMetric('pv') } }}
                                >
                                    <span className={styles.statCardInner}>
                                        <h3 className={styles.statTitle}>PV<InfoTooltip text="ページビュー数。ユーザーがページを閲覧した総回数（リロード含む）。" /></h3>
                                        <p className={`${styles.statValue} ${styles.statValueBlue}`}>
                                            {pageMetrics.pv.toLocaleString()}
                                        </p>
                                        <p className={momChanges.pv == null ? styles.momNone : momChanges.pv >= 0 ? styles.momPositive : styles.momNegative}>
                                            {momChanges.pv == null ? '—' : `先月比 ${momChanges.pv >= 0 ? '+' : ''}${momChanges.pv.toFixed(1)}%`}
                                        </p>
                                    </span>
                                </div>
                                <div
                                    role="button"
                                    tabIndex={0}
                                    className={`${styles.statCard} ${styles.statCardClickable} ${styles.statCardFrame} ${chartMetric === 'cv' ? styles.statCardSelected : ''}`}
                                    onClick={() => setChartMetric('cv')}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setChartMetric('cv') } }}
                                >
                                    <span className={styles.statCardInner}>
                                        <h3 className={styles.statTitle}>CV<InfoTooltip text="コンバージョン数。設定したCVイベント（応募・会員登録など）が発生した回数。" /></h3>
                                        <p className={`${styles.statValue} ${styles.statValueGreen}`}>
                                            {pageMetrics.cv.toLocaleString()}
                                        </p>
                                        <p className={momChanges.cv == null ? styles.momNone : momChanges.cv >= 0 ? styles.momPositive : styles.momNegative}>
                                            {momChanges.cv == null ? '—' : `先月比 ${momChanges.cv >= 0 ? '+' : ''}${momChanges.cv.toFixed(1)}%`}
                                        </p>
                                    </span>
                                </div>
                                <div
                                    role="button"
                                    tabIndex={0}
                                    className={`${styles.statCard} ${styles.statCardClickable} ${styles.statCardFrame} ${chartMetric === 'cvr' ? styles.statCardSelected : ''}`}
                                    onClick={() => setChartMetric('cvr')}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setChartMetric('cvr') } }}
                                >
                                    <span className={styles.statCardInner}>
                                        <h3 className={styles.statTitle}>CVR<InfoTooltip text="コンバージョン率（CV ÷ PV × 100）。このページを見たユーザーのうちCVした割合。" /></h3>
                                        <p className={`${styles.statValue} ${styles.statValuePurple}`}>
                                            {pageMetrics.cvr.toFixed(2)}%
                                        </p>
                                        <p className={momChanges.cvr == null ? styles.momNone : momChanges.cvr >= 0 ? styles.momPositive : styles.momNegative}>
                                            {momChanges.cvr == null ? '—' : `先月比 ${momChanges.cvr >= 0 ? '+' : ''}${momChanges.cvr.toFixed(1)}%`}
                                        </p>
                                    </span>
                                </div>
                                <div
                                    role="button"
                                    tabIndex={0}
                                    className={`${styles.statCard} ${styles.statCardClickable} ${styles.statCardFrame} ${chartMetric === 'exitRate' ? styles.statCardSelected : ''}`}
                                    onClick={() => setChartMetric('exitRate')}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setChartMetric('exitRate') } }}
                                >
                                    <span className={styles.statCardInner}>
                                        <h3 className={styles.statTitle}>離脱率<InfoTooltip text="このページからサイトを離れた割合（exits ÷ pageViews）。数値が低いほど良好。" /></h3>
                                        <p className={`${styles.statValue} ${styles.statValuePink}`}>
                                            {pageMetrics.exitRate != null ? `${pageMetrics.exitRate.toFixed(2)}%` : '—'}
                                        </p>
                                        <p className={momChanges.exitRate == null ? styles.momNone : momChanges.exitRate <= 0 ? styles.momPositive : styles.momNegative}>
                                            {momChanges.exitRate == null ? '—' : `先月比 ${momChanges.exitRate >= 0 ? '+' : ''}${momChanges.exitRate.toFixed(1)}%`}
                                        </p>
                                    </span>
                                </div>
                                <div
                                    role="button"
                                    tabIndex={0}
                                    className={`${styles.statCard} ${styles.statCardClickable} ${styles.statCardFrame} ${chartMetric === 'newUserRate' ? styles.statCardSelected : ''}`}
                                    onClick={() => setChartMetric('newUserRate')}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setChartMetric('newUserRate') } }}
                                >
                                    <span className={styles.statCardInner}>
                                        <h3 className={styles.statTitle}>新規訪問率<InfoTooltip text="このページを訪れたユーザーのうち、初回訪問ユーザーの割合（newUsers ÷ activeUsers）。" /></h3>
                                        <p className={`${styles.statValue} ${styles.statValueCyan}`}>
                                            {pageMetrics.newUserRate.toFixed(2)}%
                                        </p>
                                        <p className={momChanges.newUserRate == null ? styles.momNone : momChanges.newUserRate >= 0 ? styles.momPositive : styles.momNegative}>
                                            {momChanges.newUserRate == null ? '—' : `先月比 ${momChanges.newUserRate >= 0 ? '+' : ''}${momChanges.newUserRate.toFixed(1)}%`}
                                        </p>
                                    </span>
                                </div>
                                <div
                                    role="button"
                                    tabIndex={0}
                                    className={`${styles.statCard} ${styles.statCardClickable} ${styles.statCardFrame} ${chartMetric === 'bounceCount' ? styles.statCardSelected : ''}`}
                                    onClick={() => setChartMetric('bounceCount')}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setChartMetric('bounceCount') } }}
                                >
                                    <span className={styles.statCardInner}>
                                        <h3 className={styles.statTitle}>直帰数<InfoTooltip text="このページ1ページのみ閲覧してサイトを離れたセッション数。直帰率ではなく実数値。" /></h3>
                                        <p className={`${styles.statValue} ${styles.statValueOrange}`}>
                                            {pageMetrics.bounceCount.toLocaleString()}
                                        </p>
                                        <p className={momChanges.bounceCount == null ? styles.momNone : momChanges.bounceCount <= 0 ? styles.momPositive : styles.momNegative}>
                                            {momChanges.bounceCount == null ? '—' : `先月比 ${momChanges.bounceCount >= 0 ? '+' : ''}${momChanges.bounceCount.toFixed(1)}%`}
                                        </p>
                                    </span>
                                </div>
                                <div
                                    role="button"
                                    tabIndex={0}
                                    className={`${styles.statCard} ${styles.statCardClickable} ${styles.statCardFrame} ${chartMetric === 'averageSessionDuration' ? styles.statCardSelected : ''}`}
                                    onClick={() => setChartMetric('averageSessionDuration')}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setChartMetric('averageSessionDuration') } }}
                                >
                                    <span className={styles.statCardInner}>
                                        <h3 className={styles.statTitle}>平均滞在時間<InfoTooltip text="1セッションあたりの平均滞在時間（averageSessionDuration）。GA4は離脱ページの滞在時間は計測されない。" /></h3>
                                        <p className={`${styles.statValue} ${styles.statValueCyan}`}>
                                            {pageMetrics.averageSessionDurationLabel}
                                        </p>
                                        <p className={momChanges.averageSessionDuration == null ? styles.momNone : momChanges.averageSessionDuration >= 0 ? styles.momPositive : styles.momNegative}>
                                            {momChanges.averageSessionDuration == null ? '—' : `先月比 ${momChanges.averageSessionDuration >= 0 ? '+' : ''}${momChanges.averageSessionDuration.toFixed(1)}%`}
                                        </p>
                                    </span>
                                </div>
                                <div
                                    role="button"
                                    tabIndex={0}
                                    className={`${styles.statCard} ${styles.statCardClickable} ${styles.statCardFrame} ${chartMetric === 'engagementRate' ? styles.statCardSelected : ''}`}
                                    onClick={() => setChartMetric('engagementRate')}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setChartMetric('engagementRate') } }}
                                >
                                    <span className={styles.statCardInner}>
                                        <h3 className={styles.statTitle}>エンゲージメント率<InfoTooltip text="エンゲージドセッション ÷ 全セッション。エンゲージドセッション＝10秒以上滞在 or 2ページ以上閲覧 or CVが発生したセッション。" /></h3>
                                        <p className={`${styles.statValue} ${styles.statValueGreen}`}>
                                            {pageMetrics.engagementRate.toFixed(2)}%
                                        </p>
                                        <p className={momChanges.engagementRate == null ? styles.momNone : momChanges.engagementRate >= 0 ? styles.momPositive : styles.momNegative}>
                                            {momChanges.engagementRate == null ? '—' : `先月比 ${momChanges.engagementRate >= 0 ? '+' : ''}${momChanges.engagementRate.toFixed(1)}%`}
                                        </p>
                                    </span>
                                </div>
                            </div>
                            <div className={styles.pageChartSection}>
                                <h3 className={styles.pageChartTitle}>推移グラフ</h3>
                                <p className={styles.pageChartPeriod}>対象期間: {getChartPeriodLabel(selectedMonth, granularity, customStartDate || null, customEndDate || null)}</p>
                                <PageMetricsChart
                                    chartData={chartData}
                                    chartMetric={chartMetric}
                                    granularity={granularity}
                                    isLoading={seriesLoading}
                                />
                            </div>
                        </>
                    )}
                </div>
            )}

            <div className={styles.quickAccess}>
                <h2 className={styles.quickAccessTitle}>クイックアクセス</h2>
                {QUICK_ACCESS_GROUPS.map((group) => (
                    <div key={group.label} className={styles.quickAccessGroup}>
                        <h3 className={styles.quickAccessGroupTitle}>{group.label}</h3>
                        <div className={styles.quickAccessGrid}>
                            {group.items.map((item) => {
                                const href = item.getHref(currentProduct?.id)
                                const subtitle = item.productPrefix && currentProduct ? `${currentProduct.name}の${item.subtitle}` : item.subtitle
                                return (
                                    <Link key={item.title} href={href} className={styles.quickAccessLink}>
                                        <span className={styles.quickAccessLinkInner}>
                                            <h3 className={styles.quickAccessLinkTitle}>{item.title}</h3>
                                            <p className={styles.quickAccessLinkText}>{subtitle}</p>
                                        </span>
                                        <span className={styles.quickAccessShine} aria-hidden />
                                        <span className={styles.quickAccessCorner} data-corner="tl" aria-hidden />
                                        <span className={styles.quickAccessCorner} data-corner="tr" aria-hidden />
                                        <span className={styles.quickAccessCorner} data-corner="bl" aria-hidden />
                                        <span className={styles.quickAccessCorner} data-corner="br" aria-hidden />
                                    </Link>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
