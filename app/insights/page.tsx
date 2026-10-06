'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import AISpinner from '@/components/AISpinner'
import InfoTooltip from '@/components/InfoTooltip'
import PageShell from '@/components/PageShell'
import Alert from '@/components/Alert'
import { ui, cx } from '@/components/ui'
import { useReport } from '@/hooks/useReport'
import { fetchJson } from '@/lib/utils/fetch'
import { CHART_COLORS } from '@/lib/constants/chartColors'
import { useProduct } from '@/contexts/ProductContext'
import type { InsightsReport } from '@/lib/services/insights/insightsTypes'
import styles from './InsightsPage.module.css'

type TrendMetric = 'activeUsers' | 'newUsers' | 'sessions' | 'screenPageViews' | 'engagementRate' | 'applyCv' | 'lpApplyCv' | 'signupCv'
type WeekMetric = 'activeUsers' | 'sessions' | 'screenPageViews' | 'applyCv' | 'lpApplyCv' | 'signupCv'

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

const WEEK_METRIC_OPTS: Array<{ value: WeekMetric; label: string }> = [
    { value: 'activeUsers', label: 'ユーザー数' },
    { value: 'sessions', label: 'セッション数' },
    { value: 'screenPageViews', label: 'PV数' },
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
    if (!d) return <span className={styles.muted}>-</span>
    return <span className={d.up ? styles.deltaUp : styles.deltaDown}>{d.text}</span>
}

const AXIS_TICK = { fontSize: 11, fill: 'var(--text-muted)' }
const CURRENT_COLOR = CHART_COLORS.violet
const PREVIOUS_COLOR = 'var(--bg-raised)'

