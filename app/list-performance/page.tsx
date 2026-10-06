'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import SignupTrendChart from '@/components/signup-funnel/SignupTrendChart'
import PageShell from '@/components/PageShell'
import PeriodSelect from '@/components/PeriodSelect'
import Alert from '@/components/Alert'
import { ui } from '@/components/ui'
import { usePeriodRange } from '@/hooks/usePeriodRange'
import { useReport } from '@/hooks/useReport'
import { type PeriodOption } from '@/lib/utils/period'
import { CHART_COLORS } from '@/lib/constants/chartColors'
import type { ListPerformanceResponse } from '@/lib/services/listPerformance/listPerformanceTypes'
import styles from './ListPerformancePage.module.css'

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
]

// 系列色は固定順（職種一覧計 = 青、検索結果 = 琥珀）
const SERIES_COLORS = [CHART_COLORS.blue, CHART_COLORS.amber]
const ACCENT_LIST = { '--summary-accent': SERIES_COLORS[0] } as CSSProperties
const ACCENT_SEARCH = { '--summary-accent': SERIES_COLORS[1] } as CSSProperties

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
    const [metric, setMetric] = useState<TrendMetric>('rate')

    // データソースは x-work.jp の BQ エクスポート固定なので propertyId は送らない
    const report = useReport<ListPerformanceResponse>('/api/list-performance', {
        body: { startDate: range?.startDate, endDate: range?.endDate },
        enabled: !!range,
    })
    const data = report.data

    // サマリー: 職種別（セッション降順）+ 職種計 + search
    const industryRows = useMemo(() => (data?.summary ?? []).filter((s) => s.segment !== 'search'), [data])
    const searchRow = useMemo(() => (data?.summary ?? []).find((s) => s.segment === 'search') ?? null, [data])
    // セッション・遷移は職種間で重複しうる（同一セッションが複数職種を閲覧）ため単純合算＝概算
    const industryTotal = useMemo(
        () => industryRows.reduce(
            (acc, r) => ({ pv: acc.pv + r.pv, sessions: acc.sessions + r.sessions, toDetail: acc.toDetail + r.toDetail }),
            { pv: 0, sessions: 0, toDetail: 0 },
        ),
        [industryRows],
    )

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
        <PageShell
            pageId="listPerformance"
            status={{ loading: report.loading, error: report.error, source: 'bq', onRetry: report.run }}
            controls={<PeriodSelect state={periodState} options={PERIOD_OPTIONS} resolved={data} />}
        >
            {data?.clamped && (
                <Alert tone="warn">BQエクスポートの開始日より前は集計できないため、期間の先頭を {data.startDate} に丸めています。</Alert>
            )}

            {data && (
                <>
                    <div className={ui.summaryRow}>
                        <div className={ui.summaryCard} style={ACCENT_LIST}>
                            <span className={ui.summaryLabel}>職種一覧計 詳細遷移率</span>
                            <span className={ui.summaryValue}>{pct(industryTotal.toDetail, industryTotal.sessions)}</span>
                            <span className={ui.summaryHint}>{industryTotal.toDetail.toLocaleString()} / {industryTotal.sessions.toLocaleString()}セッション ／ PV {industryTotal.pv.toLocaleString()}</span>
                        </div>
                        <div className={ui.summaryCard} style={ACCENT_SEARCH}>
                            <span className={ui.summaryLabel}>検索結果（/search）詳細遷移率</span>
                            <span className={ui.summaryValue}>{searchRow ? pct(searchRow.toDetail, searchRow.sessions) : '－'}</span>
                            <span className={ui.summaryHint}>
                                {searchRow ? `${searchRow.toDetail.toLocaleString()} / ${searchRow.sessions.toLocaleString()}セッション ／ PV ${searchRow.pv.toLocaleString()}` : 'データなし'}
                            </span>
                        </div>
                    </div>

                    <div className={ui.card}>
                        <div className={styles.cardHeader}>
                            <h2 className={ui.sectionTitle}>推移（職種一覧計 vs 検索結果）</h2>
                            <select className={ui.select} value={metric} onChange={(e) => setMetric(e.target.value as TrendMetric)} aria-label="指標">
                                {TREND_METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>
                        {trendChart && <SignupTrendChart labels={trendChart.labels} series={trendChart.series} percent={metric === 'rate'} />}
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>職種別内訳</h2>
                        <div className={ui.tableWrap}>
                            <table className={ui.dataTable}>
                                <thead>
                                    <tr>
                                        <th>一覧の種類</th>
                                        <th className={ui.num}>PV</th>
                                        <th className={ui.num}>閲覧セッション</th>
                                        <th className={ui.num}>詳細へ遷移</th>
                                        <th className={ui.num}>遷移率</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {industryRows.map((r) => (
                                        <tr key={r.segment}>
                                            <td>{INDUSTRY_LABELS[r.segment] ?? r.segment}（/{r.segment}）</td>
                                            <td className={ui.num}>{r.pv.toLocaleString()}</td>
                                            <td className={ui.num}>{r.sessions.toLocaleString()}</td>
                                            <td className={ui.num}>{r.toDetail.toLocaleString()}</td>
                                            <td className={ui.num}>{pct(r.toDetail, r.sessions)}</td>
                                        </tr>
                                    ))}
                                    <tr className={styles.totalRow}>
                                        <td>職種一覧計</td>
                                        <td className={ui.num}>{industryTotal.pv.toLocaleString()}</td>
                                        <td className={ui.num}>{industryTotal.sessions.toLocaleString()}</td>
                                        <td className={ui.num}>{industryTotal.toDetail.toLocaleString()}</td>
                                        <td className={ui.num}>{pct(industryTotal.toDetail, industryTotal.sessions)}</td>
                                    </tr>
                                    {searchRow && (
                                        <tr className={styles.searchRow}>
                                            <td>{INDUSTRY_LABELS.search}</td>
                                            <td className={ui.num}>{searchRow.pv.toLocaleString()}</td>
                                            <td className={ui.num}>{searchRow.sessions.toLocaleString()}</td>
                                            <td className={ui.num}>{searchRow.toDetail.toLocaleString()}</td>
                                            <td className={ui.num}>{pct(searchRow.toDetail, searchRow.sessions)}</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <p className={ui.tableNote}>
                            ※ 遷移率: 一覧を閲覧したセッションのうち、その後同一セッション内で求人詳細（/xxx/media_）を閲覧した割合（BigQueryのGA4生イベントをセッション単位で集計）。<br />
                            ※ 職種一覧は /職種スラッグ とその絞り込み下層（media_を除く）。同一セッションが複数職種や/searchを閲覧した場合は各行に重複カウントされるため、職種一覧計は概算です。<br />
                            ※ BQエクスポート開始前は集計できません。表示のたびにBigQueryをスキャンします（今回: {(data.scannedBytes / 1024 ** 3).toFixed(2)}GB ≈ {(data.scannedBytes / 1024 ** 3 * 0.92).toFixed(1)}円）。
                        </p>
                    </div>
                </>
            )}
        </PageShell>
    )
}
