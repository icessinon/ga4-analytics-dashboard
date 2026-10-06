'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import SignupTrendChart from '@/components/signup-funnel/SignupTrendChart'
import PageShell from '@/components/PageShell'
import PeriodSelect from '@/components/PeriodSelect'
import Alert from '@/components/Alert'
import { ui, cx } from '@/components/ui'
import { usePeriodRange } from '@/hooks/usePeriodRange'
import { useReport } from '@/hooks/useReport'
import { type PeriodOption } from '@/lib/utils/period'
import { CHART_COLORS } from '@/lib/constants/chartColors'
import type { FlowGroup, UserFlowResponse } from '@/lib/services/userFlow/userFlowTypes'
import styles from './UserFlowPage.module.css'

const PERIOD_OPTIONS: PeriodOption[] = [
    { value: '7daysAgo', label: '過去7日' },
    { value: '14daysAgo', label: '過去14日' },
    { value: '28daysAgo', label: '過去28日' },
]

const GROUP_LABELS: Record<FlowGroup['key'], string> = {
    applied: '応募あり',
    signup: '会員登録あり（応募なし）',
    browsed: '非CV（求人閲覧あり）',
    other: '非CV（求人閲覧なし）',
}

const ACTION_LABELS: Record<string, string> = {
    detail: '別の求人詳細を見る',
    exit: '離脱（セッション終了）',
    search: '検索ページへ',
    list: '一覧・絞り込みへ戻る',
    entry_form: '応募フォームへ進む',
    featured: '特集求人（featured）へ',
    signup: '会員登録へ',
    mypage: 'マイページ・お気に入りへ',
    journal: 'コラムへ',
    top: 'トップへ',
    other_page: 'その他のページへ',
}

const DEVICE_LABELS: Record<string, string> = { mobile: 'モバイル', desktop: 'PC', tablet: 'タブレット' }

type TrendMetric = 'entryRate' | 'exitRate' | 'detailPv'
const TREND_METRICS: Array<{ value: TrendMetric; label: string }> = [
    { value: 'entryRate', label: '詳細→フォーム進出率' },
    { value: 'exitRate', label: '詳細→離脱率' },
    { value: 'detailPv', label: '求人詳細PV' },
]

const DIST_BUCKETS = [
    { key: 'd0', label: '0件' },
    { key: 'd1', label: '1件' },
    { key: 'd2_3', label: '2〜3件' },
    { key: 'd4_9', label: '4〜9件' },
    { key: 'd10p', label: '10件以上' },
] as const

const ACCENT = { '--summary-accent': 'var(--violet-400)' } as CSSProperties

