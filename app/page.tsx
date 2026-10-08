'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import DateInput from '@/components/DateInput'
import Link from '@/components/Link'
import InfoTooltip from '@/components/InfoTooltip'
import PageShell from '@/components/PageShell'
import FilterBar, { FilterField } from '@/components/FilterBar'
import LoadState from '@/components/LoadState'
import AbTestDonutCharts from '@/components/dashboard/AbTestDonutCharts'
import BusinessKpiSection from '@/components/dashboard/BusinessKpiSection'
import PageMetricsChart from '@/components/dashboard/PageMetricsChart'
import { ui, cx } from '@/components/ui'
import { useProduct } from '@/contexts/ProductContext'
import { useReport } from '@/hooks/useReport'
import { navGroups } from '@/lib/registry'
import { CHART_COLORS } from '@/lib/constants/chartColors'
import type { DashboardStats } from '@/app/dashboard/types'
import type { ChartMetric, Granularity, PageMetricsResponse, PageMetricsSeriesResponse, SeriesDataPoint } from '@/lib/services/dashboard/pageMetricsTypes'
import { monthToRange, rangeForGranularity } from '@/lib/services/dashboard/pageMetricsPeriod'
import { getChartPeriodLabel, getMonthOptions, periodToTimestamp } from '@/app/dashboard/utils'
import styles from './DashboardPage.module.css'

const GRANULARITIES: ReadonlyArray<{ id: Granularity; label: string }> = [
    { id: 'daily', label: '日別' },
    { id: 'weekly', label: '週別' },
    { id: 'monthly', label: '月別' },
]

/** 推移グラフで選べる 6 指標。カードの並び順＝CSS の nth-child 配色 */
const METRIC_CARDS: ReadonlyArray<{ key: ChartMetric; label: string; tooltip: string; valueClass: string; lowerIsBetter?: boolean }> = [
    { key: 'pv', label: 'PV', tooltip: 'ページビュー数。ユーザーがページを閲覧した総回数（リロード含む）。', valueClass: 'statValueBlue' },
    { key: 'exitRate', label: '離脱率', tooltip: 'このページからサイトを離れた割合（exits ÷ pageViews）。数値が低いほど良好。', valueClass: 'statValuePink', lowerIsBetter: true },
    { key: 'newUserRate', label: '新規訪問率', tooltip: 'このページを訪れたユーザーのうち、初回訪問ユーザーの割合（newUsers ÷ activeUsers）。', valueClass: 'statValueCyan' },
    { key: 'bounceCount', label: '直帰数', tooltip: 'このページ1ページのみ閲覧してサイトを離れたセッション数。直帰率ではなく実数値。', valueClass: 'statValueOrange', lowerIsBetter: true },
    { key: 'averageSessionDuration', label: '平均滞在時間', tooltip: '1セッションあたりの平均滞在時間（averageSessionDuration）。GA4は離脱ページの滞在時間は計測されない。', valueClass: 'statValueCyan' },
    { key: 'engagementRate', label: 'エンゲージメント率', tooltip: 'エンゲージドセッション ÷ 全セッション。エンゲージドセッション＝10秒以上滞在 or 2ページ以上閲覧 or CVが発生したセッション。', valueClass: 'statValueGreen' },
]

const currentMonth = () => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
const previousMonth = (month: string) => {
    const [y, m] = month.split('-').map(Number)
    return m <= 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}
const pctChange = (cur: number | null | undefined, prev: number | null | undefined) =>
    prev == null || prev === 0 || cur == null ? null : ((cur - prev) / prev) * 100

