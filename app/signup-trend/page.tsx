'use client'

import { useMemo, useState } from 'react'
import { useProduct } from '@/contexts/ProductContext'
import PageShell from '@/components/PageShell'
import PeriodSelect from '@/components/PeriodSelect'
import { ui, cx } from '@/components/ui'
import { DailyCountChart, RateTrendChart, type RatePoint } from '@/components/trend/TimelineTrendCharts'
import { usePeriodRange } from '@/hooks/usePeriodRange'
import { useReport } from '@/hooks/useReport'
import { type PeriodOption } from '@/lib/utils/period'
import { CHART_COLORS } from '@/lib/constants/chartColors'
import type { SignupTrendBucket, SignupTrendResponse } from '@/lib/services/signup/signupTrendTypes'
import styles from './SignupTrendPage.module.css'

const PERIOD_OPTIONS: PeriodOption[] = [
    { value: '30daysAgo', label: '過去30日' },
    { value: '90daysAgo', label: '過去90日' },
    { value: '180daysAgo', label: '過去180日' },
    { value: '365daysAgo', label: '過去1年' },
]

const KIND_LABEL: Record<string, string> = { ab: 'ABテスト', release: 'リリース', measurement: '計測変更' }

function pct(v: number | null): string {
    return v == null ? '－' : `${(v * 100).toFixed(1)}%`
}

/** 2つの率の差（pt）。どちらか欠けていれば null */
function ptDiff(a: number | null, b: number | null): number | null {
    return a == null || b == null ? null : (a - b) * 100
}

function Delta({ value, unit = '%' }: { value: number | null; unit?: string }) {
    if (value == null) return <span className={styles.deltaFlat}>－</span>
    const cls = value > 0 ? styles.deltaUp : value < 0 ? styles.deltaDown : styles.deltaFlat
    return <span className={cls}>{value > 0 ? '＋' : ''}{value.toFixed(1)}{unit}</span>
}