export default function UserFlowPage() {
    const periodState = usePeriodRange('7daysAgo')
    const { range } = periodState
    const [byDevice, setByDevice] = useState(false)
    const [trendMetric, setTrendMetric] = useState<TrendMetric>('entryRate')

    // データソースは x-work.jp の BQ エクスポート固定なので propertyId は送らない
    const report = useReport<UserFlowResponse>('/api/user-flow', {
        body: { startDate: range?.startDate, endDate: range?.endDate },
        enabled: !!range,
    })
    const data = report.data

    const trendChart = useMemo(() => {
        if (!data?.daily?.length) return null
        const labels = data.daily.map((d) => `${parseInt(d.date.slice(5, 7), 10)}/${parseInt(d.date.slice(8, 10), 10)}`)
        const values = data.daily.map((d) => {
            if (trendMetric === 'detailPv') return d.detailPv
            if (d.detailPv === 0) return null
            const n = trendMetric === 'entryRate' ? d.toEntry : d.exit
            return Number(((n / d.detailPv) * 100).toFixed(2))
        })
        const label = TREND_METRICS.find((m) => m.value === trendMetric)?.label ?? ''
        return { labels, series: [{ name: label, color: CHART_COLORS.blue, data: values }] }
    }, [data, trendMetric])

    const applied = data?.groups.find((g) => g.key === 'applied') ?? null
    const signup = data?.groups.find((g) => g.key === 'signup') ?? null
    const browsed = data?.groups.find((g) => g.key === 'browsed') ?? null
    const totalNext = data ? data.nextActions.reduce((s, a) => s + a.count, 0) : 0
    const maxNext = data ? Math.max(1, ...data.nextActions.map((a) => a.count)) : 1

    return (
        <PageShell
            pageId="userFlow"
            status={{ loading: report.loading, error: report.error, source: 'bq', onRetry: report.run }}
            controls={
                <>
                    <PeriodSelect state={periodState} options={PERIOD_OPTIONS} resolved={data} />
                    {data && <span className={ui.note}>（BQスキャン {data.scannedMb}MB）</span>}
                </>
            }
        >
            {data?.clamped && (
                <Alert tone="warn">
                    BQエクスポートの開始日より前は集計できないため、期間の先頭を {data.startDate} に丸めています。
                </Alert>
            )}

            {data && (
                <>
                    <div className={ui.summaryRow} style={ACCENT}>
                        <div className={ui.summaryCard}>
                            <span className={ui.summaryLabel}>応募セッション</span>
                            <span className={ui.summaryValue}>{applied ? applied.sessions.toLocaleString() : '－'}</span>
                            <span className={ui.summaryHint}>{applied?.medCvMin != null ? `開始から応募まで中央値 ${applied.medCvMin}分` : '－'}</span>
                        </div>
                        <div className={ui.summaryCard}>
                            <span className={ui.summaryLabel}>会員登録セッション（応募なし）</span>
                            <span className={ui.summaryValue}>{signup ? signup.sessions.toLocaleString() : '－'}</span>
                            <span className={ui.summaryHint}>{signup?.medCvMin != null ? `開始から登録まで中央値 ${signup.medCvMin}分` : '－'}</span>
                        </div>
                        <div className={ui.summaryCard}>
                            <span className={ui.summaryLabel}>応募までの求人詳細閲覧（中央値）</span>
                            <span className={ui.summaryValue}>{applied ? `${applied.medDetails}件` : '－'}</span>
                            <span className={ui.summaryHint}>平均 {applied?.avgDetails ?? '－'}件 / 非CV閲覧者は中央値 {browsed?.medDetails ?? '－'}件</span>
                        </div>
                        <div className={ui.summaryCard}>
                            <span className={ui.summaryLabel}>検索ページ利用率（応募セッション）</span>
                            <span className={ui.summaryValue}>{applied ? `${applied.searchRatePct}%` : '－'}</span>
                            <span className={ui.summaryHint}>非CV（求人閲覧あり）は {browsed?.searchRatePct ?? '－'}%</span>
                        </div>
                    </div>

                    <div className={ui.card}>
                        <div className={styles.cardHeader}>
                            <h2 className={ui.sectionTitle}>グループ別の行動量比較</h2>
                            {(data.deviceGroups?.length ?? 0) > 0 && (
                                <div className={styles.toggleGroup}>
                                    <button type="button" className={byDevice ? styles.toggleBtn : styles.toggleActive} onClick={() => setByDevice(false)}>全体</button>
                                    <button type="button" className={byDevice ? styles.toggleActive : styles.toggleBtn} onClick={() => setByDevice(true)}>デバイス別</button>
                                </div>
                            )}
                        </div>
                        <div className={ui.tableWrap}>
                            <table className={ui.dataTable}>
                                <thead>
                                    <tr>
                                        <th>グループ</th>
                                        <th className={ui.num}>セッション</th>
                                        <th className={ui.num}>求人詳細閲覧（平均）</th>
                                        <th className={ui.num}>同（中央値）</th>
                                        <th className={ui.num}>検索利用率</th>
                                        <th className={ui.num}>滞在時間（中央値）</th>
                                        <th className={ui.num}>CVまで（中央値）</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {((byDevice ? (data.deviceGroups ?? []) : data.groups) as Array<FlowGroup & { device?: string }>).map((g) => (
                                        <tr key={g.device ? `${g.key}-${g.device}` : g.key} className={g.key === 'applied' || g.key === 'signup' ? styles.cvRow : undefined}>
                                            <td>
                                                {GROUP_LABELS[g.key]}
                                                {g.device && <span className={styles.deviceTag}>{DEVICE_LABELS[g.device] ?? g.device}</span>}
                                            </td>
                                            <td className={cx(ui.num, ui.strong)}>{g.sessions.toLocaleString()}</td>
                                            <td className={ui.num}>{g.avgDetails}件</td>
                                            <td className={ui.num}>{g.medDetails}件</td>
                                            <td className={ui.num}>{g.searchRatePct}%</td>
                                            <td className={ui.num}>{g.medDurMin}分</td>
                                            <td className={ui.num}>{g.medCvMin != null ? `${g.medCvMin}分` : '－'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className={ui.tableNote}>
                            ※ 応募 = EF__Job(R|A|H)__Btn クリック（送信ボタンは入力完了まで押せないため実応募と一致）。登録 = /members/signup/thanks 到達。検索利用 = /search・一覧・絞り込み・資格条件ページの閲覧。<br />
                            ※ 「会員登録あり」に応募同時登録（求人広告）は含まれません（応募ありに分類）。
                        </p>
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>求人詳細の閲覧数分布（セッションあたり）</h2>
                        <div className={ui.tableWrap}>
                            <table className={ui.dataTable}>
                                <thead>
                                    <tr>
                                        <th>グループ</th>
                                        {DIST_BUCKETS.map((b) => <th key={b.key} className={ui.num}>{b.label}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.groups.map((g) => {
                                        const total = DIST_BUCKETS.reduce((s, b) => s + g.dist[b.key], 0)
                                        return (
                                            <tr key={g.key} className={g.key === 'applied' || g.key === 'signup' ? styles.cvRow : undefined}>
                                                <td>{GROUP_LABELS[g.key]}</td>
                                                {DIST_BUCKETS.map((b) => (
                                                    <td key={b.key} className={ui.num}>
                                                        {g.dist[b.key].toLocaleString()}
                                                        <span className={styles.distPct}>{total > 0 ? `${((g.dist[b.key] / total) * 100).toFixed(0)}%` : ''}</span>
                                                    </td>
                                                ))}
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <p className={ui.tableNote}>
                            ※ 応募ありで「0件」= 一覧モーダルやfeatured・LP等、求人詳細ページを経由しない応募導線。ここが多い場合は詳細ページ以外の導線が効いています。
                        </p>
                    </div>

                    {trendChart && (
                        <div className={ui.card}>
                            <div className={styles.cardHeader}>
                                <h2 className={ui.sectionTitle}>日次推移</h2>
                                <select className={ui.select} value={trendMetric} onChange={(e) => setTrendMetric(e.target.value as TrendMetric)} aria-label="指標">
                                    {TREND_METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </select>
                            </div>
                            <SignupTrendChart labels={trendChart.labels} series={trendChart.series} percent={trendMetric !== 'detailPv'} />
                            <p className={ui.tableNote}>
                                ※ 詳細→フォーム進出率 = その日の求人詳細PVのうち直後に /entry/ へ進んだ割合。FV改善・CTA施策の主要KPI。母数が小さい日は振れます。
                            </p>
                        </div>
                    )}

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>求人詳細を見た「次のアクション」</h2>
                        <div className={ui.tableWrap}>
                            <table className={ui.dataTable}>
                                <thead>
                                    <tr>
                                        <th>次のアクション</th>
                                        <th className={ui.num}>回数</th>
                                        <th className={ui.num}>割合</th>
                                        <th style={{ width: '40%' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.nextActions.map((a) => (
                                        <tr key={a.action}>
                                            <td>{ACTION_LABELS[a.action] ?? a.action}</td>
                                            <td className={cx(ui.num, ui.strong)}>{a.count.toLocaleString()}</td>
                                            <td className={ui.num}>{totalNext > 0 ? `${((a.count / totalNext) * 100).toFixed(1)}%` : '－'}</td>
                                            <td><span className={styles.bar} style={{ width: `${(a.count / maxNext) * 100}%` }} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className={ui.tableNote}>
                            ※ 求人詳細のpage_view直後の次ページ（同一セッション内）。「離脱」はそのpage_viewがセッション最後だったもの。<br />
                            ※ 応募フォーム = /entry/media_(id)。詳細→フォーム進出率が施策（FV改善・5件ごとCTA等）の主要KPIになります。
                        </p>
                    </div>
                </>
            )}
        </PageShell>
    )
}
