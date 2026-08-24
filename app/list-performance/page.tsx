'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import BackLink from '@/components/BackLink'
import RelatedPages from '@/components/RelatedPages/RelatedPages'
import SignupTrendChart from '@/components/signup-funnel/SignupTrendChart'
import PeriodSelect, { usePeriodRange } from '@/components/PeriodSelect/PeriodSelect'
import { PeriodOption } from '@/lib/utils/period'
import { parseJsonResponse } from '@/lib/utils/fetch'
import styles from './ListPerformancePage.module.css'

interface SegmentRow {
    segment: string
    pv: number
    sessions: number
    toDetail: number
}

interface DailyRow extends SegmentRow {
    date: string
}

interface ListPerformanceResponse {
    startDate: string
    endDate: string
    clamped: boolean
    summary: SegmentRow[]
    daily: DailyRow[]
    scannedBytes: number
    fetchedAt: string
}

const INDUSTRY_LABELS: Record<string, string> = {
    driver: 'ドライバー',
    sekokan: '施工管理',
    sekkei: '設計',
    soko: '倉庫',
    shokunin: '職人',
    seibi: '整備士',
    hoshu: '保守・メンテ',
    'setsubi-sagyo': '設備作業',
    keibi: '警備',
    unkan: '運行管理',
    'kojo-sagyo': '工場作業',
    food: 'フード',
    'unyu-sagyo': '運輸作業',
    others: 'その他職種',
    search: '検索結果（/search）',
}

const PERIOD_OPTIONS: PeriodOption[] = [
    { value: '7daysAgo', label: '過去7日' },
    { value: '14daysAgo', label: '過去14日' },
    { value: '30daysAgo', label: '過去30日' },
    { value: 'thisMonth', label: '今月' },
    { value: 'lastMonth', label: '前月' },
    { value: 'custom', label: 'カスタム（日付指定）' },
]

// 検証済みダークパレット（dataviz参照パレット準拠・固定順）
const SERIES_COLORS = ['#3987e5', '#c98500']

type TrendMetric = 'rate' | 'pv' | 'sessions'
const TREND_METRICS: Array<{ value: TrendMetric; label: string }> = [
    { value: 'rate', label: '詳細遷移率' },
    { value: 'pv', label: 'PV' },
    { value: 'sessions', label: '閲覧セッション' },
]

function pct(num: number, den: number): string {
    return den > 0 ? `${((num / den) * 100).toFixed(1)}%` : '－'
}

function fmtDateLabel(d: string): string {
    return `${parseInt(d.slice(5, 7), 10)}/${parseInt(d.slice(8, 10), 10)}`
}

