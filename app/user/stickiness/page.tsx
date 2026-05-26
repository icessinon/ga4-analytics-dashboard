'use client'

import { useState } from 'react'
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
} from 'recharts'
import DateInput from '@/components/DateInput'
import BackLink from '@/components/BackLink'
import Loader from '@/components/Loader'
import AISpinner from '@/components/AISpinner/AISpinner'
import { useProduct } from '@/lib/contexts/ProductContext'
import InfoTooltip from '@/components/InfoTooltip/InfoTooltip'
import styles from './StickinessPage.module.css'

interface DailyPoint { date: string; dau: number; wau: number; mau: number }
interface StickinessResult {
    dailySeries: DailyPoint[]
    avgDAU: number
    totalMAU: number
    totalNewUsers: number
    avgSessionsPerUser: number
    stickinessDAUMAU: number
    stickinessWAUMAU: number
}

interface ApiResponse {
    current: StickinessResult
    compare: StickinessResult | null
}

function getDefaultRange() {
    const today = new Date()
    const past = new Date(today)
    past.setDate(today.getDate() - 29)
    const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { startDate: fmt(past), endDate: fmt(today) }
}

function getCompareDefault(startDate: string, endDate: string) {
    const start = new Date(startDate)
    const end = new Date(endDate)
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1
    const cEnd = new Date(start)
    cEnd.setDate(cEnd.getDate() - 1)
    const cStart = new Date(cEnd)
    cStart.setDate(cStart.getDate() - (days - 1))
    const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { compareStartDate: fmt(cStart), compareEndDate: fmt(cEnd) }
}

function toMMDD(dateStr: string): string {
    const parts = dateStr.split('-')
    if (parts.length === 3) return `${parts[1]}/${parts[2]}`
    return dateStr
}

function engagementLabel(ratio: number): { text: string; color: string } {
    const pct = ratio * 100
    if (pct >= 20) return { text: '高エンゲージメント', color: '#34d399' }
    if (pct >= 10) return { text: '中程度のエンゲージメント', color: '#fbbf24' }
    return { text: '低エンゲージメント', color: '#f87171' }
}

function delta(current: number, compare: number, fmt: (n: number) => string = String) {
    if (compare === 0) return null
    const diff = current - compare
    const pct = ((diff / compare) * 100).toFixed(1)
    const up = diff >= 0
    return { text: `${up ? '+' : ''}${pct}%`, up, diff, fmt: fmt(Math.abs(diff)) }
}

function fmtPct(n: number) { return `${(n * 100).toFixed(1)}%` }