export default function SignupTrendPage() {
    const { currentProduct } = useProduct()
    const periodState = usePeriodRange('180daysAgo')
    const { range } = periodState
    const [grain, setGrain] = useState<'weekly' | 'monthly'>('weekly')

    const report = useReport<SignupTrendResponse>('/api/signup-trend', {
        body: { propertyId: currentProduct?.ga4PropertyId, startDate: range?.startDate, endDate: range?.endDate },
        enabled: !!currentProduct && !!range,
        keepPreviousData: true,
    })
    const data = report.data

    // 最初と最後の暦月を比べる。GA4 のページ計測は 2026-05 からしか無いので、
    // 率・到達の比較は「到達が取れている最初の月」を基準にする（0 の月と比べない）
    const compare = useMemo(() => {
        if (!data || data.monthly.length < 2) return null
        const first = data.monthly.find((m) => m.formUsers > 0) ?? data.monthly[0]
        const last = data.monthly[data.monthly.length - 1]
        if (first === last) return null
        return {
            first, last,
            ratePt: ptDiff(last.rate, first.rate),
            perDayPct: first.perDay > 0 ? ((last.perDay - first.perDay) / first.perDay) * 100 : null,
            reachPerDay: (b: SignupTrendBucket) => {
                const days = Math.round((Date.parse(`${b.end}T00:00:00Z`) - Date.parse(`${b.start}T00:00:00Z`)) / 86400000) + 1
                return days > 0 ? b.formUsers / days : 0
            },
        }
    }, [data])

    const ratePoints: RatePoint[] = (data ? (grain === 'weekly' ? data.weekly : data.monthly) : []).map((b) => ({
        label: b.label, start: b.start, end: b.end, partial: b.partial,
        values: { rate: b.rate != null ? Math.round(b.rate * 1000) / 10 : null },
        tooltip: [
            ['会員登録率', b.rate != null ? `${(b.rate * 100).toFixed(1)}%` : '－'],
            ['フォーム到達', `${b.formUsers.toLocaleString()}人`],
            ['完了（GA4）', `${b.completedUsers.toLocaleString()}人`],
            ['会員登録数（DB）', `${b.reg.toLocaleString()}件`],
        ] as Array<[string, string]>,
    }))
    const latest = data && data.monthly.length > 0 ? data.monthly[data.monthly.length - 1] : null

    return (
        <PageShell
            pageId="signupTrend"
            requireProduct
            status={{ loading: report.loading, error: report.error, source: 'bq', onRetry: report.run }}
            keepChildrenWhileLoading
            controls={<PeriodSelect state={periodState} options={PERIOD_OPTIONS} resolved={data} />}
        >
            {data && (
                <>
                    <div className={ui.summaryRow}>
                        <div className={ui.summaryCard}>
                            <span className={ui.summaryLabel}>会員登録数（期間計）</span>
                            <span className={ui.summaryValue}>{data.total.reg.toLocaleString()}</span>
                            <span className={ui.summaryHint}>
                                {data.total.perDay.toFixed(1)}件/日
                                {compare && <>　{compare.first.label}→{compare.last.label} <Delta value={compare.perDayPct} /></>}
                            </span>
                        </div>
                        <div className={ui.summaryCard}>
                            <span className={ui.summaryLabel}>会員登録率（期間計）</span>
                            <span className={ui.summaryValue}>{pct(data.total.rate)}</span>
                            <span className={ui.summaryHint}>
                                フォーム到達 {data.total.formUsers.toLocaleString()}人 → 完了 {data.total.completedUsers.toLocaleString()}人
                                {compare && <>　{compare.first.label}→{compare.last.label} <Delta value={compare.ratePt} unit="pt" /></>}
                            </span>
                        </div>
                        <div className={ui.summaryCard}>
                            <span className={ui.summaryLabel}>フォーム到達</span>
                            <span className={ui.summaryValue}>{compare ? compare.reachPerDay(compare.last).toFixed(0) : '－'}</span>
                            <span className={ui.summaryHint}>
                                {compare && <>人/日（{compare.last.label}）　{compare.first.label}は {compare.reachPerDay(compare.first).toFixed(0)}人/日</>}
                            </span>
                        </div>
                        <div className={ui.summaryCard}>
                            <span className={ui.summaryLabel}>フェーズ1で止まっている{latest && `（${latest.label}）`}</span>
                            <span className={ui.summaryValue}>{(latest ?? data.total).phase2Unsaved.toLocaleString()}</span>
                            <span className={ui.summaryHint}>
                                会員にはなったがプロフィール未完了。単独登録 {(latest ?? data.total).plain.toLocaleString()}件の
                                {(latest ?? data.total).plain > 0
                                    ? (((latest ?? data.total).phase2Unsaved / (latest ?? data.total).plain) * 100).toFixed(1)
                                    : '0'}%。2段階フォーム（10/6〜）で生じる層です
                            </span>
                        </div>
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>日次の会員登録数</h2>
                        <p className={ui.note}>
                            細線が日次、太線が7日移動平均。縦線は下の「できごと」と番号で対応します。
                            会員登録数の出典はプロダクトDB（<code>xmile-drm.xwork.member_users</code>）で、事業KPIページと同じ定義です。
                        </p>
                        <DailyCountChart
                            points={data.daily.map((d) => ({
                                date: d.date, value: d.reg,
                                tooltip: [['会員登録', `${d.reg}件`], ['うち単独', `${d.plain}件`]] as Array<[string, string]>,
                            }))}
                            events={data.events} unit="件/日"
                        />
                    </div>

                    <div className={ui.card}>
                        <div className={styles.cardHead}>
                            <h2 className={ui.sectionTitle}>会員登録率の推移</h2>
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
                        <p className={ui.note}>
                            フォームに来た人のうち登録を完了した割合。分母・分子とも GA4 のページ別ユーザー数で揃えています
                            （<code>/members/signup</code> → <code>/members/signup/thanks</code>）。
                            ユーザー数は期間ユニークなので、週・月それぞれで数え直しています。
                        </p>
                        <RateTrendChart points={ratePoints} events={data.events}
                            series={[{ key: 'rate', name: '会員登録率', color: CHART_COLORS.green }]} />
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>月次のまとめ</h2>
                        <div className={ui.tableWrap}>
                            <table className={ui.dataTable}>
                                <thead>
                                    <tr>
                                        <th>月</th>
                                        <th className={ui.num}>会員登録数</th>
                                        <th className={ui.num}>件/日</th>
                                        <th className={ui.num}>単独</th>
                                        <th className={ui.num}>応募と同時</th>
                                        <th className={ui.num}>フォーム到達</th>
                                        <th className={ui.num}>完了（GA4）</th>
                                        <th className={ui.num}>登録率</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.monthly.map((m) => (
                                        <tr key={m.start}>
                                            <td>{m.label}{m.partial && <span className={styles.partialTag}>一部の日</span>}</td>
                                            <td className={cx(ui.num, ui.strong)}>{m.reg.toLocaleString()}</td>
                                            <td className={ui.num}>{m.perDay.toFixed(1)}</td>
                                            <td className={ui.num}>{m.plain.toLocaleString()}</td>
                                            <td className={ui.num}>{m.apply.toLocaleString()}</td>
                                            <td className={ui.num}>{m.formUsers > 0 ? m.formUsers.toLocaleString() : '－'}</td>
                                            <td className={ui.num}>{m.formUsers > 0 ? m.completedUsers.toLocaleString() : '－'}</td>
                                            <td className={cx(ui.num, ui.strong)}>
                                                {m.formUsers > 0 ? pct(m.rate) : <span className={styles.partialTag}>GA4計測なし</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className={ui.tableNote}>
                            会員登録数はプロダクトDB、フォーム到達・完了・登録率は GA4。両者は毎月1〜5%ずれます（GA4は計測の取りこぼし）。
                            数の正はプロダクトDB、率の推移は GA4 で見てください。
                            <strong>GA4 のページ計測は 2026-05 から</strong>で、それ以前の月は率を出せません（会員登録数は出ます）。
                            5月はページビュー/ユーザー比が他の月と違うため、率は参考値として見てください。
                        </p>
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>会員登録に効くできごと</h2>
                        <p className={ui.note}>
                            会員登録を動かしうる ABテスト・リリース・計測変更です。
                            <strong>対象面を「会員登録」にして登録したABテストは自動でここに増えます</strong>（「自動」バッジ）。
                            リリース・恒久化・計測変更と、会員登録以外の面だが会員登録に効くもの（求人詳細のモザイク化など）は
                            <code>lib/constants/signupTimeline.ts</code> に1行足してください。
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

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>週次の内訳</h2>
                        <div className={ui.tableWrap}>
                            <table className={ui.dataTable}>
                                <thead>
                                    <tr>
                                        <th>週（月曜始まり）</th>
                                        <th className={ui.num}>会員登録数</th>
                                        <th className={ui.num}>単独</th>
                                        <th className={ui.num}>応募と同時</th>
                                        <th className={ui.num}>フォーム到達</th>
                                        <th className={ui.num}>完了（GA4）</th>
                                        <th className={ui.num}>登録率</th>
                                        <th className={ui.num}>フェーズ1で停止</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.weekly.map((w) => (
                                        <tr key={w.start}>
                                            <td>{w.label}{w.partial && <span className={styles.partialTag}>一部の日</span>}</td>
                                            <td className={cx(ui.num, ui.strong)}>{w.reg.toLocaleString()}</td>
                                            <td className={ui.num}>{w.plain.toLocaleString()}</td>
                                            <td className={ui.num}>{w.apply.toLocaleString()}</td>
                                            <td className={ui.num}>{w.formUsers.toLocaleString()}</td>
                                            <td className={ui.num}>{w.completedUsers.toLocaleString()}</td>
                                            <td className={ui.num}>{pct(w.rate)}</td>
                                            <td className={ui.num}>{w.phase2Unsaved.toLocaleString()}</td>
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
