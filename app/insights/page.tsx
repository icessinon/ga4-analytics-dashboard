'use client'

import { useState } from 'react'
import {
    BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend,
} from 'recharts'
import BackLink from '@/components/BackLink'
import Loader from '@/components/Loader'
import AISpinner from '@/components/AISpinner/AISpinner'
import { useProduct } from '@/lib/contexts/ProductContext'
import InfoTooltip from '@/components/InfoTooltip/InfoTooltip'
import styles from './InsightsPage.module.css'

interface CvBreakdown {
    applyCv: { users: number; pv: number }
    lpApplyCv: { users: number; pv: number }
    signupCv: { users: number; pv: number }
}

interface MonthMetrics {
    startDate: string
    endDate: string
    activeUsers: number
    newUsers: number
    sessions: number
    engagementRate: number
    avgSessionDuration: number
    screenPageViews: number
    cv?: CvBreakdown
    topPages: Array<{ path: string; views: number }>
}

interface WeekSummary {
    label: string
    startDate: string
    endDate: string
    activeUsers: number
    sessions: number
    engagementRate: number
    screenPageViews: number
    applyCv: number
    lpApplyCv: number
    signupCv: number
}

interface MonthlyTrendPoint {
    label: string
    year: number
    month: number
    activeUsers: number
    newUsers: number
    sessions: number
    engagementRate: number
    screenPageViews: number
    applyCv: number
    lpApplyCv: number
    signupCv: number
}

interface InsightsData {
    baseMonth: string
    isCurrentMonth: boolean
    current: MonthMetrics
    previous: MonthMetrics
    weeklyBreakdown: {
        current: WeekSummary[]
        previous: WeekSummary[]
    }
    monthlyTrend: MonthlyTrendPoint[]
}

type TrendMetric = 'activeUsers' | 'newUsers' | 'sessions' | 'screenPageViews' | 'engagementRate' | 'applyCv' | 'lpApplyCv' | 'signupCv'

const TREND_METRIC_OPTS: Array<{ value: TrendMetric; label: string }> = [
    { value: 'activeUsers', label: 'ユーザー数' },
    { value: 'newUsers', label: '新規' },
    { value: 'sessions', label: 'セッション' },
    { value: 'screenPageViews', label: 'PV' },
    { value: 'engagementRate', label: 'EG率' },
    { value: 'applyCv', label: '応募CV' },
    { value: 'lpApplyCv', label: 'LP応募' },
    { value: 'signupCv', label: '登録CV' },
]

const CV_TOOLTIPS = {
    applyCv: '求人応募完了ページ（/entry/thanks）に到達したユニークユーザー数。',
    lpApplyCv: '人材紹介LPの応募完了ページ（/lp-thanks/*）に到達したユニークユーザー数。drs/crs/mrs等の全LPを合算。',
    signupCv: '会員登録完了ページ（/members/signup/thanks）に到達したユニークユーザー数。',
} as const