function metricValue(m: PageMetricsResponse, key: ChartMetric): string {
    switch (key) {
        case 'pv': return m.pv.toLocaleString()
        case 'exitRate': return m.exitRate != null ? `${m.exitRate.toFixed(2)}%` : '—'
        case 'newUserRate': return `${m.newUserRate.toFixed(2)}%`
        case 'bounceCount': return m.bounceCount.toLocaleString()
        case 'averageSessionDuration': return m.averageSessionDurationLabel
        case 'engagementRate': return `${m.engagementRate.toFixed(2)}%`
        default: return '—'
    }
}
function metricNumber(m: PageMetricsResponse, key: ChartMetric): number | null {
    switch (key) {
        case 'pv': return m.pv
        case 'exitRate': return m.exitRate
        case 'newUserRate': return m.newUserRate
        case 'bounceCount': return m.bounceCount
        case 'averageSessionDuration': return m.averageSessionDurationSeconds
        case 'engagementRate': return m.engagementRate
        default: return null
    }
}

export default function DashboardPage() {
    const { currentProduct, setCurrentProduct, products, loading: productsLoading } = useProduct()
    const productId = currentProduct?.id
    const propertyId = currentProduct?.ga4PropertyId ?? ''
    const [selectedMonth, setSelectedMonth] = useState(currentMonth)
    const [selectedPagePath, setSelectedPagePath] = useState('/')
    const [granularity, setGranularity] = useState<Granularity>('daily')
    const [chartMetric, setChartMetric] = useState<ChartMetric>('pv')
    const [customStartDate, setCustomStartDate] = useState('')
    const [customEndDate, setCustomEndDate] = useState('')
    const useCustomRange = Boolean(customStartDate && customEndDate)

    // KPI サマリー（AB テスト件数など。DB 由来）
    const stats = useReport<DashboardStats>(`/api/dashboard?productId=${productId ?? ''}&month=${selectedMonth}`, {
        enabled: !!productId,
        keepPreviousData: true,
    })

    // ページ別指標の候補パス（エンゲージメントファネルで取得しているページ）
    const monthRange = useMemo(() => monthToRange(selectedMonth), [selectedMonth])
    const paths = useReport<{ pagePaths?: string[] }>('/api/funnel/engagement/page-paths', {
        body: { propertyId, startDate: monthRange.startDate, endDate: monthRange.endDate },
        enabled: !!propertyId,
        keepPreviousData: true,
    })
    const pagePaths = paths.data?.pagePaths ?? []
    useEffect(() => {
        if (!paths.data) return
        const list = paths.data.pagePaths ?? []
        if (list.length && !list.includes(selectedPagePath)) setSelectedPagePath(list.includes('/') ? '/' : list[0])
    }, [paths.data]) // eslint-disable-line react-hooks/exhaustive-deps

    // 今期間の指標。カスタム期間 > 月（日別）> 集計単位に応じた期間
    const metricsBody = useMemo(() => {
        const base = { propertyId, productId, pagePath: selectedPagePath }
        if (useCustomRange) return { ...base, startDate: customStartDate, endDate: customEndDate }
        if (granularity === 'daily') return { ...base, month: selectedMonth }
        return { ...base, ...rangeForGranularity(selectedMonth, granularity) }
    }, [propertyId, productId, selectedPagePath, useCustomRange, customStartDate, customEndDate, granularity, selectedMonth])
    const metricsEnabled = !!propertyId && !!selectedPagePath
    const metrics = useReport<PageMetricsResponse>('/api/dashboard/page-metrics', { body: metricsBody, enabled: metricsEnabled, keepPreviousData: true })
    // 先月比（カスタム期間では出さない）
    const metricsPrev = useReport<PageMetricsResponse>('/api/dashboard/page-metrics', {
        body: { propertyId, productId, pagePath: selectedPagePath, month: previousMonth(selectedMonth) },
        enabled: metricsEnabled && !useCustomRange,
        keepPreviousData: true,
    })
    const series = useReport<PageMetricsSeriesResponse>('/api/dashboard/page-metrics/series', {
        body: useCustomRange
            ? { propertyId, productId, pagePath: selectedPagePath, startDate: customStartDate, endDate: customEndDate, granularity }
            : { propertyId, productId, pagePath: selectedPagePath, month: selectedMonth, granularity },
        enabled: metricsEnabled,
        keepPreviousData: true,
    })

    const chartData = useMemo<SeriesDataPoint[]>(
        () => (series.data?.series ?? []).map((d) => ({ ...d, t: periodToTimestamp(d.period, granularity) })),
        [series.data, granularity],
    )
    const pageMetrics = metrics.data
    const prev = useCustomRange ? null : metricsPrev.data

    const [sy, sm] = selectedMonth.split('-').map(Number)
    const monthLabel = `${sy}年${sm}月${selectedMonth === currentMonth() ? '（今月）' : ''}`

    return (
        <PageShell
            pageId="dashboard"
            width="wide"
            back={null}
            related={false}
            subtitle={`${monthLabel}のサマリー。${currentProduct ? `${currentProduct.name}${currentProduct.domain ? `（${currentProduct.domain}）` : ''}${propertyId ? ` / GA4 プロパティ ${propertyId}` : ''}` : 'プロダクトを選んでください'}`}
            status={{ loading: stats.loading && !stats.data, error: stats.error, source: 'db', onRetry: stats.run }}
            keepChildrenWhileLoading
            controls={
                <FilterBar>
                    <FilterField label="プロダクト">
                        <select
                            className={ui.select}
                            value={String(productId ?? '')}
                            onChange={(e) => { const p = products.find((x) => x.id === parseInt(e.target.value, 10)); if (p) setCurrentProduct(p) }}
                            disabled={productsLoading}
                            aria-label="プロダクト選択"
                        >
                            {products.length === 0 && <option value="">プロダクトがありません</option>}
                            {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.domain ? ` (${p.domain})` : ''}</option>)}
                        </select>
                    </FilterField>
                    <FilterField label="表示月">
                        <select className={ui.select} value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} aria-label="表示月選択">
                            {getMonthOptions().map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                    </FilterField>
                </FilterBar>
            }
        >
            {/* 事業の数字を最初に出す。出典はプロダクトDBで、下の GA4 由来の指標とは別系統 */}
            <BusinessKpiSection selectedMonth={selectedMonth} />

            {stats.data && (
                <div className={ui.summaryRow}>
                    <div className={ui.summaryCard} style={{ '--summary-accent': CHART_COLORS.green } as CSSProperties}>
                        <span className={ui.summaryLabel}>テスト中のAB施策</span>
                        <span className={ui.summaryValue}>{stats.data.abTestCount ?? 0}</span>
                    </div>
                    <div className={ui.summaryCard} style={{ '--summary-accent': CHART_COLORS.cyan } as CSSProperties}>
                        <span className={ui.summaryLabel}>ABテスト勝利数</span>
                        <span className={ui.summaryValue}>{stats.data.abTestVictoryCount ?? 0}</span>
                    </div>
                    <div className={ui.summaryCard} style={{ '--summary-accent': CHART_COLORS.violet } as CSSProperties}>
                        <span className={ui.summaryLabel}>追加したAB施策</span>
                        <span className={ui.summaryValue}>{stats.data.abTestAddedThisMonth ?? 0}</span>
                    </div>
                </div>
            )}

            {stats.data?.abTestCountByStatus != null && stats.data?.abTestCompletedOutcome != null && (
                <AbTestDonutCharts countByStatus={stats.data.abTestCountByStatus} completedOutcome={stats.data.abTestCompletedOutcome} productId={productId} />
            )}

            {propertyId && (
                <div className={ui.card}>
                    <h2 className={ui.sectionTitle}>ページ別指標</h2>
                    <p className={ui.sectionNote}>エンゲージメントファネルで取得しているページパスを選択すると、そのページのGA4指標を表示します。カードをクリックすると推移グラフの指標が切り替わります。</p>
                    <FilterBar>
                        <FilterField label="ページパス" hint={paths.loading ? '候補を取得中...' : undefined}>
                            <select
                                className={cx(ui.select, styles.pathSelect)}
                                value={pagePaths.includes(selectedPagePath) ? selectedPagePath : ''}
                                onChange={(e) => setSelectedPagePath(e.target.value)}
                                disabled={paths.loading && pagePaths.length === 0}
                                aria-label="ページパス選択"
                            >
                                {pagePaths.length === 0 && <option value="">{paths.loading ? '取得中...' : '選択してください'}</option>}
                                {pagePaths.map((path) => <option key={path} value={path}>{path.length > 60 ? `${path.slice(0, 57)}...` : path}</option>)}
                            </select>
                        </FilterField>
                        <FilterField label="集計">
                            <div className={ui.tabs} role="tablist">
                                {GRANULARITIES.map((g) => (
                                    <button key={g.id} type="button" role="tab" aria-selected={granularity === g.id} className={cx(ui.tab, granularity === g.id && ui.tabActive)} onClick={() => setGranularity(g.id)}>
                                        {g.label}
                                    </button>
                                ))}
                            </div>
                        </FilterField>
                        <FilterField label="期間を指定" hint="指定すると表示月より優先。先月比は出ません">
                            <DateInput value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} aria-label="開始日" />
                            <span className={ui.note}>〜</span>
                            <DateInput value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} aria-label="終了日" />
                            {(customStartDate || customEndDate) && (
                                <button type="button" className={ui.btnGhost} onClick={() => { setCustomStartDate(''); setCustomEndDate('') }}>クリア</button>
                            )}
                        </FilterField>
                    </FilterBar>

                    <LoadState loading={metrics.loading && !pageMetrics} error={metrics.error} source="ga4" variant="inline" onRetry={metrics.run}>
                        {pageMetrics && (
                            <>
                                <div className={styles.pageMetricsGrid}>
                                    {METRIC_CARDS.map((card) => {
                                        const change = prev ? pctChange(metricNumber(pageMetrics, card.key), metricNumber(prev, card.key)) : null
                                        const good = change == null ? null : card.lowerIsBetter ? change <= 0 : change >= 0
                                        return (
                                            <div
                                                key={card.key}
                                                role="button"
                                                tabIndex={0}
                                                aria-pressed={chartMetric === card.key}
                                                className={cx(styles.statCard, styles.statCardClickable, chartMetric === card.key && styles.statCardSelected)}
                                                onClick={() => setChartMetric(card.key)}
                                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setChartMetric(card.key) } }}
                                            >
                                                <span className={styles.statCardInner}>
                                                    <h3 className={styles.statTitle}>{card.label}<InfoTooltip text={card.tooltip} /></h3>
                                                    <p className={cx(styles.statValue, styles[card.valueClass])}>{metricValue(pageMetrics, card.key)}</p>
                                                    <p className={change == null ? styles.momNone : good ? styles.momPositive : styles.momNegative}>
                                                        {change == null ? '—' : `先月比 ${change >= 0 ? '+' : ''}${change.toFixed(1)}%`}
                                                    </p>
                                                </span>
                                            </div>
                                        )
                                    })}
                                </div>
                                <div className={styles.pageChartSection}>
                                    <h3 className={styles.pageChartTitle}>推移グラフ</h3>
                                    <p className={ui.note}>対象期間: {getChartPeriodLabel(selectedMonth, granularity, customStartDate || null, customEndDate || null)}</p>
                                    <PageMetricsChart chartData={chartData} chartMetric={chartMetric} granularity={granularity} isLoading={series.loading} />
                                </div>
                            </>
                        )}
                    </LoadState>
                </div>
            )}

            <div className={styles.quickAccess}>
                <h2 className={ui.sectionTitle}>クイックアクセス</h2>
                {navGroups(productId).map((group) => (
                    <div key={group.id} className={styles.quickAccessGroup}>
                        <h3 className={styles.quickAccessGroupTitle}>{group.label}</h3>
                        {group.hint && <p className={styles.quickAccessGroupHint}>{group.hint}</p>}
                        <div className={styles.quickAccessGrid}>
                            {group.items.map((item) => {
                                const subtitle = item.productScoped && currentProduct ? `${currentProduct.name}の${item.subtitle}` : item.subtitle
                                return (
                                    <Link key={item.id} href={item.href} className={styles.quickAccessLink}>
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
        </PageShell>
    )
}
