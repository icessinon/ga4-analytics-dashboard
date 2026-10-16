'use client'

import { useMemo, useState } from 'react'
import { useProduct } from '@/contexts/ProductContext'
import PageShell from '@/components/PageShell'
import PeriodSelect from '@/components/PeriodSelect'
import LoadState from '@/components/LoadState'
import { ui, cx } from '@/components/ui'
import { DailyCountChart, RateTrendChart, type RatePoint } from '@/components/trend/TimelineTrendCharts'
import { usePeriodRange } from '@/hooks/usePeriodRange'
import { useReport } from '@/hooks/useReport'
import { CHART_COLORS } from '@/lib/constants/chartColors'
import { type PeriodOption } from '@/lib/utils/period'
import type { ApplyFunnelResponse, ApplyTrendResponse } from '@/lib/services/apply/applyTrendTypes'
import styles from './ApplyTrendPage.module.css'

const PERIOD_OPTIONS: PeriodOption[] = [
    { value: '30daysAgo', label: '過去30日' },
    { value: '90daysAgo', label: '過去90日' },
    { value: '180daysAgo', label: '過去180日' },
    { value: '365daysAgo', label: '過去1年' },
]

const KIND_LABEL: Record<string, string> = { ab: 'ABテスト', release: 'リリース', measurement: '計測変更' }

const rate = (n: number, d: number) => (d > 0 ? (n / d) * 100 : null)
const fmtRate = (v: number | null) => (v == null ? '－' : `${v.toFixed(1)}%`)

