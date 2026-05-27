'use client'

import { useState, useEffect } from 'react'
import DateInput from '@/components/DateInput'
import BackLink from '@/components/BackLink'
import CustomSelect from '@/components/CustomSelect'
import Loader from '@/components/Loader'
import { useProduct } from '@/lib/contexts/ProductContext'
import {
    Bar,
    BarChart,
    Cell,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'
import type { ViewLabelRow, ViewLabelsByDevice } from './types'
import styles from './HeatmapPage.module.css'

function fmtLocal(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getDefaultDates() {
    const today = new Date()
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    return {
        startDate: fmtLocal(firstOfMonth),
        endDate: fmtLocal(today),
    }
}

const HEAT_COLORS = [
    '#dbeafe',
    '#93c5fd',
    '#3b82f6',
    '#1d4ed8',
    '#1e3a8a',
]

function getHeatColor(value: number, max: number): string {
    if (max <= 0) return HEAT_COLORS[0]
    const ratio = value / max
    const idx = Math.min(Math.floor(ratio * (HEAT_COLORS.length - 1)), HEAT_COLORS.length - 1)
    return HEAT_COLORS[idx] ?? HEAT_COLORS[0]
}

function DeviceChart({ title, rows, badge }: { title: string; rows: ViewLabelRow[]; badge?: string }) {
    const maxCount = rows.length > 0 ? Math.max(...rows.map((r) => r.count)) : 0
    return (
        <div className={styles.deviceChart}>
            <div className={styles.deviceChartHeader}>
                <h3 className={styles.deviceChartTitle}>{title}</h3>
                {badge && <span className={styles.deviceBadge}>{badge}</span>}
                <span className={styles.deviceTotal}>{rows.length} ラベル</span>
            </div>
            {rows.length === 0 ? (
                <p className={styles.emptyText}>データなし</p>
            ) : (
                <div className={styles.chartWrap}>
                    <ResponsiveContainer width="100%" height={Math.max(260, rows.length * 30)}>
                        <BarChart
                            data={rows}
                            layout="vertical"
                            margin={{ top: 4, right: 20, left: 8, bottom: 4 }}
                        >
                            <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                            <YAxis
                                type="category"
                                dataKey="viewLabel"
                                width={160}
                                tick={{ fontSize: 11, fill: '#d1d5db' }}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(v) => (String(v).length > 22 ? String(v).slice(0, 19) + '...' : v)}
                            />
                            <Tooltip
                                formatter={(value: number) => [value.toLocaleString(), 'イベント数']}
                                labelFormatter={(label) => `${label}`}
                                cursor={{ fill: 'rgba(255,255,255,0.08)' }}
                                contentStyle={{
                                    backgroundColor: '#1f2937',
                                    border: '1px solid #4b5563',
                                    borderRadius: '0.375rem',
                                    fontSize: '12px',
                                }}
                                labelStyle={{ color: '#f3f4f6', fontWeight: 600 }}
                                itemStyle={{ color: '#d1d5db' }}
                            />
                            <Bar dataKey="count" radius={[0, 3, 3, 0]} isAnimationActive={false}>
                                {rows.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={getHeatColor(entry.count, maxCount)} />
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
    const [accessToken, setAccessToken] = useState('')
    const [startDate, setStartDate] = useState(getDefaultDates().startDate)
    const [endDate, setEndDate] = useState(getDefaultDates().endDate)
    const [pagePaths, setPagePaths] = useState<string[]>([])
    const [pagePathsLoading, setPagePathsLoading] = useState(false)
    const [pagePath, setPagePath] = useState('')
    const [data, setData] = useState<ViewLabelsByDevice | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!currentProduct?.ga4PropertyId) {
            setPagePaths([])
            setPagePath('')
            return
        }
        let cancelled = false
        setPagePathsLoading(true)
        fetch('/api/heatmap/page-paths', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                productId: currentProduct.id,
                startDate,
                endDate,
                accessToken: accessToken.trim() || undefined,
            }),
        })
            .then((r) => r.json())
            .then((d) => {
                if (cancelled) return
                const paths = d.pagePaths ?? []
                setPagePaths(paths)
                if (paths.length && !paths.includes(pagePath)) {
                    setPagePath(paths.includes('/') ? '/' : paths[0] ?? '')
                }
            })
            .catch(() => { if (!cancelled) setPagePaths([]) })
            .finally(() => { if (!cancelled) setPagePathsLoading(false) })
        return () => { cancelled = true }
    }, [currentProduct?.id, currentProduct?.ga4PropertyId, startDate, endDate, accessToken])

    const handleFetch = async () => {
        if (!currentProduct) {
            setError('プロダクトを選択してください。')
            return
        }
        setLoading(true)
        setError(null)
        setData(null)
        try {
            const res = await fetch('/api/heatmap/view-labels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productId: currentProduct.id,
                    startDate,
                    endDate,
                    pagePath: pagePath.trim() || undefined,
                    accessToken: accessToken.trim() || undefined,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error || json.message || '取得に失敗しました')
            if (json.success && json.byDevice) {
                setData(json.byDevice)
            } else {
                setData({ mobile: [], desktop: [], tablet: [] })
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : '取得に失敗しました')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>ヒートマップ分析（view ラベル）</h1>
                <BackLink href="/">ダッシュボードに戻る</BackLink>
            </div>

            {!currentProduct ? (
                <div className={styles.placeholderCard}>
                    <p className={styles.description}>
                        プロダクトを選択してください。ダッシュボードでプロダクトを選んでからこのページを開いてください。
                    </p>
                </div>
            ) : (
                <>
                    <div className={styles.formCard}>
                        <h2 className={styles.formTitle}>条件</h2>
                        <div className={styles.formRow}>
                            <label className={styles.label}>プロダクト</label>
                            <span className={styles.value}>{currentProduct.name}</span>
                        </div>
                        <div className={styles.formRow}>
                            <label className={styles.label} htmlFor="heatmap-start">開始日</label>
                            <DateInput id="heatmap-start" className={styles.input} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                        </div>
                        <div className={styles.formRow}>
                            <label className={styles.label} htmlFor="heatmap-end">終了日</label>
                            <DateInput id="heatmap-end" className={styles.input} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                        </div>
                        <div className={styles.formRow}>
                            <label className={styles.label} id="heatmap-pagepath-label">ページパス（任意）</label>
                            <CustomSelect
                                value={
                                    pagePath === '' || (pagePaths.length > 0 && pagePaths.includes(pagePath))
                                        ? pagePath
                                        : (pagePaths[0] ?? '')
                                }
                                onChange={setPagePath}
                                options={
                                    pagePathsLoading
                                        ? [{ value: '', label: '取得中...' }]
                                        : [
                                            { value: '', label: '指定しない（全体）' },
                                            ...pagePaths.map((path) => ({
                                                value: path,
                                                label: path === '/' ? '/' : path.length > 60 ? path.slice(0, 57) + '...' : path,
                                            })),
                                        ]
                                }
                                triggerClassName={styles.select}
                                disabled={pagePathsLoading}
                                placeholder="選択してください"
                                aria-labelledby="heatmap-pagepath-label"
                            />
                        </div>
                        <div className={styles.formRow}>
                            <label className={styles.label} htmlFor="heatmap-token">GA4 アクセストークン（任意）</label>
                            <input
                                id="heatmap-token"
                                type="password"
                                className={styles.input}
                                placeholder="未入力時は環境変数を使用"
                                value={accessToken}
                                onChange={(e) => setAccessToken(e.target.value)}
                            />
                        </div>
                        <div className={styles.formActions}>
                            <button type="button" className={styles.submitButton} onClick={handleFetch} disabled={loading}>
                                {loading ? '取得中...' : 'view ラベルを取得'}
                            </button>
                        </div>
                    </div>

                    {loading && <div className={styles.loaderWrap}><Loader /></div>}

                    {error && <div className={styles.errorCard}><p className={styles.errorText}>{error}</p></div>}

                    {!loading && data && (
                        <div className={styles.resultCard}>
                            <h2 className={styles.resultTitle}>view ラベル別イベント数（デバイス別）</h2>
                            <div className={styles.chartsGrid}>
                                <DeviceChart title="SP" rows={data.mobile} badge="mobile" />
                                <DeviceChart title="PC" rows={data.desktop} badge="desktop" />
                                {data.tablet.length > 0 && (
                                    <DeviceChart title="タブレット" rows={data.tablet} badge="tablet" />
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
