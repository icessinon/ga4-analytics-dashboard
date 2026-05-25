'use client'

import { useState, useEffect, Fragment } from 'react'
import { useParams } from 'next/navigation'
import BackLink from '@/components/BackLink'
import DateInput from '@/components/DateInput'
import Loader from '@/components/Loader'
import styles from './SegmentPage.module.css'

interface CvrResult {
    pv: number
    cv: number
    cvr: number
}

interface SegmentRow {
    name: string
    dataA?: CvrResult
    dataB?: CvrResult
    dataC?: CvrResult
    dataD?: CvrResult
}

const SEGMENT_OPTIONS = [
    { value: 'deviceCategory', label: 'デバイス' },
    { value: 'operatingSystem', label: 'OS' },
    { value: 'browser', label: 'ブラウザ' },
    { value: 'country', label: '国' },
    { value: 'sessionSource', label: '流入元 (Source)' },
    { value: 'sessionMedium', label: '流入経路 (Medium)' },
]

function getDefaultRange() {
    const today = new Date()
    const past = new Date(today)
    past.setDate(today.getDate() - 30)
    const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { startDate: fmt(past), endDate: fmt(today) }
}

function cvrColor(rate: number): string {
    if (rate <= 0) return '#9ca3af'
    if (rate < 0.01) return '#fbbf24'
    if (rate < 0.03) return '#34d399'
    return '#6ee7b7'
}

function diffBadge(rateA: number, rateB: number): { text: string; positive: boolean } | null {
    if (!rateA || !rateB) return null
    const diff = ((rateB - rateA) / rateA) * 100
    return { text: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`, positive: diff >= 0 }
}

export default function AbTestSegmentPage() {
    const params = useParams()
    const abTestId = params?.id as string

    const { startDate: defaultStart, endDate: defaultEnd } = getDefaultRange()
    const [segmentDimension, setSegmentDimension] = useState('deviceCategory')
    const [startDate, setStartDate] = useState(defaultStart)
    const [endDate, setEndDate] = useState(defaultEnd)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [abTestName, setAbTestName] = useState<string>('')
    const [segments, setSegments] = useState<SegmentRow[] | null>(null)
    const [variants, setVariants] = useState<string[]>([])

    // Auto-load on first render
    useEffect(() => {
        if (abTestId) handleFetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [abTestId])

    async function handleFetch(e?: React.FormEvent) {
        if (e) e.preventDefault()
        setLoading(true)
        setError(null)
        setSegments(null)

        try {
            const res = await fetch(`/api/ab-test/${abTestId}/segment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ segmentDimension, startDate, endDate }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.message || data.error || '取得に失敗しました')

            setAbTestName(data.abTestName ?? '')
            setSegments(data.segments ?? [])

            const detected: string[] = []
            const first = data.segments?.[0]
            if (first?.dataA) detected.push('A')
            if (first?.dataB) detected.push('B')
            if (first?.dataC) detected.push('C')
            if (first?.dataD) detected.push('D')
            setVariants(detected)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'エラーが発生しました')
        } finally {
            setLoading(false)
        }
    }

    const variantColors: Record<string, string> = {
        A: styles.variantA,
        B: styles.variantB,
        C: styles.variantC,
        D: styles.variantD,
    }

    const getResult = (row: SegmentRow, v: string): CvrResult | undefined =>
        v === 'A' ? row.dataA : v === 'B' ? row.dataB : v === 'C' ? row.dataC : row.dataD

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>セグメント別CVR分析</h1>
                    {abTestName && <p className={styles.subtitle}>{abTestName}</p>}
                </div>
                <BackLink href={`/ab-test/${abTestId}`}>ABテスト詳細に戻る</BackLink>
            </div>

            {/* 条件フォーム */}
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>条件</h2>
                <form onSubmit={handleFetch}>
                    <div className={styles.formGrid}>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>セグメント軸</label>
                            <select
                                value={segmentDimension}
                                onChange={(e) => setSegmentDimension(e.target.value)}
                                className={styles.formSelect}
                            >
                                {SEGMENT_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
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
                            {loading ? '取得中...' : '分析を実行'}
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
                    <span>セグメントデータを取得中...</span>
                </div>
            )}

            {segments && !loading && (
                <div className={styles.section}>
                    <div className={styles.resultHeader}>
                        <p className={styles.resultTitle}>
                            {SEGMENT_OPTIONS.find((o) => o.value === segmentDimension)?.label ?? segmentDimension} 別CVR
                        </p>
                        <p className={styles.resultMeta}>{segments.length - 1} セグメント</p>
                    </div>

                    {segments.length === 0 ? (
                        <p className={styles.empty}>データがありません。期間を調整して再試行してください。</p>
                    ) : (
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th className={styles.thLabel}>セグメント</th>
                                        {variants.map((v) => (
                                            <Fragment key={v}>
                                                <th className={styles.thNum}>PV ({v})</th>
                                                <th className={styles.thNum}>CV ({v})</th>
                                                <th className={`${styles.thNum} ${styles.thCvr}`}>CVR ({v})</th>
                                            </Fragment>
                                        ))}
                                        {variants.includes('A') && variants.includes('B') && (
                                            <th className={styles.thNum}>B vs A</th>
                                        )}
                                    </tr>
                                </thead>
                                <tbody>
                                    {segments.map((row, idx) => {
                                        const isTotal = idx === 0
                                        const rA = getResult(row, 'A')
                                        const rB = getResult(row, 'B')
                                        const badge = rA && rB ? diffBadge(rA.cvr, rB.cvr) : null
                                        return (
                                            <tr key={row.name} className={isTotal ? styles.totalRow : styles.dataRow}>
                                                <td className={styles.tdLabel}>
                                                    {isTotal ? <strong>{row.name}</strong> : row.name}
                                                </td>
                                                {variants.map((v) => {
                                                    const r = getResult(row, v)
                                                    return (
                                                        <Fragment key={v}>
                                                            <td className={styles.tdNum}>
                                                                {r ? r.pv.toLocaleString() : '–'}
                                                            </td>
                                                            <td className={styles.tdNum}>
                                                                {r ? r.cv.toLocaleString() : '–'}
                                                            </td>
                                                            <td className={`${styles.tdNum} ${variantColors[v] ?? ''}`}>
                                                                {r ? (
                                                                    <span style={{ color: cvrColor(r.cvr) }}>
                                                                        {(r.cvr * 100).toFixed(2)}%
                                                                    </span>
                                                                ) : '–'}
                                                            </td>
                                                        </Fragment>
                                                    )
                                                })}
                                                {variants.includes('A') && variants.includes('B') && (
                                                    <td className={styles.tdNum}>
                                                        {badge ? (
                                                            <span className={badge.positive ? styles.diffPositive : styles.diffNegative}>
                                                                {badge.text}
                                                            </span>
                                                        ) : '–'}
                                                    </td>
                                                )}
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <p className={styles.note}>
                        * CVR = CV / PV。「B vs A」はAに対するBのCVR改善率です。
                    </p>
                </div>
            )}
        </div>
    )
}
