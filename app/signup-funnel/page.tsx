'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useProduct } from '@/lib/contexts/ProductContext'
import BackLink from '@/components/BackLink'
import RelatedPages from '@/components/RelatedPages/RelatedPages'
import SignupTrendChart, { TrendSeries } from '@/components/signup-funnel/SignupTrendChart'
import { parseJsonResponse } from '@/lib/utils/fetch'
import { CV_UNIT_VALUE_ASOF, cvValueYen, formatYenApprox } from '@/lib/constants/cvUnitValue'
import styles from './SignupFunnelPage.module.css'

interface QuestionRow {
    name: string
    view: number
    click: number
    variants: number
}

interface SignupFunnelResponse {
    startDate: string
    endDate: string
    forms: Array<{ key: string; label: string }>
    form: string
    formLabel: string
    origin: number | null
    questions: QuestionRow[]
    unassignedClicks: number
}

interface TrendForm {
    key: string
    label: string
    clicks: number[]
    completed: number[]
}

interface TrendResponse {
    startDate: string
    endDate: string
    dates: string[]
    overall: { clicks: number[]; completed: number[]; formUsers: number[] }
    forms: TrendForm[]
}

function fmtYmd(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 今月・前月はクライアントで具体日付に変換する（前期間計算のため終端も具体日付にする）
function monthRange(offset: 0 | -1): { startDate: string; endDate: string } {
    const now = new Date()
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    const last = offset === 0 ? (yesterday < first ? first : yesterday) : new Date(now.getFullYear(), now.getMonth(), 0)
    return { startDate: fmtYmd(first), endDate: fmtYmd(last) }
}

// 直前の同じ長さの期間（30日なら先月相当）
function prevRangeOf(range: { startDate: string; endDate: string }): { startDate: string; endDate: string } {
    const s = new Date(`${range.startDate}T00:00:00`)
    const e = new Date(`${range.endDate}T00:00:00`)
    const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1
    const prevEnd = new Date(s)
    prevEnd.setDate(s.getDate() - 1)
    const prevStart = new Date(prevEnd)
    prevStart.setDate(prevEnd.getDate() - (days - 1))
    return { startDate: fmtYmd(prevStart), endDate: fmtYmd(prevEnd) }
}

function daysAgoStr(days: number): string {
    const d = new Date()
    d.setDate(d.getDate() - days)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const PERIOD_OPTIONS = [
    { value: '7daysAgo', label: '過去7日' },
    { value: '14daysAgo', label: '過去14日' },
    { value: '30daysAgo', label: '過去30日' },
    { value: '90daysAgo', label: '過去90日' },
    { value: 'thisMonth', label: '今月' },
    { value: 'lastMonth', label: '前月' },
    { value: 'custom', label: 'カスタム（日付指定）' },
]

function pct(n: number, base: number): string {
    return base > 0 ? `${((n / base) * 100).toFixed(0)}%` : '－'
}

function pct1(n: number, base: number): string {
    return base > 0 ? `${((n / base) * 100).toFixed(1)}%` : '－'
}

function dropClass(rate: number): string {
    if (rate >= 0.15) return styles.dropHigh
    if (rate >= 0.1) return styles.dropMid
    return styles.dropLow
}

// 前期間比（件数は変化率%、率はポイント差）。前期間が0または欠損なら「－」
function DeltaPct({ cur, prev }: { cur: number; prev: number | null }) {
    if (prev == null || prev === 0) return <span className={styles.deltaFlat}>－</span>
    const d = ((cur - prev) / prev) * 100
    const cls = d > 0 ? styles.deltaUp : d < 0 ? styles.deltaDown : styles.deltaFlat
    return <span className={cls}>{d > 0 ? '＋' : d < 0 ? '' : '±'}{d.toFixed(1)}%</span>
}

function DeltaPt({ cur, prev }: { cur: number | null; prev: number | null }) {
    if (cur == null || prev == null) return <span className={styles.deltaFlat}>－</span>
    const d = cur - prev
    const cls = d > 0 ? styles.deltaUp : d < 0 ? styles.deltaDown : styles.deltaFlat
    return <span className={cls}>{d > 0 ? '＋' : d < 0 ? '' : '±'}{d.toFixed(1)}pt</span>
}

// 検証済みダークパレット（dataviz参照パレット準拠・固定順）。先頭は常に「全体」
const SERIES_COLORS = ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9', '#e66767']

type TrendMetric = 'clicks' | 'completed' | 'rate'

const TREND_METRICS: Array<{ value: TrendMetric; label: string }> = [
    { value: 'clicks', label: '流入（職種選択）' },
    { value: 'completed', label: '登録完了' },
    { value: 'rate', label: '完走率' },
]

function fmtDateLabel(d: string): string {
    return `${parseInt(d.slice(4, 6), 10)}/${parseInt(d.slice(6, 8), 10)}`
}

// 日次配列を週次（月曜始まり）に合算する
function toWeekly(dates: string[], values: number[]): { labels: string[]; values: number[] } {
    const labels: string[] = []
    const out: number[] = []
    let currentWeek = ''
    for (let i = 0; i < dates.length; i++) {
        const d = new Date(`${dates[i].slice(0, 4)}-${dates[i].slice(4, 6)}-${dates[i].slice(6, 8)}T00:00:00`)
        const monday = new Date(d)
        monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
        const weekKey = `${monday.getMonth() + 1}/${monday.getDate()}週`
        if (weekKey !== currentWeek) {
            currentWeek = weekKey
            labels.push(weekKey)
            out.push(0)
        }
        out[out.length - 1] += values[i]
    }
    return { labels, values: out }
}

function resolveRange(period: string, customStart: string, customEnd: string): { startDate: string; endDate: string } | null {
    if (period === 'thisMonth') return monthRange(0)
    if (period === 'lastMonth') return monthRange(-1)
    if (period === 'custom') {
        if (!customStart || !customEnd || customStart > customEnd) return null
        return { startDate: customStart, endDate: customEnd }
    }
    const m = period.match(/^(\d+)daysAgo$/)
    if (m) return { startDate: daysAgoStr(parseInt(m[1], 10)), endDate: daysAgoStr(1) }
    return { startDate: period, endDate: 'yesterday' }
}

export default function SignupFunnelPage() {
    const { currentProduct } = useProduct()
    const [period, setPeriod] = useState('30daysAgo')
    const [customStart, setCustomStart] = useState(daysAgoStr(30))
    const [customEnd, setCustomEnd] = useState(daysAgoStr(1))
    const [form, setForm] = useState<string | null>(null)
    const [data, setData] = useState<SignupFunnelResponse | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [trend, setTrend] = useState<TrendResponse | null>(null)
    const [prevTrend, setPrevTrend] = useState<TrendResponse | null>(null)
    const [trendLoading, setTrendLoading] = useState(false)
    const [trendError, setTrendError] = useState<string | null>(null)
    const [trendMetric, setTrendMetric] = useState<TrendMetric>('rate')
    // 推移セクションは上のファネルと独立して期間を選べる
    const [trendPeriod, setTrendPeriod] = useState('30daysAgo')
    const [trendCustomStart, setTrendCustomStart] = useState(daysAgoStr(30))
    const [trendCustomEnd, setTrendCustomEnd] = useState(daysAgoStr(1))

    const periodToRange = useCallback(
        () => resolveRange(period, customStart, customEnd),
        [period, customStart, customEnd]
    )
    const trendRange = useMemo(
        () => resolveRange(trendPeriod, trendCustomStart, trendCustomEnd),
        [trendPeriod, trendCustomStart, trendCustomEnd]
    )

    const load = useCallback(async () => {
        if (!currentProduct?.ga4PropertyId) return
        const range = periodToRange()
        if (!range) return
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/signup-funnel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    propertyId: currentProduct.ga4PropertyId,
                    ...range,
                    form: form ?? undefined,
                }),
            })
            const json = await parseJsonResponse<SignupFunnelResponse & { error?: string }>(res)
            if (!res.ok) throw new Error(json.error || '取得に失敗しました')
            setData(json)
        } catch (e) {
            setError(e instanceof Error ? e.message : '取得に失敗しました')
            setData(null)
        } finally {
            setLoading(false)
        }
    }, [currentProduct?.ga4PropertyId, periodToRange, form])

    const loadTrend = useCallback(async () => {
        if (!currentProduct?.ga4PropertyId) return
        const range = trendRange
        if (!range) return
        setTrendLoading(true)
        setTrendError(null)
        const fetchTrend = async (r: { startDate: string; endDate: string }) => {
            const res = await fetch('/api/signup-funnel/trend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ propertyId: currentProduct.ga4PropertyId, ...r }),
            })
            const json = await parseJsonResponse<TrendResponse & { error?: string }>(res)
            if (!res.ok) throw new Error(json.error || '取得に失敗しました')
            return json
        }
        try {
            // 前期間（直前の同じ長さ）は比較用。失敗しても本体は表示する
            const [cur, prev] = await Promise.all([
                fetchTrend(range),
                fetchTrend(prevRangeOf(range)).catch(() => null),
            ])
            setTrend(cur)
            setPrevTrend(prev)
        } catch (e) {
            setTrendError(e instanceof Error ? e.message : '取得に失敗しました')
            setTrend(null)
            setPrevTrend(null)
        } finally {
            setTrendLoading(false)
        }
    }, [currentProduct?.ga4PropertyId, trendRange])

    useEffect(() => { load() }, [load])
    useEffect(() => { loadTrend() }, [loadTrend])

    // 完走率計算のベース: 起点（職種選択）があればそれ、なければ最初の質問のclick
    const base = data ? (data.origin ?? data.questions[0]?.click ?? 0) : 0
    const completed = data?.questions.length ? data.questions[data.questions.length - 1].click : 0

    // 推移チャート: 全体 + 上位4職種 + その他（6系列固定・色は職種に固定割当）
    const trendView = useMemo(() => {
        if (!trend || trend.dates.length === 0) return null
        const weekly = trend.dates.length > 35
        const top = trend.forms.slice(0, 4)
        const rest = trend.forms.slice(4)
        const restClicks = trend.dates.map((_, i) => rest.reduce((s, f) => s + f.clicks[i], 0))
        const restCompleted = trend.dates.map((_, i) => rest.reduce((s, f) => s + f.completed[i], 0))

        const entries: Array<{ name: string; clicks: number[]; completed: number[] }> = [
            { name: '全体', clicks: trend.overall.clicks, completed: trend.overall.completed },
            ...top.map((f) => ({ name: f.label, clicks: f.clicks, completed: f.completed })),
            ...(rest.length > 0 ? [{ name: 'その他職種', clicks: restClicks, completed: restCompleted }] : []),
        ]

        let labels = trend.dates.map(fmtDateLabel)
        const series: TrendSeries[] = entries.map((e, idx) => {
            let clicks = e.clicks
            let comp = e.completed
            if (weekly) {
                const w1 = toWeekly(trend.dates, e.clicks)
                const w2 = toWeekly(trend.dates, e.completed)
                labels = w1.labels
                clicks = w1.values
                comp = w2.values
            }
            const data =
                trendMetric === 'clicks' ? clicks
                : trendMetric === 'completed' ? comp
                : clicks.map((c, i) => (c > 0 ? Math.round((comp[i] / c) * 1000) / 10 : null))
            return { name: e.name, color: SERIES_COLORS[idx % SERIES_COLORS.length], data }
        })
        return { labels, series, weekly }
    }, [trend, trendMetric])

    const trendTotals = useMemo(() => {
        if (!trend) return null
        const sum = (a: number[]) => a.reduce((s, n) => s + n, 0)
        const rate = (comp: number, clk: number) => (clk > 0 ? (comp / clk) * 100 : null)

        const overallClicks = sum(trend.overall.clicks)
        const overallCompleted = sum(trend.overall.completed)
        const prevOverallClicks = prevTrend ? sum(prevTrend.overall.clicks) : null
        const prevOverallCompleted = prevTrend ? sum(prevTrend.overall.completed) : null

        const prevByKey = new Map(
            (prevTrend?.forms ?? []).map((f) => [f.key, { clicks: sum(f.clicks), completed: sum(f.completed) }])
        )
        const forms = trend.forms.map((f) => {
            const clicks = sum(f.clicks)
            const completedN = sum(f.completed)
            const prev = prevByKey.get(f.key) ?? null
            return {
                key: f.key,
                label: f.label,
                clicks,
                completed: completedN,
                rate: rate(completedN, clicks),
                prevClicks: prev?.clicks ?? null,
                prevCompleted: prev?.completed ?? null,
                prevRate: prev ? rate(prev.completed, prev.clicks) : null,
            }
        })
        const occKnown = sum(forms.map((f) => f.completed))
        return {
            overallClicks,
            overallCompleted,
            overallRate: rate(overallCompleted, overallClicks),
            prevOverallClicks,
            prevOverallCompleted,
            prevOverallRate: prevOverallClicks != null && prevOverallCompleted != null ? rate(prevOverallCompleted, prevOverallClicks) : null,
            occUnknown: overallCompleted - occKnown,
            forms,
        }
    }, [trend, prevTrend])

    const prevRange = useMemo(() => (trendRange ? prevRangeOf(trendRange) : null), [trendRange])

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>会員登録フォームファネル</h1>
                    <p className={styles.subtitle}>
                        職種選択から登録完了までの各質問の通過状況（view=画面を見た人 / click=回答して進んだ人）。
                        期間内に実際に発火したGTMラベルから質問構造を自動復元するため、ABテストのラベル変更やステップ番号の振り直しにも自動で追従します。
                    </p>
                </div>
                <BackLink href="/">ダッシュボード</BackLink>
            </div>

            {!currentProduct && <div className={styles.notice}>プロダクトを選択してください</div>}

            <RelatedPages pages={[{ href: '/cv-value', label: 'CV単価・お金まわり' }, { href: '/cv-types', label: '求人種別CV分析（応募ファネル）' }, { href: '/occupation', label: '職種別CV分析' }, { href: '/journey', label: 'ユーザー経路分析' }]} />

            <div className={styles.controls}>
                <select className={styles.select} value={period} onChange={(e) => setPeriod(e.target.value)}>
                    {PERIOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {period === 'custom' && (
                    <>
                        <input
                            type="date"
                            className={styles.select}
                            value={customStart}
                            max={customEnd}
                            onChange={(e) => setCustomStart(e.target.value)}
                        />
                        <span className={styles.periodNote}>〜</span>
                        <input
                            type="date"
                            className={styles.select}
                            value={customEnd}
                            min={customStart}
                            max={daysAgoStr(0)}
                            onChange={(e) => setCustomEnd(e.target.value)}
                        />
                    </>
                )}
                {data && <span className={styles.periodNote}>集計期間: {data.startDate} 〜 {data.endDate}</span>}
            </div>

            {data && (
                <div className={styles.formTabs}>
                    {data.forms.map((f) => (
                        <button
                            key={f.key}
                            className={`${styles.formTab} ${f.key === data.form ? styles.formTabActive : ''}`}
                            onClick={() => setForm(f.key)}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            )}

            {loading && <p className={styles.loading}>読み込み中...</p>}
            {error && <div className={styles.error}>{error}</div>}

            {data && !loading && (
                <>
                    <div className={styles.summaryRow}>
                        {data.origin != null && (
                            <div className={styles.summaryCard}>
                                <span className={styles.summaryLabel}>職種選択（{data.formLabel}）</span>
                                <span className={styles.summaryValue}>{data.origin.toLocaleString()}</span>
                                <span className={styles.summaryHint}>フォーム選択クリック</span>
                            </div>
                        )}
                        <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>登録完了</span>
                            <span className={styles.summaryValue}>{completed.toLocaleString()}</span>
                            <span className={styles.summaryYen}>{formatYenApprox(cvValueYen('signup', completed) ?? 0)}</span>
                            <span className={styles.summaryHint}>
                                最終ステップの完了クリック／金額は期待売上換算（約1.8万円/登録、SF {CV_UNIT_VALUE_ASOF} 算出）
                            </span>
                        </div>
                        <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>完走率</span>
                            <span className={styles.summaryValue}>{pct(completed, base)}</span>
                            <span className={styles.summaryHint}>{data.origin != null ? '職種選択クリック起点' : '最初の質問起点'}</span>
                        </div>
                    </div>

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>{data.formLabel} フォーム 質問別ファネル</h2>
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>質問</th>
                                        <th className={styles.num}>view</th>
                                        <th className={styles.num}>click</th>
                                        <th className={styles.num}>起点比</th>
                                        <th className={styles.barCell}>残存</th>
                                        <th className={styles.num}>このステップの離脱率</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.origin != null && (
                                        <tr className={styles.originRow}>
                                            <td>職種選択「{data.formLabel}」</td>
                                            <td className={styles.num}>－</td>
                                            <td className={styles.num}>{data.origin.toLocaleString()}</td>
                                            <td className={styles.num}>100%</td>
                                            <td className={styles.barCell}>
                                                <div className={styles.barTrack}><div className={styles.barFill} style={{ width: '100%' }} /></div>
                                            </td>
                                            <td className={styles.num}>－</td>
                                        </tr>
                                    )}
                                    {(() => {
                                        // 全変種に存在する質問だけを離脱率のチェーンに使う。
                                        // 一部変種のみの質問（短縮版で削られた質問など）は母集団が違うため参考行にする
                                        const maxVariants = Math.max(...data.questions.map((q) => q.variants), 1)
                                        let prevChain: number | null = data.origin
                                        return data.questions.map((q) => {
                                            const inChain = q.variants === maxVariants
                                            const drop = inChain && prevChain != null && prevChain > 0 ? 1 - q.click / prevChain : null
                                            if (inChain) prevChain = q.click
                                            return { q, inChain, drop }
                                        })
                                    })().map(({ q, inChain, drop }) => {
                                        return (
                                            <tr key={q.name}>
                                                <td>{q.name}{!inChain && <span className={styles.partialTag}>一部変種のみ</span>}</td>
                                                <td className={styles.num}>{q.view.toLocaleString()}</td>
                                                <td className={`${styles.num} ${styles.strong}`}>{q.click.toLocaleString()}</td>
                                                <td className={styles.num}>{pct(q.click, base)}</td>
                                                <td className={styles.barCell}>
                                                    <div className={styles.barTrack}>
                                                        <div className={styles.barFill} style={{ width: base > 0 ? `${Math.min(100, (q.click / base) * 100)}%` : '0%' }} />
                                                    </div>
                                                </td>
                                                <td className={`${styles.num} ${drop != null && drop > 0 ? dropClass(drop) : styles.dropLow}`}>
                                                    {!inChain ? '－' : drop == null ? '－' : drop <= 0 ? '（逆転）' : `▼${(drop * 100).toFixed(1)}%`}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <p className={styles.tableNote}>
                            click＝そのステップで前進操作（選択肢タップ・次へ等、「戻る」除く）をした人。通過の実数としてはclickが信頼できます。
                            viewは視認計測条件（50%表示×1秒）の取りこぼしで1〜2割少なく出ることがあり、clickより小さい場合があります。
                            「逆転」は期間境界をまたいで途中再開したユーザーの影響です。
                            質問はABテスト変種（__B-xxxx）を質問文ベースで統合しており、変種間でステップ番号がズレていても正しく合算されます。
                            「一部変種のみ」の質問（短縮版で削られた質問など）は母集団が異なるため離脱率チェーンから除外し、参考値として表示しています。
                        </p>
                    </div>
                </>
            )}

            <div className={styles.card}>
                <h2 className={styles.sectionTitle}>職種別 × 全体の推移（流入・登録完了・完走率）</h2>
                <div className={styles.controls}>
                    <select className={styles.select} value={trendPeriod} onChange={(e) => setTrendPeriod(e.target.value)}>
                        {PERIOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {trendPeriod === 'custom' && (
                        <>
                            <input
                                type="date"
                                className={styles.select}
                                value={trendCustomStart}
                                max={trendCustomEnd}
                                onChange={(e) => setTrendCustomStart(e.target.value)}
                            />
                            <span className={styles.periodNote}>〜</span>
                            <input
                                type="date"
                                className={styles.select}
                                value={trendCustomEnd}
                                min={trendCustomStart}
                                max={daysAgoStr(0)}
                                onChange={(e) => setTrendCustomEnd(e.target.value)}
                            />
                        </>
                    )}
                    {trendRange && <span className={styles.periodNote}>期間: {trendRange.startDate} 〜 {trendRange.endDate}（上のファネルとは独立）</span>}
                </div>
                <div className={styles.controls}>
                    {TREND_METRICS.map((m) => (
                        <button
                            key={m.value}
                            className={`${styles.formTab} ${trendMetric === m.value ? styles.formTabActive : ''}`}
                            onClick={() => setTrendMetric(m.value)}
                        >
                            {m.label}
                        </button>
                    ))}
                    {trendView?.weekly && <span className={styles.periodNote}>期間が長いため週次（月曜始まり）で表示</span>}
                </div>
                {trendLoading && <p className={styles.loading}>推移を読み込み中...</p>}
                {trendError && <div className={styles.error}>{trendError}</div>}
                {trendView && !trendLoading && (
                    <>
                        {trendTotals && prevTrend && prevRange && (
                            <>
                                <div className={styles.summaryRow}>
                                    <div className={styles.summaryCard}>
                                        <span className={styles.summaryLabel}>流入（全体・職種選択クリック）</span>
                                        <span className={styles.summaryValue}>
                                            {trendTotals.overallClicks.toLocaleString()}{' '}
                                            <DeltaPct cur={trendTotals.overallClicks} prev={trendTotals.prevOverallClicks} />
                                        </span>
                                        <span className={styles.summaryHint}>前期間 {trendTotals.prevOverallClicks?.toLocaleString() ?? '－'}</span>
                                    </div>
                                    <div className={styles.summaryCard}>
                                        <span className={styles.summaryLabel}>登録完了（全体）</span>
                                        <span className={styles.summaryValue}>
                                            {trendTotals.overallCompleted.toLocaleString()}{' '}
                                            <DeltaPct cur={trendTotals.overallCompleted} prev={trendTotals.prevOverallCompleted} />
                                        </span>
                                        <span className={styles.summaryHint}>前期間 {trendTotals.prevOverallCompleted?.toLocaleString() ?? '－'}</span>
                                    </div>
                                    <div className={styles.summaryCard}>
                                        <span className={styles.summaryLabel}>完走率（全体）</span>
                                        <span className={styles.summaryValue}>
                                            {trendTotals.overallRate != null ? `${trendTotals.overallRate.toFixed(1)}%` : '－'}{' '}
                                            <DeltaPt cur={trendTotals.overallRate} prev={trendTotals.prevOverallRate} />
                                        </span>
                                        <span className={styles.summaryHint}>
                                            前期間 {trendTotals.prevOverallRate != null ? `${trendTotals.prevOverallRate.toFixed(1)}%` : '－'}
                                        </span>
                                    </div>
                                </div>
                                <p className={styles.compareNote}>
                                    前期間 = {prevRange.startDate} 〜 {prevRange.endDate}（直前の同じ長さの期間）との比較。件数は変化率、完走率はポイント差。
                                </p>
                            </>
                        )}
                        <SignupTrendChart labels={trendView.labels} series={trendView.series} percent={trendMetric === 'rate'} />
                        {trendTotals && (
                            <div className={styles.tableWrapper}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>職種フォーム</th>
                                            <th className={styles.num}>流入（職種選択クリック）</th>
                                            <th className={styles.num}>前期間比</th>
                                            <th className={styles.num}>登録完了</th>
                                            <th className={styles.num}>前期間比</th>
                                            <th className={styles.num}>完走率</th>
                                            <th className={styles.num}>前期間比</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr className={styles.originRow}>
                                            <td>全体</td>
                                            <td className={styles.num}>{trendTotals.overallClicks.toLocaleString()}</td>
                                            <td className={styles.num}><DeltaPct cur={trendTotals.overallClicks} prev={trendTotals.prevOverallClicks} /></td>
                                            <td className={`${styles.num} ${styles.strong}`}>{trendTotals.overallCompleted.toLocaleString()}</td>
                                            <td className={styles.num}><DeltaPct cur={trendTotals.overallCompleted} prev={trendTotals.prevOverallCompleted} /></td>
                                            <td className={styles.num}>{pct1(trendTotals.overallCompleted, trendTotals.overallClicks)}</td>
                                            <td className={styles.num}><DeltaPt cur={trendTotals.overallRate} prev={trendTotals.prevOverallRate} /></td>
                                        </tr>
                                        {trendTotals.forms.map((f) => (
                                            <tr key={f.key}>
                                                <td>{f.label}</td>
                                                <td className={styles.num}>{f.clicks.toLocaleString()}</td>
                                                <td className={styles.num}><DeltaPct cur={f.clicks} prev={f.prevClicks} /></td>
                                                <td className={`${styles.num} ${styles.strong}`}>{f.completed.toLocaleString()}</td>
                                                <td className={styles.num}><DeltaPct cur={f.completed} prev={f.prevCompleted} /></td>
                                                <td className={styles.num}>{pct1(f.completed, f.clicks)}</td>
                                                <td className={styles.num}><DeltaPt cur={f.rate} prev={f.prevRate} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <p className={styles.tableNote}>
                            流入＝職種選択ボタン（SU__Jobs__Btn__）のクリックユーザー、登録完了＝/members/signup/thanks 到達ユーザー（職種は ?occ= パラメータで分解）、完走率＝完了÷流入。
                            {trendTotals && trendTotals.occUnknown > 0 && ` 完了のうち ${trendTotals.occUnknown.toLocaleString()}人 は occ パラメータなしのため全体のみに含まれます。`}
                            チャートは上位4職種＋その他に集約しています（全職種の数値は表を参照）。
                            前期間比は件数が変化率（%）、完走率がポイント差（pt）。前期間の値が0または取得不可の職種は「－」。
                            日をまたいで完了したユーザーは流入と完了の日付がズレるため、日次の完走率は目安です。
                        </p>
                    </>
                )}
            </div>
        </div>
    )
}