function todayYm(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function shiftYm(ym: string, delta: number): string {
    const [y, m] = ym.split('-').map(Number)
    const d = new Date(y, (m - 1) + delta, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function pctDiff(a: number, b: number): { text: string; up: boolean } | null {
    if (b === 0) return null
    const d = ((a - b) / b) * 100
    return { text: `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`, up: d >= 0 }
}

function fmtSec(s: number) {
    const m = Math.floor(s / 60); const sec = Math.round(s % 60)
    return m > 0 ? `${m}分${sec}秒` : `${sec}秒`
}

function DeltaBadge({ a, b }: { a: number; b: number }) {
    const d = pctDiff(a, b)
    if (!d) return <span style={{ color: '#6b7280' }}>-</span>
    return <span style={{ color: d.up ? '#34d399' : '#f87171', fontWeight: 600 }}>{d.text}</span>
}

export default function InsightsPage() {
    const { currentProduct } = useProduct()
    const [baseMonth, setBaseMonth] = useState<string>(todayYm())
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [data, setData] = useState<InsightsData | null>(null)
    const [geminiLoading, setGeminiLoading] = useState(false)
    const [geminiResult, setGeminiResult] = useState<string | null>(null)
    const [geminiError, setGeminiError] = useState<string | null>(null)
    const [weekMetric, setWeekMetric] = useState<'activeUsers' | 'sessions' | 'screenPageViews' | 'applyCv' | 'lpApplyCv' | 'signupCv'>('activeUsers')
    const [trendMetric, setTrendMetric] = useState<TrendMetric>('activeUsers')

    const currentYm = todayYm()

    const fetchForMonth = async (targetMonth: string) => {
        if (!currentProduct) return
        setLoading(true); setError(null); setGeminiResult(null)
        try {
            const res = await fetch('/api/insights', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    propertyId: currentProduct.ga4PropertyId,
                    baseMonth: targetMonth,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.message || json.error || '取得に失敗しました')
            setData(json)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'エラー')
        } finally {
            setLoading(false)
        }
    }

    const handleFetch = async (e: React.FormEvent) => {
        e.preventDefault()
        await fetchForMonth(baseMonth)
    }

    const changeMonth = (next: string) => {
        if (next > currentYm) return
        setBaseMonth(next)
        fetchForMonth(next)
    }

    const handleGemini = async () => {
        if (!data) return
        setGeminiLoading(true); setGeminiError(null); setGeminiResult(null)
        try {
            const res = await fetch('/api/insights/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    current: data.current,
                    previous: data.previous,
                    propertyId: currentProduct?.ga4PropertyId,
                    weeklyBreakdown: data.weeklyBreakdown,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error || '分析に失敗しました')
            setGeminiResult(json.analysis)
        } catch (err) {
            setGeminiError(err instanceof Error ? err.message : 'エラー')
        } finally {
            setGeminiLoading(false)
        }
    }

    const METRICS = data ? [
        { label: 'アクティブユーザー', tooltip: 'GA4の activeUsers。対象期間内にサイトを1回以上訪問したユニークユーザー数。', current: data.current.activeUsers.toLocaleString(), prev: data.previous.activeUsers.toLocaleString(), delta: pctDiff(data.current.activeUsers, data.previous.activeUsers) },
        { label: '新規ユーザー', tooltip: '対象期間内に初めてサイトを訪問したユーザー数（GA4のクッキー/Googleシグナル基準）。', current: data.current.newUsers.toLocaleString(), prev: data.previous.newUsers.toLocaleString(), delta: pctDiff(data.current.newUsers, data.previous.newUsers) },
        { label: 'セッション数', tooltip: 'ユーザーがサイトを訪問した回数。30分操作がないと新しいセッションとなる。', current: data.current.sessions.toLocaleString(), prev: data.previous.sessions.toLocaleString(), delta: pctDiff(data.current.sessions, data.previous.sessions) },
        { label: 'エンゲージメント率', tooltip: 'エンゲージドセッション ÷ 全セッション。エンゲージドセッション＝10秒以上滞在 or 2PV以上 or CVが発生したセッション。', current: `${(data.current.engagementRate * 100).toFixed(1)}%`, prev: `${(data.previous.engagementRate * 100).toFixed(1)}%`, delta: pctDiff(data.current.engagementRate, data.previous.engagementRate) },
        { label: '平均セッション時間', tooltip: '1セッションあたりの平均滞在時間。GA4では最後のページの滞在時間は含まれないため実態より短く出る傾向がある。', current: fmtSec(data.current.avgSessionDuration), prev: fmtSec(data.previous.avgSessionDuration), delta: pctDiff(data.current.avgSessionDuration, data.previous.avgSessionDuration) },
        { label: 'ページビュー', tooltip: 'GA4の screenPageViews。ページが表示された総回数（同一ユーザーの複数回閲覧・リロードを含む）。', current: data.current.screenPageViews.toLocaleString(), prev: data.previous.screenPageViews.toLocaleString(), delta: pctDiff(data.current.screenPageViews, data.previous.screenPageViews) },
        { label: '応募CV', tooltip: CV_TOOLTIPS.applyCv, current: (data.current.cv?.applyCv.users ?? 0).toLocaleString(), prev: (data.previous.cv?.applyCv.users ?? 0).toLocaleString(), delta: pctDiff(data.current.cv?.applyCv.users ?? 0, data.previous.cv?.applyCv.users ?? 0) },
        { label: 'LP応募CV', tooltip: CV_TOOLTIPS.lpApplyCv, current: (data.current.cv?.lpApplyCv.users ?? 0).toLocaleString(), prev: (data.previous.cv?.lpApplyCv.users ?? 0).toLocaleString(), delta: pctDiff(data.current.cv?.lpApplyCv.users ?? 0, data.previous.cv?.lpApplyCv.users ?? 0) },
        { label: '会員登録CV', tooltip: CV_TOOLTIPS.signupCv, current: (data.current.cv?.signupCv.users ?? 0).toLocaleString(), prev: (data.previous.cv?.signupCv.users ?? 0).toLocaleString(), delta: pctDiff(data.current.cv?.signupCv.users ?? 0, data.previous.cv?.signupCv.users ?? 0) },
    ] : []

    // 週次比較チャートデータ
    const weekChartData = data ? (() => {
        const curMap = new Map(data.weeklyBreakdown.current.map((w) => [w.label, w]))
        const prevMap = new Map(data.weeklyBreakdown.previous.map((w) => [w.label, w]))
        const labels = Array.from(new Set([
            ...data.weeklyBreakdown.current.map((w) => w.label),
            ...data.weeklyBreakdown.previous.map((w) => w.label),
        ])).sort()
        return labels.map((label) => ({
            label,
            当月: curMap.get(label)?.[weekMetric] ?? 0,
            前月: prevMap.get(label)?.[weekMetric] ?? 0,
        }))
    })() : []

    const WEEK_METRIC_OPTS: Array<{ value: typeof weekMetric; label: string }> = [
        { value: 'activeUsers', label: 'ユーザー数' },
        { value: 'sessions', label: 'セッション数' },
        { value: 'screenPageViews', label: 'PV数' },
        { value: 'applyCv', label: '応募CV' },
        { value: 'lpApplyCv', label: 'LP応募' },
        { value: 'signupCv', label: '登録CV' },
    ]

    const trendMetricLabel = TREND_METRIC_OPTS.find((o) => o.value === trendMetric)?.label ?? ''

    if (!currentProduct) return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>月次インサイトレポート</h1>
                <BackLink href="/">ダッシュボードに戻る</BackLink>
            </div>
            <div className={styles.notice}>プロダクトを選択してください。</div>
        </div>
    )

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>月次インサイトレポート</h1>
                    <p className={styles.subtitle}>基準月のKPI・前月比較・過去12ヶ月トレンド・AIインサイト</p>
                </div>
                <BackLink href="/">ダッシュボードに戻る</BackLink>
            </div>

            <div className={styles.formSection}>
                <form onSubmit={handleFetch}>
                    <div className={styles.formRow}>
                        <div className={styles.formField}>
                            <label className={styles.label}>基準月</label>
                            <input
                                type="month"
                                value={baseMonth}
                                onChange={(e) => setBaseMonth(e.target.value)}
                                max={currentYm}
                                className={styles.monthPicker}
                            />
                        </div>
                    </div>
                    <button type="submit" disabled={loading} className={styles.button} style={{ marginTop: '1rem' }}>
                        {loading ? '取得中...' : 'データを取得'}
                    </button>
                </form>
            </div>

            {error && <div className={styles.error}><strong>エラー</strong><p>{error}</p></div>}
            {loading && <div className={styles.loaderContainer}><Loader /><span className={styles.loaderText}>データを取得中...</span></div>}

            {data && !loading && (
                <>
                    {/* 月ナビゲーション */}
                    <div className={styles.monthNavBar}>
                        <button
                            type="button"
                            className={styles.monthNavBtn}
                            onClick={() => changeMonth(shiftYm(data.baseMonth, -1))}
                        >
                            ◀ 前月
                        </button>
                        <span className={styles.monthNavCurrent}>基準月：{data.baseMonth}</span>
                        <button
                            type="button"
                            className={styles.monthNavBtn}
                            disabled={data.baseMonth >= currentYm}
                            onClick={() => changeMonth(shiftYm(data.baseMonth, 1))}
                        >
                            翌月 ▶
                        </button>
                        {!data.isCurrentMonth && (
                            <button
                                type="button"
                                className={styles.monthNavTodayBtn}
                                onClick={() => changeMonth(currentYm)}
                            >
                                今月に戻る
                            </button>
                        )}
                    </div>

                    {/* 月次 KPI サマリー */}
                    <div className={styles.section}>
                        <h2 className={styles.sectionTitle}>KPIサマリー（{data.current.startDate} 〜 {data.current.endDate}）</h2>
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th className={styles.th}>指標</th>
                                        <th className={styles.thNum}>当月</th>
                                        <th className={styles.thNum}>前月（{data.previous.startDate}〜）</th>
                                        <th className={styles.thNum}>前月比</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {METRICS.map(({ label, tooltip, current, prev, delta }) => (
                                        <tr key={label} className={styles.tr}>
                                            <td className={styles.td}>{label}{tooltip && <InfoTooltip text={tooltip} />}</td>
                                            <td className={styles.tdNum} style={{ color: '#f3f4f6', fontWeight: 600 }}>{current}</td>
                                            <td className={styles.tdNum} style={{ color: '#9ca3af' }}>{prev}</td>
                                            <td className={styles.tdNum}>
                                                {delta ? <span style={{ color: delta.up ? '#34d399' : '#f87171', fontWeight: 600 }}>{delta.text}</span> : '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* 月次トレンド（過去12ヶ月） */}
                    {data.monthlyTrend && data.monthlyTrend.length > 0 && (
                        <div className={styles.section}>
                            <div className={styles.weeklyHeader}>
                                <h2 className={styles.sectionTitle} style={{ marginBottom: 0 }}>月次トレンド（過去12ヶ月）</h2>
                                <div className={styles.weekMetricTabs}>
                                    {TREND_METRIC_OPTS.map((opt) => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => setTrendMetric(opt.value)}
                                            className={`${styles.weekMetricTab} ${trendMetric === opt.value ? styles.weekMetricTabActive : ''}`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className={styles.weekChartWrapper}>
                                <ResponsiveContainer width="100%" height={240}>
                                    <LineChart data={data.monthlyTrend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                        <XAxis
                                            dataKey="label"
                                            tick={{ fontSize: 11, fill: '#9ca3af' }}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(v: string) => v.slice(2)}
                                        />
                                        <YAxis
                                            tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} width={48}
                                            tickFormatter={(v: number) => {
                                                if (trendMetric === 'engagementRate') return `${(v * 100).toFixed(0)}%`
                                                return v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                                            }}
                                        />
                                        <Tooltip
                                            cursor={{ stroke: 'rgba(99,102,241,0.35)', strokeWidth: 1 }}
                                            content={({ active, payload, label: lbl }) => {
                                                if (!active || !payload?.length) return null
                                                const v = payload[0].value as number
                                                const disp = trendMetric === 'engagementRate' ? `${(v * 100).toFixed(1)}%` : v.toLocaleString()
                                                return (
                                                    <div className={styles.weekTooltip}>
                                                        <p className={styles.weekTooltipLabel}>{lbl}</p>
                                                        <p className={styles.weekTooltipRow}>
                                                            <span style={{ color: '#6366f1' }}>{trendMetricLabel}</span>
                                                            <span>{disp}</span>
                                                        </p>
                                                    </div>
                                                )
                                            }}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey={trendMetric}
                                            stroke="#6366f1"
                                            strokeWidth={2}
                                            dot={{ r: 3, fill: '#6366f1' }}
                                            activeDot={{ r: 5 }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>

                            {/* トレンド表 */}
                            <div className={styles.tableWrapper} style={{ marginTop: '1rem' }}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th className={styles.th}>月</th>
                                            <th className={styles.thNum}>ユーザー数</th>
                                            <th className={styles.thNum}>新規</th>
                                            <th className={styles.thNum}>セッション</th>
                                            <th className={styles.thNum}>PV</th>
                                            <th className={styles.thNum}>EG率</th>
                                            <th className={styles.thNum}>応募CV<InfoTooltip text={CV_TOOLTIPS.applyCv} /></th>
                                            <th className={styles.thNum}>LP応募<InfoTooltip text={CV_TOOLTIPS.lpApplyCv} /></th>
                                            <th className={styles.thNum}>登録CV<InfoTooltip text={CV_TOOLTIPS.signupCv} /></th>
                                            <th className={styles.thNum}>前月比（AU）</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.monthlyTrend.map((m, i) => {
                                            const prev = i > 0 ? data.monthlyTrend[i - 1] : null
                                            const isBase = m.label === data.baseMonth
                                            return (
                                                <tr key={m.label} className={styles.tr}>
                                                    <td className={styles.td} style={{ fontWeight: isBase ? 700 : 500, color: isBase ? '#a5b4fc' : '#e5e7eb' }}>
                                                        {m.label}
                                                        {isBase && <span className={styles.baseMonthTag}>基準月</span>}
                                                    </td>
                                                    <td className={styles.tdNum} style={{ color: '#f3f4f6', fontWeight: isBase ? 600 : 400 }}>{m.activeUsers.toLocaleString()}</td>
                                                    <td className={styles.tdNum}>{m.newUsers.toLocaleString()}</td>
                                                    <td className={styles.tdNum}>{m.sessions.toLocaleString()}</td>
                                                    <td className={styles.tdNum}>{m.screenPageViews.toLocaleString()}</td>
                                                    <td className={styles.tdNum}>{(m.engagementRate * 100).toFixed(1)}%</td>
                                                    <td className={styles.tdNum}>{(m.applyCv ?? 0).toLocaleString()}</td>
                                                    <td className={styles.tdNum}>{(m.lpApplyCv ?? 0).toLocaleString()}</td>
                                                    <td className={styles.tdNum}>{(m.signupCv ?? 0).toLocaleString()}</td>
                                                    <td className={styles.tdNum}>
                                                        {prev ? <DeltaBadge a={m.activeUsers} b={prev.activeUsers} /> : <span style={{ color: '#6b7280' }}>-</span>}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* 週次内訳 */}
                    {weekChartData.length > 0 && (
                        <div className={styles.section}>
                            <div className={styles.weeklyHeader}>
                                <h2 className={styles.sectionTitle} style={{ marginBottom: 0 }}>週次内訳（当月 vs 前月）</h2>
                                <div className={styles.weekMetricTabs}>
                                    {WEEK_METRIC_OPTS.map((opt) => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => setWeekMetric(opt.value)}
                                            className={`${styles.weekMetricTab} ${weekMetric === opt.value ? styles.weekMetricTabActive : ''}`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* グラフ */}
                            <div className={styles.weekChartWrapper}>
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={weekChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                        <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                                        <YAxis
                                            tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} width={44}
                                            tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(99,102,241,0.08)' }}
                                            content={({ active, payload, label: lbl }) => {
                                                if (!active || !payload?.length) return null
                                                return (
                                                    <div className={styles.weekTooltip}>
                                                        <p className={styles.weekTooltipLabel}>{lbl}</p>
                                                        {payload.map((p) => (
                                                            <p key={p.name} className={styles.weekTooltipRow}>
                                                                <span style={{ color: p.color }}>{p.name}</span>
                                                                <span>{(p.value as number).toLocaleString()}</span>
                                                            </p>
                                                        ))}
                                                    </div>
                                                )
                                            }}
                                        />
                                        <Legend
                                            wrapperStyle={{ fontSize: '0.8125rem', color: '#9ca3af', paddingTop: '0.5rem' }}
                                            formatter={(value) => <span style={{ color: '#9ca3af' }}>{value}</span>}
                                        />
                                        <Bar dataKey="当月" fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={36} />
                                        <Bar dataKey="前月" fill="#374151" radius={[3, 3, 0, 0]} maxBarSize={36} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>

                            {/* 週次比較テーブル */}
                            <div className={styles.tableWrapper} style={{ marginTop: '1rem' }}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th className={styles.th}>週</th>
                                            <th className={styles.th} style={{ fontSize: '0.75rem', color: '#6b7280' }}>期間（当月）</th>
                                            <th className={styles.thNum}>ユーザー数</th>
                                            <th className={styles.thNum}>セッション</th>
                                            <th className={styles.thNum}>PV</th>
                                            <th className={styles.thNum}>EG率</th>
                                            <th className={styles.thNum}>応募CV<InfoTooltip text={CV_TOOLTIPS.applyCv} /></th>
                                            <th className={styles.thNum}>前月同週比</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.weeklyBreakdown.current.map((week) => {
                                            const prev = data.weeklyBreakdown.previous.find((w) => w.label === week.label)
                                            return (
                                                <tr key={week.label} className={styles.tr}>
                                                    <td className={styles.td} style={{ fontWeight: 600, color: '#a5b4fc' }}>{week.label}</td>
                                                    <td className={styles.td} style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                                        {week.startDate.slice(5)} 〜 {week.endDate.slice(5)}
                                                    </td>
                                                    <td className={styles.tdNum} style={{ color: '#f3f4f6', fontWeight: 600 }}>
                                                        {week.activeUsers.toLocaleString()}
                                                        {prev && <span className={styles.prevVal}>（{prev.activeUsers.toLocaleString()}）</span>}
                                                    </td>
                                                    <td className={styles.tdNum}>
                                                        {week.sessions.toLocaleString()}
                                                        {prev && <span className={styles.prevVal}>（{prev.sessions.toLocaleString()}）</span>}
                                                    </td>
                                                    <td className={styles.tdNum}>
                                                        {week.screenPageViews.toLocaleString()}
                                                        {prev && <span className={styles.prevVal}>（{prev.screenPageViews.toLocaleString()}）</span>}
                                                    </td>
                                                    <td className={styles.tdNum}>{(week.engagementRate * 100).toFixed(1)}%</td>
                                                    <td className={styles.tdNum}>
                                                        {(week.applyCv ?? 0).toLocaleString()}
                                                        {prev && <span className={styles.prevVal}>（{(prev.applyCv ?? 0).toLocaleString()}）</span>}
                                                    </td>
                                                    <td className={styles.tdNum}>
                                                        {prev
                                                            ? <DeltaBadge a={week.activeUsers} b={prev.activeUsers} />
                                                            : <span style={{ color: '#6b7280' }}>-</span>
                                                        }
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* 当月の上位ページ */}
                    <div className={styles.section}>
                        <h2 className={styles.sectionTitle}>当月の上位ページ（PV順）</h2>
                        <div className={styles.pageList}>
                            {data.current.topPages.map((pg, i) => (
                                <div key={i} className={styles.pageRow}>
                                    <span className={styles.pageRank}>{i + 1}</span>
                                    <span className={styles.pagePath}>{pg.path}</span>
                                    <span className={styles.pageViews}>{pg.views.toLocaleString()} PV</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* AI インサイト */}
                    <div className={styles.section}>
                        <h2 className={styles.sectionTitle}>AIインサイト</h2>
                        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            <button onClick={handleGemini} disabled={geminiLoading} className={styles.button} style={{ whiteSpace: 'nowrap' }}>
                                {geminiLoading ? (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <AISpinner /> 生成中...
                                    </span>
                                ) : 'AIレポートを生成'}
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
