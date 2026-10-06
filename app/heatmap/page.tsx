'use client'

import { useEffect, useState } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import PageShell from '@/components/PageShell'
import FilterBar, { FilterField } from '@/components/FilterBar'
import PeriodSelect from '@/components/PeriodSelect'
import { ui, cx } from '@/components/ui'
import { useProduct } from '@/lib/contexts/ProductContext'
import { usePeriodRange } from '@/hooks/usePeriodRange'
import { useReport } from '@/hooks/useReport'
import type { HeatmapPagePathsResponse, HeatmapViewLabelsResponse, ViewLabelRow } from '@/lib/services/heatmap/heatmapTypes'
import styles from './HeatmapPage.module.css'

/** 件数の多さを 5 段階の青で表す（薄 → 濃） */
const HEAT_COLORS = ['#dbeafe', '#93c5fd', '#3b82f6', '#2563eb', '#1e3a8a']

function getHeatColor(value: number, max: number): string {
    if (max <= 0) return HEAT_COLORS[0]
    const idx = Math.min(Math.floor((value / max) * (HEAT_COLORS.length - 1)), HEAT_COLORS.length - 1)
    return HEAT_COLORS[idx] ?? HEAT_COLORS[0]
}

function shortPath(path: string): string {
    return path.length > 60 ? `${path.slice(0, 57)}...` : path
}

function DeviceChart({ title, rows, badge }: { title: string; rows: ViewLabelRow[]; badge: string }) {
    const maxCount = rows.length > 0 ? Math.max(...rows.map((r) => r.count)) : 0
    return (
        <div className={styles.deviceChart}>
            <div className={styles.deviceChartHeader}>
                <h3 className={styles.deviceChartTitle}>{title}</h3>
                <span className={styles.deviceBadge}>{badge}</span>
                <span className={styles.deviceTotal}>{rows.length} ラベル</span>
            </div>
            {rows.length === 0 ? (
                <p className={ui.empty}>データなし</p>
            ) : (
                <div className={styles.chartWrap}>
                    <ResponsiveContainer width="100%" height={Math.max(260, rows.length * 30)}>
                        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
                            <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                            <YAxis
                                type="category"
                                dataKey="viewLabel"
                                width={160}
                                tick={{ fontSize: 11 }}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(v) => (String(v).length > 22 ? `${String(v).slice(0, 19)}...` : v)}
                            />
                            <Tooltip
                                formatter={(value: number) => [value.toLocaleString(), 'イベント数']}
                                cursor={{ fill: 'var(--bg-hover)' }}
                                contentStyle={{
                                    backgroundColor: 'var(--bg-raised)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 'var(--radius-sm)',
                                    fontSize: '12px',
                                }}
                                labelStyle={{ color: 'var(--text-strong)', fontWeight: 600 }}
                                itemStyle={{ color: 'var(--text-primary)' }}
                            />
                            <Bar dataKey="count" radius={[0, 3, 3, 0]} isAnimationActive={false}>
                                {rows.map((entry) => (
                                    <Cell key={entry.viewLabel} fill={getHeatColor(entry.count, maxCount)} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    )
}

export default function HeatmapPage() {
    const { currentProduct } = useProduct()
    const productId = currentProduct?.id
    // 旧実装の既定は今月（1日〜今日）
    const periodState = usePeriodRange('thisMonth')
    const { range } = periodState
    const [pagePath, setPagePath] = useState('')

    // 期間内に view ラベルのあるページパス（セレクトの候補）
    const paths = useReport<HeatmapPagePathsResponse>('/api/heatmap/page-paths', {
        body: { productId, startDate: range?.startDate, endDate: range?.endDate },
        enabled: !!productId && !!range,
        keepPreviousData: true,
    })
    const pagePaths = paths.data?.pagePaths ?? []

    // 候補が変わって今の選択が無くなったら「/」か先頭に寄せる（旧実装と同じ）
    useEffect(() => {
        if (!paths.data) return
        const list = paths.data.pagePaths
        if (list.length && !list.includes(pagePath)) setPagePath(list.includes('/') ? '/' : list[0])
    }, [paths.data]) // eslint-disable-line react-hooks/exhaustive-deps

    // 期間・ページパスを変えると即再取得（旧実装は「view ラベルを取得」ボタン）
    const report = useReport<HeatmapViewLabelsResponse>('/api/heatmap/view-labels', {
        body: { productId, startDate: range?.startDate, endDate: range?.endDate, pagePath: pagePath || undefined },
        enabled: !!productId && !!range,
        keepPreviousData: true,
    })
    const data = report.data?.byDevice ?? null
    const totalLabels = data ? new Set([...data.mobile, ...data.desktop, ...data.tablet].map((r) => r.viewLabel)).size : 0

    return (
        <PageShell
            pageId="heatmap"
            requireProduct
            status={{ loading: report.loading, error: report.error, source: 'ga4', onRetry: report.run }}
            keepChildrenWhileLoading
            controls={
                <FilterBar>
                    <FilterField label="期間">
                        <PeriodSelect state={periodState} resolved={report.data ? { startDate: report.data.startDate, endDate: report.data.endDate } : null} />
                    </FilterField>
                    <FilterField label="ページパス" hint={paths.loading ? '候補を取得中...' : undefined}>
                        <select
                            className={cx(ui.select, styles.pathSelect)}
                            value={pagePaths.includes(pagePath) ? pagePath : ''}
                            onChange={(e) => setPagePath(e.target.value)}
                            disabled={paths.loading && pagePaths.length === 0}
                            aria-label="ページパス"
                        >
                            <option value="">指定しない（全体）</option>
                            {pagePaths.map((path) => (
                                <option key={path} value={path}>{shortPath(path)}</option>
                            ))}
                        </select>
                    </FilterField>
                </FilterBar>
            }
        >
            {data && (
                <div className={ui.card}>
                    <h2 className={ui.sectionTitle}>view ラベル別イベント数（デバイス別）</h2>
                    <p className={ui.sectionNote}>
                        {pagePath ? <>対象ページ: <code>{pagePath}</code>。</> : '全ページ合算。'}
                        GTM の view ラベル（要素が画面に入ったときのイベント）を集計し、色が濃いほど件数が多いことを示します。
                        {totalLabels > 0 && ` ラベル種類: ${totalLabels}`}
                    </p>
                    <div className={styles.chartsGrid}>
                        <DeviceChart title="SP" rows={data.mobile} badge="mobile" />
                        <DeviceChart title="PC" rows={data.desktop} badge="desktop" />
                        {data.tablet.length > 0 && <DeviceChart title="タブレット" rows={data.tablet} badge="tablet" />}
                    </div>
                </div>
            )}
        </PageShell>
    )
}