export default function ListPerformancePage() {
    const periodState = usePeriodRange('30daysAgo')
    const { range } = periodState
    const [data, setData] = useState<ListPerformanceResponse | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [metric, setMetric] = useState<TrendMetric>('rate')

    const load = useCallback(async () => {
        if (!range) return
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/list-performance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ startDate: range.startDate, endDate: range.endDate }),
            })
            const json = await parseJsonResponse<ListPerformanceResponse & { error?: string; message?: string }>(res)
            if (!res.ok) throw new Error(json.message || json.error || '取得に失敗しました')
            setData(json)
        } catch (e) {
            setError(e instanceof Error ? e.message : '取得に失敗しました')
            setData(null)
        } finally {
            setLoading(false)
        }
    }, [range])

    useEffect(() => { load() }, [load])

    // サマリー: 職種別（セッション降順）+ 職種計 + search
    const industryRows = useMemo(
        () => (data?.summary ?? []).filter((s) => s.segment !== 'search'),
        [data]
    )
    const searchRow = useMemo(
        () => (data?.summary ?? []).find((s) => s.segment === 'search') ?? null,
        [data]
    )
    const industryTotal = useMemo(() => {
        // セッション・遷移は職種間で重複しうる（同一セッションが複数職種を閲覧）ため単純合算＝概算
        return industryRows.reduce(
            (acc, r) => ({ pv: acc.pv + r.pv, sessions: acc.sessions + r.sessions, toDetail: acc.toDetail + r.toDetail }),
            { pv: 0, sessions: 0, toDetail: 0 }
        )
    }, [industryRows])

    const trendChart = useMemo(() => {
        if (!data?.daily?.length) return null
        const dates = [...new Set(data.daily.map((d) => d.date))].sort()
        const bySegment = (seg: string) => {
            const map = new Map(data.daily.filter((d) => d.segment === seg).map((d) => [d.date, d]))
            return dates.map((dt) => {
                const row = map.get(dt)
                if (!row) return null
                if (metric === 'rate') return row.sessions > 0 ? Number(((row.toDetail / row.sessions) * 100).toFixed(1)) : null
                return metric === 'pv' ? row.pv : row.sessions
            })
        }
        return {
            labels: dates.map(fmtDateLabel),
            series: [
                { name: '職種一覧計', color: SERIES_COLORS[0], data: bySegment('industry_list') },
                { name: '検索結果（/search）', color: SERIES_COLORS[1], data: bySegment('search') },
            ],
        }
    }, [data, metric])

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>求人一覧パフォーマンス</h1>
                    <p className={styles.subtitle}>
                        職種一覧（/driver 等14職種・絞り込み含む）と検索結果（/search）のPV・閲覧セッションと、
                        閲覧後に求人詳細（media_）へ遷移したセッション割合を比較します。
                    </p>
                </div>
                <BackLink href="/">ダッシュボード</BackLink>
            </div>

            <RelatedPages pages={[{ href: '/funnel/path', label: '経路ファネルビルダー' }, { href: '/pageflow', label: 'ページフロー分析' }, { href: '/cv-types', label: '求人種別CV分析' }]} />

            <div className={styles.controls}>
                <PeriodSelect
                    state={periodState}
                    options={PERIOD_OPTIONS}
                    selectClassName={styles.select}
                    noteClassName={styles.periodNote}
                    resolved={data}
                />
                {data?.clamped && <span className={styles.periodNote}>※ BQエクスポート開始日（2026-08-07）以降にクランプ</span>}
            </div>

            {loading && <p className={styles.loading}>BigQueryでセッション集計中...</p>}
            {error && <div className={styles.error}>{error}</div>}

            {data && !loading && (
                <>
                    <div className={styles.summaryRow}>
                        <div className={styles.summaryCard} style={{ borderTopColor: SERIES_COLORS[0] }}>
                            <span className={styles.summaryLabel}>職種一覧計 詳細遷移率</span>
                            <span className={styles.summaryValue}>{pct(industryTotal.toDetail, industryTotal.sessions)}</span>
                            <span className={styles.summaryHint}>{industryTotal.toDetail.toLocaleString()} / {industryTotal.sessions.toLocaleString()}セッション ／ PV {industryTotal.pv.toLocaleString()}</span>
                        </div>
                        <div className={styles.summaryCard} style={{ borderTopColor: SERIES_COLORS[1] }}>
                            <span className={styles.summaryLabel}>検索結果（/search）詳細遷移率</span>
                            <span className={styles.summaryValue}>{searchRow ? pct(searchRow.toDetail, searchRow.sessions) : '－'}</span>
                            <span className={styles.summaryHint}>
                                {searchRow ? `${searchRow.toDetail.toLocaleString()} / ${searchRow.sessions.toLocaleString()}セッション ／ PV ${searchRow.pv.toLocaleString()}` : 'データなし'}
                            </span>
                        </div>
                    </div>

                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <h2 className={styles.sectionTitle}>推移（職種一覧計 vs 検索結果）</h2>
                            <select className={styles.select} value={metric} onChange={(e) => setMetric(e.target.value as TrendMetric)}>
                                {TREND_METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>
                        {trendChart && <SignupTrendChart labels={trendChart.labels} series={trendChart.series} percent={metric === 'rate'} />}
                    </div>

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>職種別内訳</h2>
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>一覧の種類</th>
                                        <th className={styles.num}>PV</th>
                                        <th className={styles.num}>閲覧セッション</th>
                                        <th className={styles.num}>詳細へ遷移</th>
                                        <th className={styles.num}>遷移率</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {industryRows.map((r) => (
                                        <tr key={r.segment}>
                                            <td>{INDUSTRY_LABELS[r.segment] ?? r.segment}（/{r.segment}）</td>
                                            <td className={styles.num}>{r.pv.toLocaleString()}</td>
                                            <td className={styles.num}>{r.sessions.toLocaleString()}</td>
                                            <td className={styles.num}>{r.toDetail.toLocaleString()}</td>
                                            <td className={styles.num}>{pct(r.toDetail, r.sessions)}</td>
                                        </tr>
                                    ))}
                                    <tr className={styles.totalRow}>
                                        <td>職種一覧計</td>
                                        <td className={styles.num}>{industryTotal.pv.toLocaleString()}</td>
                                        <td className={styles.num}>{industryTotal.sessions.toLocaleString()}</td>
                                        <td className={styles.num}>{industryTotal.toDetail.toLocaleString()}</td>
                                        <td className={styles.num}>{pct(industryTotal.toDetail, industryTotal.sessions)}</td>
                                    </tr>
                                    {searchRow && (
                                        <tr className={styles.searchRow}>
                                            <td>{INDUSTRY_LABELS.search}</td>
                                            <td className={styles.num}>{searchRow.pv.toLocaleString()}</td>
                                            <td className={styles.num}>{searchRow.sessions.toLocaleString()}</td>
                                            <td className={styles.num}>{searchRow.toDetail.toLocaleString()}</td>
                                            <td className={styles.num}>{pct(searchRow.toDetail, searchRow.sessions)}</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <p className={styles.note}>
                        ※ 遷移率: 一覧を閲覧したセッションのうち、その後同一セッション内で求人詳細（/xxx/media_）を閲覧した割合（BigQueryのGA4生イベントをセッション単位で集計）。<br />
                        ※ 職種一覧は /職種スラッグ とその絞り込み下層（media_を除く）。同一セッションが複数職種や/searchを閲覧した場合は各行に重複カウントされるため、職種一覧計は概算です。<br />
                        ※ BQエクスポートは2026-08-07開始のため、それ以前は集計できません。表示のたびにBigQueryをスキャンします（今回: {(data.scannedBytes / 1024 ** 3).toFixed(2)}GB ≈ {(data.scannedBytes / 1024 ** 3 * 0.92).toFixed(1)}円）。
                    </p>
                </>
            )}
        </div>
    )
}