export default function StickinessPage() {
    const { currentProduct } = useProduct()
    const { startDate: defaultStart, endDate: defaultEnd } = getDefaultRange()
    const { compareStartDate: defaultCompStart, compareEndDate: defaultCompEnd } = getCompareDefault(defaultStart, defaultEnd)

    const [startDate, setStartDate] = useState(defaultStart)
    const [endDate, setEndDate] = useState(defaultEnd)
    const [compareMode, setCompareMode] = useState(false)
    const [compareStartDate, setCompareStartDate] = useState(defaultCompStart)
    const [compareEndDate, setCompareEndDate] = useState(defaultCompEnd)
    const [accessToken, setAccessToken] = useState('')
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<ApiResponse | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [geminiLoading, setGeminiLoading] = useState(false)
    const [geminiResult, setGeminiResult] = useState<string | null>(null)
    const [geminiError, setGeminiError] = useState<string | null>(null)

    const handleGeminiAnalysis = async () => {
        if (!current) return
        setGeminiLoading(true)
        setGeminiError(null)
        setGeminiResult(null)
        try {
            const res = await fetch('/api/user/stickiness/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    current: { avgDAU: current.avgDAU, totalMAU: current.totalMAU, stickinessDAUMAU: current.stickinessDAUMAU, stickinessWAUMAU: current.stickinessWAUMAU, avgSessionsPerUser: current.avgSessionsPerUser, startDate, endDate },
                    compare: compare ? { avgDAU: compare.avgDAU, totalMAU: compare.totalMAU, stickinessDAUMAU: compare.stickinessDAUMAU, stickinessWAUMAU: compare.stickinessWAUMAU, avgSessionsPerUser: compare.avgSessionsPerUser, startDate: compareStartDate, endDate: compareEndDate } : null,
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || '分析に失敗しました')
            setGeminiResult(data.analysis)
        } catch (e) {
            setGeminiError(e instanceof Error ? e.message : 'エラーが発生しました')
        } finally {
            setGeminiLoading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!currentProduct) return
        setGeminiResult(null)
        setGeminiError(null)
        setLoading(true)
        setError(null)
        setResult(null)

        try {
            const res = await fetch('/api/user/stickiness', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    propertyId: currentProduct.ga4PropertyId,
                    startDate,
                    endDate,
                    ...(compareMode ? { compareStartDate, compareEndDate } : {}),
                    accessToken: accessToken || undefined,
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.message || data.error || '取得に失敗しました')
            setResult(data)
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
                    <h1 className={styles.title}>スティッキネス分析</h1>
                    <BackLink href="/user">ユーザー行動分析に戻る</BackLink>
                </div>
                <div className={styles.notice}>
                    プロダクトを選択してください。右上のドロップダウンから選択できます。
                </div>
            </div>
        )
    }

    const current = result?.current ?? null
    const compare = result?.compare ?? null
    const engagement = current ? engagementLabel(current.stickinessDAUMAU) : null

    // 通常グラフ用データ
    const chartData = current?.dailySeries.map((d) => ({ ...d, date: toMMDD(d.date) })) ?? []

    // 比較グラフ用データ（日付インデックスで正規化）
    const compareChartData = (() => {
        if (!current || !compare) return []
        const len = Math.max(current.dailySeries.length, compare.dailySeries.length)
        return Array.from({ length: len }, (_, i) => ({
            day: `${i + 1}日目`,
            dau_a: current.dailySeries[i]?.dau ?? null,
            dau_b: compare.dailySeries[i]?.dau ?? null,
            mau_a: current.dailySeries[i]?.mau ?? null,
            mau_b: compare.dailySeries[i]?.mau ?? null,
        }))
    })()

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>スティッキネス分析</h1>
                    <p className={styles.subtitle}>
                        DAU/WAU/MAUの推移とユーザーエンゲージメントの深さを測定します
                    </p>
                </div>
                <BackLink href="/user">ユーザー行動分析に戻る</BackLink>
            </div>

            {/* フォーム */}
            <div className={styles.formSection}>
                <form onSubmit={handleSubmit}>
                    {/* 期間A */}
                    <div className={styles.periodRow}>
                        {compareMode && <span className={styles.periodLabel} style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', borderColor: '#6366f1' }}>期間A</span>}
                        <div className={styles.formField}>
                            <label className={styles.label}>開始日</label>
                            <DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)} className={styles.input} required />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.label}>終了日</label>
                            <DateInput value={endDate} onChange={(e) => setEndDate(e.target.value)} className={styles.input} required />
                        </div>
                    </div>

                    {/* 期間B */}
                    {compareMode && (
                        <div className={styles.periodRow}>
                            <span className={styles.periodLabel} style={{ background: 'rgba(249,115,22,0.15)', color: '#fb923c', borderColor: '#f97316' }}>期間B</span>
                            <div className={styles.formField}>
                                <label className={styles.label}>開始日</label>
                                <DateInput value={compareStartDate} onChange={(e) => setCompareStartDate(e.target.value)} className={styles.input} required />
                            </div>
                            <div className={styles.formField}>
                                <label className={styles.label}>終了日</label>
                                <DateInput value={compareEndDate} onChange={(e) => setCompareEndDate(e.target.value)} className={styles.input} required />
                            </div>
                        </div>
                    )}

                    <div className={styles.formField} style={{ marginBottom: '1rem' }}>
                        <label className={styles.label}>GA4アクセストークン（オプション）</label>
                        <input
                            type="password"
                            value={accessToken}
                            onChange={(e) => setAccessToken(e.target.value)}
                            placeholder="サービスアカウントを使用する場合は空欄でOK"
                            className={styles.input}
                        />
                    </div>

                    <div className={styles.formActions}>
                        <button type="submit" disabled={loading} className={styles.button}>
                            {loading ? '分析中...' : '分析を実行'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setCompareMode((v) => !v)}
                            className={compareMode ? `${styles.compareToggle} ${styles.compareToggleActive}` : styles.compareToggle}
                        >
                            {compareMode ? '期間比較をオフ' : '期間比較'}
                        </button>
                    </div>
                </form>
            </div>

            {error && (
                <div className={styles.error}>
                    <strong>エラー</strong>
                    <p>{error}</p>
                </div>
            )}

            {loading && (
                <div className={styles.loaderContainer}>
                    <Loader />
                    <span className={styles.loaderText}>スティッキネスデータを取得中...</span>
                </div>
            )}

            {current && !loading && (
                <>
                    {/* サマリーカード */}
                    {!compare ? (
                        <div className={styles.summaryRow}>
                            <div className={styles.summaryCard}>
                                <p className={styles.summaryLabel}>平均DAU<InfoTooltip text="Daily Active Users（日次アクティブユーザー）の期間平均。毎日何人が利用しているかを示す。" direction="bottom" /></p>
                                <p className={styles.summaryValue}>{current.avgDAU.toLocaleString()}</p>
                            </div>
                            <div className={styles.summaryCard}>
                                <p className={styles.summaryLabel}>MAU（期間ユニーク）<InfoTooltip text="Monthly Active Users。対象期間内にサイトを訪れたユニークユーザーの総数。" direction="bottom" /></p>
                                <p className={styles.summaryValue}>{current.totalMAU.toLocaleString()}</p>
                            </div>
                            <div className={styles.summaryCard}>
                                <p className={styles.summaryLabel}>DAU/MAU スティッキネス<InfoTooltip text="平均DAU ÷ MAU。ユーザーが月の何割の日数でサービスを使うかを示す。20%以上が高エンゲージメントの目安。" direction="bottom" /></p>
                                <p className={styles.summaryHighlight}>{fmtPct(current.stickinessDAUMAU)}</p>
                            </div>
                            <div className={styles.summaryCard}>
                                <p className={styles.summaryLabel}>平均セッション/ユーザー<InfoTooltip text="1ユーザーあたりの平均セッション数（sessions ÷ activeUsers）。訪問頻度の高さを示す。" direction="bottom" /></p>
                                <p className={styles.summaryValue}>{current.avgSessionsPerUser}</p>
                            </div>
                        </div>
                    ) : (
                        /* 比較サマリーカード */
                        <div className={styles.compareSummaryGrid}>
                            {[
                                { label: '平均DAU', tooltip: 'Daily Active Users（日次アクティブユーザー）の期間平均。', a: current.avgDAU, b: compare.avgDAU, fmt: (n: number) => n.toLocaleString(), isHighlight: false },
                                { label: 'MAU（期間ユニーク）', tooltip: '対象期間内のユニークユーザー総数（Monthly Active Users）。', a: current.totalMAU, b: compare.totalMAU, fmt: (n: number) => n.toLocaleString(), isHighlight: false },
                                { label: 'DAU/MAU スティッキネス', tooltip: '平均DAU ÷ MAU。月の何割の日数でサービスを使うかを示す。20%以上が高エンゲージメントの目安。', a: current.stickinessDAUMAU, b: compare.stickinessDAUMAU, fmt: fmtPct, isHighlight: true },
                                { label: '平均セッション/ユーザー', tooltip: '1ユーザーあたりの平均セッション数（sessions ÷ activeUsers）。', a: current.avgSessionsPerUser, b: compare.avgSessionsPerUser, fmt: String, isHighlight: false },
                            ].map(({ label, tooltip, a, b, fmt, isHighlight }) => {
                                const d = delta(a, b, fmt)
                                return (
                                    <div key={label} className={styles.compareCard}>
                                        <p className={styles.summaryLabel}>{label}{tooltip && <InfoTooltip text={tooltip} direction="bottom" />}</p>
                                        <div className={styles.compareCardRow}>
                                            <div>
                                                <span className={styles.comparePeriodBadge} style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>期間A</span>
                                                <p className={isHighlight ? styles.summaryHighlight : styles.summaryValue} style={{ fontSize: '1.5rem', marginTop: '0.25rem' }}>
                                                    {fmt(a)}
                                                </p>
                                            </div>
                                            <div>
                                                <span className={styles.comparePeriodBadge} style={{ background: 'rgba(249,115,22,0.15)', color: '#fb923c' }}>期間B</span>
                                                <p className={styles.summaryValue} style={{ fontSize: '1.5rem', marginTop: '0.25rem', color: '#9ca3af' }}>
                                                    {fmt(b)}
                                                </p>
                                            </div>
                                            {d && (
                                                <div className={styles.deltaCol}>
                                                    <span className={d.up ? styles.deltaUp : styles.deltaDown}>{d.text}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {/* グラフ */}
                    <div className={styles.chartSection}>
                        <h2 className={styles.chartTitle}>
                            {compare ? 'DAU 期間比較（相対日数）' : 'DAU / WAU / MAU 推移'}
                        </h2>
                        <div className={styles.chartWrap}>
                            <ResponsiveContainer width="100%" height="100%">
                                {!compare ? (
                                    <LineChart data={chartData} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
                                        <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} tickLine={false} interval="preserveStartEnd" />
                                        <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => v.toLocaleString()} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '0.375rem', color: '#f3f4f6' }}
                                            labelStyle={{ color: '#e5e7eb', fontWeight: 600 }}
                                            formatter={(value: number, name: string) => [value.toLocaleString(), name.toUpperCase()]}
                                        />
                                        <Legend formatter={(value: string) => value.toUpperCase()} wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                                        <Line type="monotone" dataKey="dau" stroke="#60a5fa" strokeWidth={2} dot={false} name="dau" />
                                        <Line type="monotone" dataKey="wau" stroke="#34d399" strokeWidth={2} dot={false} name="wau" />
                                        <Line type="monotone" dataKey="mau" stroke="#fb923c" strokeWidth={2} dot={false} name="mau" />
                                    </LineChart>
                                ) : (
                                    <LineChart data={compareChartData} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
                                        <XAxis dataKey="day" tick={{ fill: '#9ca3af', fontSize: 11 }} tickLine={false} interval="preserveStartEnd" />
                                        <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => v.toLocaleString()} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '0.375rem', color: '#f3f4f6' }}
                                            labelStyle={{ color: '#e5e7eb', fontWeight: 600 }}
                                            formatter={(value: number, name: string) => [value?.toLocaleString() ?? '-', name]}
                                        />
                                        <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                                        <Line connectNulls type="monotone" dataKey="dau_a" stroke="#818cf8" strokeWidth={2} dot={false} name={`DAU（期間A: ${startDate}〜${endDate}）`} />
                                        <Line connectNulls type="monotone" dataKey="dau_b" stroke="#fb923c" strokeWidth={2} strokeDasharray="5 4" dot={false} name={`DAU（期間B: ${compareStartDate}〜${compareEndDate}）`} />
                                    </LineChart>
                                )}
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* 比較テーブル */}
                    {compare && (
                        <div className={styles.chartSection}>
                            <h2 className={styles.chartTitle}>MAU 推移比較（相対日数）</h2>
                            <div className={styles.chartWrap}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={compareChartData} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
                                        <XAxis dataKey="day" tick={{ fill: '#9ca3af', fontSize: 11 }} tickLine={false} interval="preserveStartEnd" />
                                        <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => v.toLocaleString()} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '0.375rem', color: '#f3f4f6' }}
                                            labelStyle={{ color: '#e5e7eb', fontWeight: 600 }}
                                            formatter={(value: number, name: string) => [value?.toLocaleString() ?? '-', name]}
                                        />
                                        <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                                        <Line connectNulls type="monotone" dataKey="mau_a" stroke="#818cf8" strokeWidth={2} dot={false} name={`MAU（期間A）`} />
                                        <Line connectNulls type="monotone" dataKey="mau_b" stroke="#fb923c" strokeWidth={2} strokeDasharray="5 4" dot={false} name={`MAU（期間B）`} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {/* スティッキネス解説 */}
                    <div className={styles.infoBox}>
                        <h3>スティッキネス（DAU/MAU）とは</h3>
                        {engagement && !compare && (
                            <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: engagement.color, marginBottom: '0.75rem' }}>
                                現在の評価: {engagement.text}（{fmtPct(current.stickinessDAUMAU)}）
                            </p>
                        )}
                        <ul>
                            <li><strong>20%以上</strong> — 高エンゲージメント: 月間ユーザーの5人に1人が毎日訪問しており、プロダクトへの依存度が高い</li>
                            <li><strong>10〜20%</strong> — 中程度のエンゲージメント: 一定の定期利用があるが、さらなる習慣化の余地がある</li>
                            <li><strong>10%以下</strong> — 低エンゲージメント: 月間ユーザーの多くが散発的な訪問に留まっており、リテンション施策の強化が必要</li>
                        </ul>
                    </div>

                    {/* Gemini AI分析 */}
                    <div className={styles.chartSection}>
                        <h2 className={styles.chartTitle}>AI分析</h2>
                        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            <button
                                onClick={handleGeminiAnalysis}
                                disabled={geminiLoading}
                                className={styles.button}
                                style={{ whiteSpace: 'nowrap' }}
                            >
                                {geminiLoading ? (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <AISpinner /> 分析中...
                                    </span>
                                ) : 'AIで分析'}
                            </button>
                        </div>
                        {geminiError && <p style={{ color: '#f87171', fontSize: '0.875rem', marginBottom: '0.5rem' }}>{geminiError}</p>}
                        {geminiResult && (
                            <div style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '0.5rem', padding: '1.25rem' }}>
                                {geminiResult.split('\n').map((line, i) => {
                                    const bold = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                    return line.trim() ? <p key={i} style={{ fontSize: '0.9rem', color: '#e5e7eb', lineHeight: 1.7, marginBottom: '0.5rem' }} dangerouslySetInnerHTML={{ __html: bold }} /> : null
                                })}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