export default function InsightsPage() {
    const { currentProduct } = useProduct()
    const currentYm = todayYm()
    const [baseMonth, setBaseMonth] = useState<string>(currentYm)
    const [weekMetric, setWeekMetric] = useState<WeekMetric>('activeUsers')
    const [trendMetric, setTrendMetric] = useState<TrendMetric>('activeUsers')

    // 基準月を変えると即再取得（旧実装は「データを取得」ボタン＋月ナビの両方）
    const report = useReport<InsightsReport>('/api/insights', {
        body: { propertyId: currentProduct?.ga4PropertyId, baseMonth },
        enabled: !!currentProduct && /^\d{4}-\d{2}$/.test(baseMonth),
        keepPreviousData: true,
    })
    const data = report.data

    const [geminiLoading, setGeminiLoading] = useState(false)
    const [geminiResult, setGeminiResult] = useState<string | null>(null)
    const [geminiError, setGeminiError] = useState<string | null>(null)
    useEffect(() => { setGeminiResult(null); setGeminiError(null) }, [report.data])

    const changeMonth = (next: string) => {
        if (next > currentYm) return
        setBaseMonth(next)
    }

    const handleGemini = async () => {
        if (!data) return
        setGeminiLoading(true); setGeminiError(null); setGeminiResult(null)
        try {
            const json = await fetchJson<{ analysis: string }>('/api/insights/gemini', {
                method: 'POST',
                body: JSON.stringify({ current: data.current, previous: data.previous, propertyId: currentProduct?.ga4PropertyId, weeklyBreakdown: data.weeklyBreakdown }),
            })
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
        { label: '応募CV', tooltip: CV_TOOLTIPS.applyCv, current: data.current.cv.applyCv.users.toLocaleString(), prev: data.previous.cv.applyCv.users.toLocaleString(), delta: pctDiff(data.current.cv.applyCv.users, data.previous.cv.applyCv.users) },
        { label: 'LP応募CV', tooltip: CV_TOOLTIPS.lpApplyCv, current: data.current.cv.lpApplyCv.users.toLocaleString(), prev: data.previous.cv.lpApplyCv.users.toLocaleString(), delta: pctDiff(data.current.cv.lpApplyCv.users, data.previous.cv.lpApplyCv.users) },
        { label: '会員登録CV', tooltip: CV_TOOLTIPS.signupCv, current: data.current.cv.signupCv.users.toLocaleString(), prev: data.previous.cv.signupCv.users.toLocaleString(), delta: pctDiff(data.current.cv.signupCv.users, data.previous.cv.signupCv.users) },
    ] : []

    // 週次比較チャートデータ
    const weekChartData = data ? (() => {
        const curMap = new Map(data.weeklyBreakdown.current.map((w) => [w.label, w]))
        const prevMap = new Map(data.weeklyBreakdown.previous.map((w) => [w.label, w]))
        const labels = Array.from(new Set([...data.weeklyBreakdown.current.map((w) => w.label), ...data.weeklyBreakdown.previous.map((w) => w.label)])).sort()
        return labels.map((label) => ({ label, 当月: curMap.get(label)?.[weekMetric] ?? 0, 前月: prevMap.get(label)?.[weekMetric] ?? 0 }))
    })() : []

    const trendMetricLabel = TREND_METRIC_OPTS.find((o) => o.value === trendMetric)?.label ?? ''

    return (
        <PageShell
            pageId="insights"
            requireProduct
            status={{ loading: report.loading, error: report.error, source: 'ga4', onRetry: report.run }}
            keepChildrenWhileLoading
            controls={
                <div className={styles.monthNavBar}>
                    <button type="button" className={ui.btn} onClick={() => changeMonth(shiftYm(baseMonth, -1))}>◀ 前月</button>
                    <input type="month" value={baseMonth} max={currentYm} onChange={(e) => e.target.value && changeMonth(e.target.value)} className={styles.monthPicker} aria-label="基準月" />
                    <button type="button" className={ui.btn} disabled={baseMonth >= currentYm} onClick={() => changeMonth(shiftYm(baseMonth, 1))}>翌月 ▶</button>
                    {baseMonth !== currentYm && (
                        <button type="button" className={ui.btnGhost} onClick={() => changeMonth(currentYm)}>今月に戻る</button>
                    )}
                </div>
            }
        >
            {data && (
                <>
                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>KPIサマリー（{data.current.startDate} 〜 {data.current.endDate}）</h2>
                        <div className={ui.tableWrap}>
                            <table className={ui.dataTable}>
                                <thead>
                                    <tr>
                                        <th>指標</th>
                                        <th className={ui.num}>当月</th>
                                        <th className={ui.num}>前月（{data.previous.startDate}〜）</th>
                                        <th className={ui.num}>前月比</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {METRICS.map(({ label, tooltip, current, prev, delta }) => (
                                        <tr key={label}>
                                            <td>{label}{tooltip && <InfoTooltip text={tooltip} />}</td>
                                            <td className={cx(ui.num, ui.strong)}>{current}</td>
                                            <td className={cx(ui.num, styles.muted)}>{prev}</td>
                                            <td className={ui.num}>{delta ? <span className={delta.up ? styles.deltaUp : styles.deltaDown}>{delta.text}</span> : '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {data.monthlyTrend.length > 0 && (
                        <div className={ui.card}>
                            <div className={styles.sectionHeader}>
                                <h2 className={ui.sectionTitle} style={{ marginBottom: 0 }}>月次トレンド（過去12ヶ月）</h2>
                                <div className={styles.metricTabs}>
                                    {TREND_METRIC_OPTS.map((opt) => (
                                        <button key={opt.value} type="button" onClick={() => setTrendMetric(opt.value)} className={cx(styles.metricTab, trendMetric === opt.value && styles.metricTabActive)}>
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className={styles.chartWrapper}>
                                <ResponsiveContainer width="100%" height={240}>
                                    <LineChart data={data.monthlyTrend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                                        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v: string) => v.slice(2)} />
                                        <YAxis
                                            tick={AXIS_TICK} tickLine={false} axisLine={false} width={48}
                                            tickFormatter={(v: number) => (trendMetric === 'engagementRate' ? `${(v * 100).toFixed(0)}%` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                                        />
                                        <Tooltip
                                            cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
                                            content={({ active, payload, label: lbl }) => {
                                                if (!active || !payload?.length) return null
                                                const v = payload[0].value as number
                                                const disp = trendMetric === 'engagementRate' ? `${(v * 100).toFixed(1)}%` : v.toLocaleString()
                                                return (
                                                    <div className={styles.chartTooltip}>
                                                        <p className={styles.chartTooltipLabel}>{lbl}</p>
                                                        <p className={styles.chartTooltipRow}><span style={{ color: CURRENT_COLOR }}>{trendMetricLabel}</span><span>{disp}</span></p>
                                                    </div>
                                                )
                                            }}
                                        />
                                        <Line type="monotone" dataKey={trendMetric} stroke={CURRENT_COLOR} strokeWidth={2} dot={{ r: 3, fill: CURRENT_COLOR }} activeDot={{ r: 5 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>

                            <div className={ui.tableWrap} style={{ marginTop: '1rem' }}>
                                <table className={ui.dataTable}>
                                    <thead>
                                        <tr>
                                            <th>月</th>
                                            <th className={ui.num}>ユーザー数</th>
                                            <th className={ui.num}>新規</th>
                                            <th className={ui.num}>セッション</th>
                                            <th className={ui.num}>PV</th>
                                            <th className={ui.num}>EG率</th>
                                            <th className={ui.num}>応募CV<InfoTooltip text={CV_TOOLTIPS.applyCv} /></th>
                                            <th className={ui.num}>LP応募<InfoTooltip text={CV_TOOLTIPS.lpApplyCv} /></th>
                                            <th className={ui.num}>登録CV<InfoTooltip text={CV_TOOLTIPS.signupCv} /></th>
                                            <th className={ui.num}>前月比（AU）</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.monthlyTrend.map((m, i) => {
                                            const prev = i > 0 ? data.monthlyTrend[i - 1] : null
                                            const isBase = m.label === data.baseMonth
                                            return (
                                                <tr key={m.label} className={isBase ? styles.baseRow : undefined}>
                                                    <td>{m.label}{isBase && <span className={styles.baseMonthTag}>基準月</span>}</td>
                                                    <td className={cx(ui.num, isBase && ui.strong)}>{m.activeUsers.toLocaleString()}</td>
                                                    <td className={ui.num}>{m.newUsers.toLocaleString()}</td>
                                                    <td className={ui.num}>{m.sessions.toLocaleString()}</td>
                                                    <td className={ui.num}>{m.screenPageViews.toLocaleString()}</td>
                                                    <td className={ui.num}>{(m.engagementRate * 100).toFixed(1)}%</td>
                                                    <td className={ui.num}>{m.applyCv.toLocaleString()}</td>
                                                    <td className={ui.num}>{m.lpApplyCv.toLocaleString()}</td>
                                                    <td className={ui.num}>{m.signupCv.toLocaleString()}</td>
                                                    <td className={ui.num}>{prev ? <DeltaBadge a={m.activeUsers} b={prev.activeUsers} /> : <span className={styles.muted}>-</span>}</td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {weekChartData.length > 0 && (
                        <div className={ui.card}>
                            <div className={styles.sectionHeader}>
                                <h2 className={ui.sectionTitle} style={{ marginBottom: 0 }}>週次内訳（当月 vs 前月）</h2>
                                <div className={styles.metricTabs}>
                                    {WEEK_METRIC_OPTS.map((opt) => (
                                        <button key={opt.value} type="button" onClick={() => setWeekMetric(opt.value)} className={cx(styles.metricTab, weekMetric === opt.value && styles.metricTabActive)}>
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className={styles.chartWrapper}>
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={weekChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                                        <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                                        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                                            content={({ active, payload, label: lbl }) => {
                                                if (!active || !payload?.length) return null
                                                return (
                                                    <div className={styles.chartTooltip}>
                                                        <p className={styles.chartTooltipLabel}>{lbl}</p>
                                                        {payload.map((p) => (
                                                            <p key={p.name} className={styles.chartTooltipRow}><span>{p.name}</span><span>{(p.value as number).toLocaleString()}</span></p>
                                                        ))}
                                                    </div>
                                                )
                                            }}
                                        />
                                        <Legend wrapperStyle={{ fontSize: '0.8125rem', color: 'var(--text-muted)', paddingTop: '0.5rem' }} />
                                        <Bar dataKey="当月" fill={CURRENT_COLOR} radius={[3, 3, 0, 0]} maxBarSize={36} />
                                        <Bar dataKey="前月" fill={PREVIOUS_COLOR} radius={[3, 3, 0, 0]} maxBarSize={36} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>

                            <div className={ui.tableWrap} style={{ marginTop: '1rem' }}>
                                <table className={ui.dataTable}>
                                    <thead>
                                        <tr>
                                            <th>週</th>
                                            <th className={styles.muted}>期間（当月）</th>
                                            <th className={ui.num}>ユーザー数</th>
                                            <th className={ui.num}>セッション</th>
                                            <th className={ui.num}>PV</th>
                                            <th className={ui.num}>EG率</th>
                                            <th className={ui.num}>応募CV<InfoTooltip text={CV_TOOLTIPS.applyCv} /></th>
                                            <th className={ui.num}>前月同週比</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.weeklyBreakdown.current.map((week) => {
                                            const prev = data.weeklyBreakdown.previous.find((w) => w.label === week.label)
                                            return (
                                                <tr key={week.label}>
                                                    <td className={styles.weekLabel}>{week.label}</td>
                                                    <td className={styles.muted}>{week.startDate.slice(5)} 〜 {week.endDate.slice(5)}</td>
                                                    <td className={cx(ui.num, ui.strong)}>{week.activeUsers.toLocaleString()}{prev && <span className={styles.prevVal}>（{prev.activeUsers.toLocaleString()}）</span>}</td>
                                                    <td className={ui.num}>{week.sessions.toLocaleString()}{prev && <span className={styles.prevVal}>（{prev.sessions.toLocaleString()}）</span>}</td>
                                                    <td className={ui.num}>{week.screenPageViews.toLocaleString()}{prev && <span className={styles.prevVal}>（{prev.screenPageViews.toLocaleString()}）</span>}</td>
                                                    <td className={ui.num}>{(week.engagementRate * 100).toFixed(1)}%</td>
                                                    <td className={ui.num}>{week.applyCv.toLocaleString()}{prev && <span className={styles.prevVal}>（{prev.applyCv.toLocaleString()}）</span>}</td>
                                                    <td className={ui.num}>{prev ? <DeltaBadge a={week.activeUsers} b={prev.activeUsers} /> : <span className={styles.muted}>-</span>}</td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>当月の上位ページ（PV順）</h2>
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

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>AIインサイト</h2>
                        <div className={ui.controls}>
                            <button type="button" onClick={handleGemini} disabled={geminiLoading} className={ui.btnPrimary}>
                                {geminiLoading ? <span className={ui.inlineLoading}><AISpinner /> 生成中...</span> : 'AIレポートを生成'}
                            </button>
                        </div>
                        {geminiError && <Alert tone="error">{geminiError}</Alert>}
                        {geminiResult && (
                            <div className={ui.aiResult}>
                                {geminiResult.split('\n').map((line, i) => {
                                    const bold = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                    return line.trim() ? <p key={i} dangerouslySetInnerHTML={{ __html: bold }} /> : null
                                })}
                            </div>
                        )}
                    </div>
                </>
            )}
        </PageShell>
    )
}
