'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import BackLink from '@/components/BackLink'
import DateInput from '@/components/DateInput'
import Loader from '@/components/Loader'
import styles from './DailyPage.module.css'

interface VariantDaily {
    pv: number
    cv: number
    cvr: number
    cumPv: number
    cumCv: number
    cumCvr: number
}

type DayRow = { date: string } & Partial<Record<'A' | 'B' | 'C' | 'D', VariantDaily>>

const VARIANT_COLORS: Record<string, string> = {
    A: '#93c5fd',
    B: '#86efac',
    C: '#c4b5fd',
    D: '#fdba74',
}

export default function AbTestDailyCvrPage() {
    const params = useParams()
    const abTestId = params?.id as string

    // 初回はAPI側のデフォルト（テスト期間）で取得し、レスポンスの期間をフォームに反映する
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [abTestName, setAbTestName] = useState('')
    const [days, setDays] = useState<DayRow[] | null>(null)
    const [variants, setVariants] = useState<string[]>([])
    const [mode, setMode] = useState<'daily' | 'cumulative'>('cumulative')

    useEffect(() => {
        if (abTestId) handleFetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [abTestId])

    async function handleFetch(e?: React.FormEvent) {
        if (e) e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            const res = await fetch(`/api/ab-test/${abTestId}/daily`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    startDate: startDate || undefined,
                    endDate: endDate || undefined,
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.message || data.error || '取得に失敗しました')

            setAbTestName(data.abTestName ?? '')
            setDays(data.days ?? [])
            setVariants(data.variants ?? [])
            if (data.startDate) setStartDate(data.startDate)
            if (data.endDate) setEndDate(data.endDate)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'エラーが発生しました')
            setDays(null)
        } finally {
            setLoading(false)
        }
    }

    const chartData = (days ?? []).map((d) => {
        const row: Record<string, string | number | null> = { date: d.date }
        for (const v of variants) {
            const r = d[v as 'A' | 'B' | 'C' | 'D']
            row[v] = r ? (mode === 'cumulative' ? r.cumCvr : r.cvr) * 100 : null
        }
        return row
    })

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>日次CVR推移</h1>
                    {abTestName && <p className={styles.subtitle}>{abTestName}</p>}
                </div>
                <BackLink href={`/ab-test/${abTestId}`}>ABテスト詳細に戻る</BackLink>
            </div>

            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>条件</h2>
                <form onSubmit={handleFetch}>
                    <div className={styles.formGrid}>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>開始日</label>
                            <DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)} className={styles.formInput} />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>終了日</label>
                            <DateInput value={endDate} onChange={(e) => setEndDate(e.target.value)} className={styles.formInput} />
                        </div>
                    </div>
                    <div className={styles.formActions}>
                        <button type="submit" disabled={loading} className="executionButton">
                            {loading ? '取得中...' : '推移を取得'}
                        </button>
                    </div>
                </form>
            </div>

            {error && (
                <div className={styles.errorBox}>
                    <p className={styles.errorTitle}>エラー</p>
                    <p>{error}</p>
                </div>
            )}

            {loading && (
                <div className={styles.loaderContainer}>
                    <Loader />
                    <span>日次データを取得中...</span>
                </div>
            )}

            {days && !loading && (
                <div className={styles.section}>
                    <div className={styles.resultHeader}>
                        <p className={styles.resultTitle}>
                            バリアント別CVR推移（{mode === 'cumulative' ? '累積' : '日次'}）
                        </p>
                        <div className={styles.modeTabs}>
                            <button
                                type="button"
                                className={`${styles.modeTab} ${mode === 'cumulative' ? styles.modeTabActive : ''}`}
                                onClick={() => setMode('cumulative')}
                            >
                                累積CVR
                            </button>
                            <button
                                type="button"
                                className={`${styles.modeTab} ${mode === 'daily' ? styles.modeTabActive : ''}`}
                                onClick={() => setMode('daily')}
                            >
                                日次CVR
                            </button>
                        </div>
                    </div>

                    {days.length === 0 ? (
                        <p className={styles.empty}>データがありません。期間を調整して再試行してください。</p>
                    ) : (
                        <>
                            <ResponsiveContainer width="100%" height={320}>
                                <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                    <XAxis
                                        dataKey="date"
                                        tick={{ fontSize: 11, fill: '#9ca3af' }}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(v: string) => v.slice(5)}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} width={48}
                                        tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                                    />
                                    <Tooltip
                                        cursor={{ stroke: 'rgba(99,102,241,0.35)', strokeWidth: 1 }}
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload?.length) return null
                                            return (
                                                <div className={styles.chartTooltip}>
                                                    <p className={styles.chartTooltipLabel}>{label}</p>
                                                    {payload.map((p) => (
                                                        <p key={String(p.dataKey)} className={styles.chartTooltipRow}>
                                                            <span style={{ color: p.color as string }}>{String(p.dataKey)}</span>
                                                            <span>{p.value != null ? `${(p.value as number).toFixed(2)}%` : '–'}</span>
                                                        </p>
                                                    ))}
                                                </div>
                                            )
                                        }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                                    {variants.map((v) => (
                                        <Line
                                            key={v}
                                            type="monotone"
                                            dataKey={v}
                                            stroke={VARIANT_COLORS[v] ?? '#6366f1'}
                                            strokeWidth={2}
                                            dot={{ r: 2, fill: VARIANT_COLORS[v] ?? '#6366f1' }}
                                            activeDot={{ r: 4 }}
                                            connectNulls
                                        />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>

                            <div className={styles.tableWrapper}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th className={styles.thLabel}>日付</th>
                                            {variants.map((v) => (
                                                <th key={v} className={styles.thNum}>
                                                    {mode === 'cumulative' ? `累積CVR (${v})` : `CVR (${v})`}
                                                </th>
                                            ))}
                                            {variants.map((v) => (
                                                <th key={`pv-${v}`} className={styles.thNum}>PV/CV ({v})</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {days.map((d) => (
                                            <tr key={d.date} className={styles.dataRow}>
                                                <td className={styles.tdLabel}>{d.date}</td>
                                                {variants.map((v) => {
                                                    const r = d[v as 'A' | 'B' | 'C' | 'D']
                                                    const rate = r ? (mode === 'cumulative' ? r.cumCvr : r.cvr) : null
                                                    return (
                                                        <td key={v} className={styles.tdNum}>
                                                            {rate != null ? `${(rate * 100).toFixed(2)}%` : '–'}
                                                        </td>
                                                    )
                                                })}
                                                {variants.map((v) => {
                                                    const r = d[v as 'A' | 'B' | 'C' | 'D']
                                                    return (
                                                        <td key={`pv-${v}`} className={styles.tdNum}>
                                                            {r ? `${r.pv.toLocaleString()} / ${r.cv.toLocaleString()}` : '–'}
                                                        </td>
                                                    )
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <p className={styles.note}>
                                * 累積CVRはテスト開始（取得期間の先頭）からの累計CV÷累計PV。日次CVRはその日1日のCV÷PVです。
                            </p>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