export default function ApplyTrendPage() {
    const { currentProduct } = useProduct()
    const periodState = usePeriodRange('180daysAgo')
    const { range } = periodState
    const [grain, setGrain] = useState<'weekly' | 'monthly'>('weekly')

    const report = useReport<ApplyTrendResponse>('/api/apply-trend', {
        body: { propertyId: currentProduct?.ga4PropertyId, startDate: range?.startDate, endDate: range?.endDate },
        enabled: !!currentProduct && !!range,
        keepPreviousData: true,
    })
    const data = report.data

    // BigQuery のセッション解析は重いので手動実行（ボタンを押したときだけ走る）
    const funnel = useReport<ApplyFunnelResponse>('/api/apply-trend/funnel', {
        body: { propertyId: currentProduct?.ga4PropertyId, startDate: range?.startDate, endDate: range?.endDate },
        enabled: !!currentProduct && !!range,
        manual: true,
    })
    const fd = funnel.data

    const compare = useMemo(() => {
        if (!data || data.monthly.length < 2) return null
        const first = data.monthly[0]
        const last = data.monthly[data.monthly.length - 1]
        return {
            first, last,
            perDayPct: first.perDay > 0 ? ((last.perDay - first.perDay) / first.perDay) * 100 : null,
        }
    }, [data])

    const ratePoints: RatePoint[] = useMemo(() => {
        if (!fd) return []
        return fd.weekly.map((b) => ({
            label: b.label, start: b.start, end: b.end, partial: b.partial,
            values: {
                toDetail: rate(b.toDetail, b.sessions),
                toForm: rate(b.toForm, b.sessions),
                toDone: rate(b.toDone, b.sessions),
            },
            tooltip: [
                ['一覧を見たセッション', `${b.sessions.toLocaleString()}`],
                ['→ 求人詳細', `${b.toDetail.toLocaleString()}（${fmtRate(rate(b.toDetail, b.sessions))}）`],
                ['→ 応募フォーム', `${b.toForm.toLocaleString()}（${fmtRate(rate(b.toForm, b.sessions))}）`],
                ['→ 応募完了', `${b.toDone.toLocaleString()}（${fmtRate(rate(b.toDone, b.sessions))}）`],
            ] as Array<[string, string]>,
        }))
    }, [fd])

    const showBuckets = data ? (grain === 'weekly' ? data.weekly : data.monthly) : []

    return (
        <PageShell
            pageId="applyTrend"
            requireProduct
            status={{ loading: report.loading, error: report.error, source: 'bq', onRetry: report.run }}
            keepChildrenWhileLoading
            controls={<PeriodSelect state={periodState} options={PERIOD_OPTIONS} resolved={data} />}
        >
            {data && (
                <>
                    <div className={ui.summaryRow}>
                        <div className={ui.summaryCard}>
                            <span className={ui.summaryLabel}>会員応募（期間計）</span>
                            <span className={ui.summaryValue}>{data.total.total.toLocaleString()}</span>
                            <span className={ui.summaryHint}>
                                {data.total.perDay.toFixed(1)}件/日
                                {compare && <>　{compare.first.label}→{compare.last.label} {compare.perDayPct != null && (
                                    <span className={compare.perDayPct >= 0 ? styles.deltaUp : styles.deltaDown}>
                                        {compare.perDayPct > 0 ? '＋' : ''}{compare.perDayPct.toFixed(1)}%
                                    </span>
                                )}</>}
                            </span>
                        </div>
                        <div className={ui.summaryCard}>
                            <span className={ui.summaryLabel}>求人広告（JobA）</span>
                            <span className={ui.summaryValue}>{data.total.jobAd.toLocaleString()}</span>
                            <span className={ui.summaryHint}>全体の {fmtRate(rate(data.total.jobAd, data.total.total))}</span>
                        </div>
                        <div className={ui.summaryCard}>
                            <span className={ui.summaryLabel}>人材紹介（JobR）</span>
                            <span className={ui.summaryValue}>{data.total.agent.toLocaleString()}</span>
                            <span className={ui.summaryHint}>
                                全体の {fmtRate(rate(data.total.agent, data.total.total))}／別枠のゲスト応募 {data.total.guest.toLocaleString()}件
                            </span>
                        </div>
                        <div className={ui.summaryCard}>
                            <span className={ui.summaryLabel}>ハローワーク（JobH）</span>
                            <span className={ui.summaryValue}>{data.total.hw.toLocaleString()}</span>
                            <span className={ui.summaryHint}>全体の {fmtRate(rate(data.total.hw, data.total.total))}</span>
                        </div>
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>日次の応募数</h2>
                        <p className={ui.note}>
                            細線が日次、太線が7日移動平均。縦線は下の「できごと」と番号で対応します。
                            出典はプロダクトDB（<code>job_applications</code>）で、契約種別は求人マスタの <code>contract_type</code>。事業KPIページと同じ取り口です。
                            <strong>ゲスト応募（人材紹介LP経由・会員を介さない）は合計に入れていません</strong>。桁が違い（2026-09 実測で会員応募522件に対しゲスト2,978件）、
                            事業KPIの応募数も会員応募だけを数えているためです。内訳テーブルに別列で出しています。
                        </p>
                        <DailyCountChart
                            points={data.daily.map((d) => ({
                                date: d.date, value: d.total,
                                tooltip: [
                                    ['会員応募', `${d.total}件`],
                                    ['求人広告', `${d.jobAd}件`],
                                    ['人材紹介', `${d.agent}件`],
                                    ['ハローワーク', `${d.hw}件`],
                                ] as Array<[string, string]>,
                            }))}
                            events={data.events} unit="件/日"
                        />
                    </div>

                    <div className={ui.card}>
                        <div className={styles.cardHead}>
                            <h2 className={ui.sectionTitle}>求人一覧 → 求人詳細 → 応募の遷移率</h2>
                            <button type="button" className={styles.runButton} onClick={funnel.run} disabled={funnel.loading}>
                                {funnel.loading ? '集計中…' : fd ? '再集計する' : 'BigQueryで集計する'}
                            </button>
                        </div>
                        <p className={ui.note}>
                            <strong>到達ユーザー数の比では応募ファネルになりません。</strong>求人詳細は検索エンジンからの直接流入が主で、
                            期間ユニークでは一覧より詳細のほうが多くなるためです（2026-09-15〜10-15 実測で一覧48,596人 / 詳細82,164人）。
                            ここでは「<strong>求人一覧を見たセッションが、その後どこまで進んだか</strong>」をセッション単位で数えています。
                            BigQuery の生イベントを読むので<strong>1回あたり約4円（70日）かかり、押したときだけ走ります</strong>。
                            BigQuery のエクスポートは 2026-08-07 からで、1回に読めるのは最大70日です。
                        </p>
                        <LoadState variant="inline" loading={funnel.loading} error={funnel.error} source="bq" onRetry={funnel.run}>
                            {fd && (
                                <>
                                    <div className={ui.summaryRow}>
                                        <div className={ui.summaryCard}>
                                            <span className={ui.summaryLabel}>一覧を見たセッション</span>
                                            <span className={ui.summaryValue}>{fd.total.sessions.toLocaleString()}</span>
                                            <span className={ui.summaryHint}>{fd.startDate} 〜 {fd.endDate}{fd.clamped && '（期間を切り詰め）'}</span>
                                        </div>
                                        <div className={ui.summaryCard}>
                                            <span className={ui.summaryLabel}>→ 求人詳細</span>
                                            <span className={ui.summaryValue}>{fmtRate(rate(fd.total.toDetail, fd.total.sessions))}</span>
                                            <span className={ui.summaryHint}>{fd.total.toDetail.toLocaleString()} セッション</span>
                                        </div>
                                        <div className={ui.summaryCard}>
                                            <span className={ui.summaryLabel}>→ 応募フォーム</span>
                                            <span className={ui.summaryValue}>{fmtRate(rate(fd.total.toForm, fd.total.sessions))}</span>
                                            <span className={ui.summaryHint}>
                                                詳細からは {fmtRate(rate(fd.total.toForm, fd.total.toDetail))}
                                            </span>
                                        </div>
                                        <div className={ui.summaryCard}>
                                            <span className={ui.summaryLabel}>→ 応募完了</span>
                                            <span className={ui.summaryValue}>{fmtRate(rate(fd.total.toDone, fd.total.sessions))}</span>
                                            <span className={ui.summaryHint}>
                                                フォームからは {fmtRate(rate(fd.total.toDone, fd.total.toForm))}／
                                                スキャン {(fd.scannedBytes / 1024 ** 3).toFixed(2)}GB（約{(fd.scannedBytes / 1024 ** 4 * 6.25 * 155).toFixed(1)}円）
                                            </span>
                                        </div>
                                    </div>
                                    <RateTrendChart
                                        points={ratePoints} events={data.events}
                                        series={[
                                            { key: 'toDetail', name: '→ 求人詳細', color: CHART_COLORS.blue },
                                            { key: 'toForm', name: '→ 応募フォーム', color: CHART_COLORS.amber },
                                            { key: 'toDone', name: '→ 応募完了', color: CHART_COLORS.green },
                                        ]}
                                    />
                                </>
                            )}
                        </LoadState>
                    </div>

                    <div className={ui.card}>
                        <div className={styles.cardHead}>
                            <h2 className={ui.sectionTitle}>{grain === 'weekly' ? '週次' : '月次'}の内訳</h2>
                            <div className={ui.controls}>
                                {(['weekly', 'monthly'] as const).map((g) => (
                                    <button key={g} type="button"
                                        className={cx(styles.tab, grain === g && styles.tabActive)}
                                        onClick={() => setGrain(g)}>
                                        {g === 'weekly' ? '週次' : '月次'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className={ui.tableWrap}>
                            <table className={ui.dataTable}>
                                <thead>
                                    <tr>
                                        <th>{grain === 'weekly' ? '週（月曜始まり）' : '月'}</th>
                                        <th className={ui.num}>会員応募</th>
                                        <th className={ui.num}>件/日</th>
                                        <th className={ui.num}>求人広告</th>
                                        <th className={ui.num}>人材紹介</th>
                                        <th className={ui.num}>ハローワーク</th>
                                        <th className={ui.num}>ゲスト応募（別枠）</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {showBuckets.map((b) => (
                                        <tr key={b.start}>
                                            <td>{b.label}{b.partial && <span className={styles.partialTag}>一部の日</span>}</td>
                                            <td className={cx(ui.num, ui.strong)}>{b.total.toLocaleString()}</td>
                                            <td className={ui.num}>{b.perDay.toFixed(1)}</td>
                                            <td className={ui.num}>{b.jobAd.toLocaleString()}</td>
                                            <td className={ui.num}>{b.agent.toLocaleString()}</td>
                                            <td className={ui.num}>{b.hw.toLocaleString()}</td>
                                            <td className={ui.num}>{b.guest.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>応募に効くできごと</h2>
                        <p className={ui.note}>
                            <strong>対象面を「応募｜求人一覧」「応募｜求人詳細」「応募フォーム」にして登録したABテストは自動でここに増えます</strong>（「自動」バッジ）。
                            リリース・恒久化・計測変更と、それ以外の面だが応募に効くものは
                            <code>lib/constants/applyTimeline.ts</code> に1行足してください。
                        </p>
                        <div className={ui.tableWrap}>
                            <table className={ui.dataTable}>
                                <thead>
                                    <tr><th>日</th><th>種別</th><th>できごと</th><th>内容・結果</th></tr>
                                </thead>
                                <tbody>
                                    {data.events.map((e, i) => (
                                        <tr key={e.date + e.title}>
                                            <td className={styles.whenCell}>
                                                <span className={styles.no}>{i + 1}</span>
                                                {e.date.slice(5).replace('-', '/')}
                                                {e.endDate && <span className={styles.until}>〜{e.endDate.slice(5).replace('-', '/')}</span>}
                                            </td>
                                            <td>
                                                <span className={cx(styles.kind, styles[e.kind])}>{KIND_LABEL[e.kind]}</span>
                                                {e.source === 'ab-test' && <span className={cx(styles.kind, styles.auto)}>自動</span>}
                                            </td>
                                            <td className={ui.strong}>
                                                {e.abTestId != null
                                                    ? <a className={styles.eventLink} href={`/ab-test/${e.abTestId}`}>{e.title}</a>
                                                    : e.title}
                                            </td>
                                            <td className={styles.detail}>{e.detail}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </PageShell>
    )
}
