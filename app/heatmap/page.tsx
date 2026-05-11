'use client'

import { useState, useEffect } from 'react'
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
import type { ViewLabelRow } from './types'
import styles from './HeatmapPage.module.css'

function getDefaultDates() {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 28)
    return {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
    }
}

const HEAT_COLORS = [
    '#dbeafe', // 50
    '#93c5fd', // 300
    '#3b82f6', // 500
    '#1d4ed8', // 700
    '#1e3a8a', // 900
]

function getHeatColor(value: number, max: number): string {
    if (max <= 0) return HEAT_COLORS[0]
    const ratio = value / max
    const idx = Math.min(
        Math.floor(ratio * (HEAT_COLORS.length - 1)),
        HEAT_COLORS.length - 1
    )
    return HEAT_COLORS[idx] ?? HEAT_COLORS[0]
}

export default function HeatmapPage() {
    const { currentProduct } = useProduct()
    const [accessToken, setAccessToken] = useState('')
    const [startDate, setStartDate] = useState(getDefaultDates().startDate)
    const [endDate, setEndDate] = useState(getDefaultDates().endDate)
    const [pagePaths, setPagePaths] = useState<string[]>([])
    const [pagePathsLoading, setPagePathsLoading] = useState(false)
    const [pagePath, setPagePath] = useState('')
    const [data, setData] = useState<ViewLabelRow[] | null>(null)
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
        fetch('/api/funnel/engagement/page-paths', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                propertyId: currentProduct.ga4PropertyId,
                startDate,
                endDate,
                accessToken: accessToken.trim() || undefined,
            }),
        })
            .then((r) => r.json())
            .then((data) => {
                if (cancelled) return
                const paths = data.pagePaths ?? []
                setPagePaths(paths)
                if (paths.length && !paths.includes(pagePath)) {
                    setPagePath(paths.includes('/') ? '/' : paths[0] ?? '')
                }
            })
            .catch(() => {
                if (!cancelled) setPagePaths([])
            })
            .finally(() => {
                if (!cancelled) setPagePathsLoading(false)
            })
        return () => {
            cancelled = true
        }
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
            if (!res.ok) {
                throw new Error(json.error || json.message || '取得に失敗しました')
            }
            if (json.success && Array.isArray(json.data)) {
                setData(json.data)
            } else {
                setData([])
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : '取得に失敗しました')
        } finally {
            setLoading(false)
        }
    }

    const maxCount = data && data.length > 0 ? Math.max(...data.map((r) => r.count)) : 0

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
                            <label className={styles.label} htmlFor="heatmap-start">
                                開始日
                            </label>
                            <input
                                id="heatmap-start"
                                type="date"
                                className={styles.input}
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                        </div>
                        <div className={styles.formRow}>
                            <label className={styles.label} htmlFor="heatmap-end">
                                終了日
                            </label>
                            <input
                                id="heatmap-end"
                                type="date"
                                className={styles.input}
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                            />
                        </div>
                        <div className={styles.formRow}>
                            <label className={styles.label} id="heatmap-pagepath-label">
                                ページパス（任意）
                            </label>
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
                            <label className={styles.label} htmlFor="heatmap-token">
                                GA4 アクセストークン（任意）
                            </label>
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
                            <button
                                type="button"
                                className={styles.submitButton}
                                onClick={handleFetch}
                                disabled={loading}
                            >
                                {loading ? '取得中...' : 'view ラベルを取得'}
                            </button>
                        </div>
                    </div>

                    {loading && (
                        <div className={styles.loaderWrap}>
                            <Loader />
                        </div>
                    )}

                    {error && (
                        <div className={styles.errorCard}>
                            <p className={styles.errorText}>{error}</p>
                        </div>
                    )}

                    {!loading && data && (
                        <div className={styles.resultCard}>
                            <h2 className={styles.resultTitle}>view ラベル別イベント数（上＝ページ上部に近い想定）</h2>
                            {data.length === 0 ? (
                                <p className={styles.emptyText}>
                                    該当期間に view_label のイベントがありません。サイトで view ラベルが送信されているか確認してください。
                                </p>
                            ) : (
                                <div className={styles.chartWrap}>
                                    <ResponsiveContainer width="100%" height={Math.max(300, data.length * 32)}>
                                        <BarChart
                                            data={data}
                                            layout="vertical"
                                            margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                                        >
                                            <XAxis type="number" tick={{ fontSize: 12, fill: '#ffffff' }} />
                                            <YAxis
                                                type="category"
                                                dataKey="viewLabel"
                                                width={180}
                                                tick={{ fontSize: 12, fill: '#ffffff' }}
                                                tickFormatter={(v) => (String(v).length > 24 ? String(v).slice(0, 21) + '...' : v)}
                                            />
                                            <Tooltip
                                                formatter={(value: number) => [value.toLocaleString(), 'イベント数']}
                                                labelFormatter={(label) => `view ラベル: ${label}`}
                                                cursor={{ fill: 'rgba(255,255,255,0.12)' }}
                                                contentStyle={{
                                                    backgroundColor: '#1f2937',
                                                    border: '1px solid #4b5563',
                                                    borderRadius: '0.375rem',
                                                }}
                                                labelStyle={{ color: '#ffffff' }}
                                            />
                                            <Bar dataKey="count" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                                                {data.map((entry, index) => (
                                                    <Cell
                                                        key={`cell-${index}`}
                                                        fill={getHeatColor(entry.count, maxCount)}
                                                    />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
