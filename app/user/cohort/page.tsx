'use client'

import { useState } from 'react'
import DateInput from '@/components/DateInput'
import BackLink from '@/components/BackLink'
import Loader from '@/components/Loader'
import { useProduct } from '@/lib/contexts/ProductContext'
import styles from './CohortPage.module.css'

interface WeekData {
    activeUsers: number
    totalUsers: number
    rate: number
}

interface CohortRow {
    cohortName: string
    label: string
    weekStart: string
    weeks: Record<number, WeekData>
}

// "2026-05-04" → "5/4〜5/10"
function weekRangeLabel(weekStart: string): string {
    const start = new Date(weekStart)
    const end = new Date(weekStart)
    end.setDate(end.getDate() + 6)
    const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
    return `${fmt(start)}〜${fmt(end)}`
}

function getDefaultRange() {
    const today = new Date()
    const past = new Date(today)
    past.setDate(today.getDate() - 77) // 約11週前
    const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { startDate: fmt(past), endDate: fmt(today) }
}

// 継続率に応じた背景色（緑系グラデーション）
function cellBg(rate: number, isWeek0: boolean): string {
    if (isWeek0) return 'rgba(99,102,241,0.5)'
    if (rate <= 0) return 'rgba(255,255,255,0.03)'
    const intensity = Math.min(rate, 1)
    // 0% → 暗め青, 50% → 緑, 100% → 明るい緑
    const r = Math.round(16  + (34  - 16)  * intensity)
    const g = Math.round(185 * intensity)
    const b = Math.round(129 * intensity * 0.5)
    return `rgba(${r},${g},${b},${0.15 + intensity * 0.55})`
}

export default function CohortPage() {
    const { currentProduct } = useProduct()
    const { startDate: defaultStart, endDate: defaultEnd } = getDefaultRange()

    const [startDate, setStartDate] = useState(defaultStart)
    const [endDate, setEndDate] = useState(defaultEnd)
    const [periods, setPeriods] = useState(6)
    const [accessToken, setAccessToken] = useState('')
    const [loading, setLoading] = useState(false)
    const [cohorts, setCohorts] = useState<CohortRow[] | null>(null)
    const [maxPeriods, setMaxPeriods] = useState(6)
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!currentProduct) return
        setLoading(true)
        setError(null)
        setCohorts(null)

        try {
            const res = await fetch('/api/user/cohort', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    propertyId: currentProduct.ga4PropertyId,
                    startDate,
                    endDate,
                    periods,
                    accessToken: accessToken || undefined,
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.message || data.error || '取得に失敗しました')
            setCohorts(data.cohorts)
            setMaxPeriods(data.maxPeriods)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'エラーが発生しました')
        } finally {
            setLoading(false)
        }
    }

    if (!currentProduct) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h1 className={styles.title}>コホートリテンション分析</h1>
                    <BackLink href="/user">ユーザー分析に戻る</BackLink>
                </div>
                <div className={styles.warningBox}>
                    プロダクトを選択してください。右上のドロップダウンから選択できます。
                </div>
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>コホートリテンション分析</h1>
                    <p className={styles.subtitle}>
                        初回訪問週ごとに「その後も戻ってきたユーザーの割合」を週次で追跡します
                    </p>
                </div>
                <BackLink href="/user">ユーザー分析に戻る</BackLink>
            </div>

            {/* フォーム */}
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>条件</h2>
                <form onSubmit={handleSubmit}>
                    <div className={styles.formGrid}>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>開始日</label>
                            <DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)} className={styles.formInput} required />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>終了日</label>
                            <DateInput value={endDate} onChange={(e) => setEndDate(e.target.value)} className={styles.formInput} required />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>追跡週数（Week 0〜{periods}）</label>
                            <input
                                type="number"
                                min={1}
                                max={12}
                                value={periods}
                                onChange={(e) => setPeriods(Number(e.target.value))}
                                className={styles.formInput}
                            />
                        </div>
                        <div className={styles.formFieldFull}>
                            <label className={styles.formLabel}>GA4アクセストークン（オプション）</label>
                            <input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="サービスアカウントを使用する場合は空欄でOK" className={styles.formInput} />
                        </div>
                    </div>
                    <div className={styles.formActions}>
                        <button type="submit" disabled={loading} className="executionButton">
                            {loading ? '取得中...' : 'コホートを取得'}
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
                    <span>コホートデータを取得中...</span>
                </div>
            )}

            {/* マトリクス */}
            {cohorts && !loading && (
                <div className={styles.section}>
                    <div className={styles.resultHeader}>
                        <p className={styles.resultTitle}>リテンションマトリクス（週次）</p>
                        <p className={styles.resultMeta}>{cohorts.length} コホート</p>
                    </div>

                    <div className={styles.legend}>
                        <span>リテンション率：</span>
                        <div className={styles.legendBar}>
                            {[0, 10, 25, 50, 75, 100].map((pct) => (
                                <div key={pct} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <div
                                        className={styles.legendSwatch}
                                        style={{ backgroundColor: cellBg(pct / 100, false) }}
                                    />
                                    <span>{pct}%</span>
                                </div>
                            ))}
                        </div>
                        <span style={{ marginLeft: '0.5rem' }}>
                            ／ <span style={{ color: '#a5b4fc' }}>■</span> Week 0（初回訪問週）
                        </span>
                    </div>

                    {cohorts.length === 0 ? (
                        <p style={{ color: '#6b7280', textAlign: 'center', padding: '2rem' }}>
                            データがありません。期間を広げて再試行してください。
                        </p>
                    ) : (
                        <div className={styles.tableWrapper}>
                            <table className={styles.cohortTable}>
                                <thead>
                                    <tr>
                                        <th>初回訪問週</th>
                                        {Array.from({ length: maxPeriods + 1 }, (_, i) => (
                                            <th key={i}>Week {i}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {cohorts.map((row) => (
                                        <tr key={row.cohortName}>
                                            <td className={styles.rowLabel}>
                                                <div className={styles.rowLabelInner}>
                                                    <span className={styles.rowWeekLabel}>{weekRangeLabel(row.weekStart)}</span>
                                                    {row.weeks[0] && (
                                                        <span className={styles.rowTotalLabel}>
                                                            {row.weeks[0].totalUsers.toLocaleString()} ユーザー
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            {Array.from({ length: maxPeriods + 1 }, (_, week) => {
                                                const d = row.weeks[week]
                                                const isWeek0 = week === 0
                                                if (!d) {
                                                    return (
                                                        <td key={week} className={styles.cell} style={{ backgroundColor: 'transparent' }}>
                                                            <span className={styles.cellEmpty}>–</span>
                                                        </td>
                                                    )
                                                }
                                                return (
                                                    <td
                                                        key={week}
                                                        className={styles.cell}
                                                        style={{ backgroundColor: cellBg(d.rate, isWeek0) }}
                                                        title={`${row.label} / Week ${week}: ${d.activeUsers.toLocaleString()} ユーザー (${(d.rate * 100).toFixed(1)}%)`}
                                                    >
                                                        <div className={styles.cellInner}>
                                                            <span className={styles.cellRate}>
                                                                {isWeek0 ? '100%' : `${(d.rate * 100).toFixed(1)}%`}
                                                            </span>
                                                            <span className={styles.cellUsers}>
                                                                {d.activeUsers.toLocaleString()}人
                                                            </span>
                                                        </div>
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
