'use client'

import { useState } from 'react'
import type { CSSProperties } from 'react'
import PageShell from '@/components/PageShell'
import FilterBar, { FilterField } from '@/components/FilterBar'
import BusinessKpiTrendChart from '@/components/dashboard/BusinessKpiTrendChart'
import { ui, cx } from '@/components/ui'
import { useReport } from '@/hooks/useReport'
import {
    BUSINESS_KPI_METRICS, JOB_AD_SOURCES, formatKpi, isPartial, metricValue, paceOf,
    type BusinessKpiMetric,
} from '@/lib/constants/businessKpi'
import type { BusinessKpiMonth, BusinessKpiResponse } from '@/lib/services/kpi/businessKpiTypes'
import styles from './BusinessKpiPage.module.css'

const PERIODS = [
    { value: 6, label: '過去6ヶ月' },
    { value: 12, label: '過去12ヶ月' },
    { value: 24, label: '過去24ヶ月' },
]

/** 推移グラフで選べる指標。ダッシュボードの 5 つに加えて内訳系も選べる */
const CHART_METRICS: readonly BusinessKpiMetric[] = [
    'appsTotal', 'appsJobAd', 'appsAgent', 'appsHelloWork',
    'reg', 'regPlain', 'regApplySignup', 'regLine', 'sends', 'appsPerJob',
]

/** 月末着地の見込みを出す指標 */
const PROJECTED: readonly BusinessKpiMetric[] = ['appsTotal', 'appsJobAd', 'reg', 'appsPerJob']

const n = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString())

function Delta({ cur, prev }: { cur: number | null; prev: number | null | undefined }) {
    if (cur == null || prev == null || prev === 0) return <>—</>
    const d = ((cur - prev) / prev) * 100
    return <span className={d >= 0 ? styles.up : styles.dn}>{d >= 0 ? '+' : ''}{d.toFixed(0)}%</span>
}

export default function BusinessKpiPage() {
    const [months, setMonths] = useState(12)
    const [metric, setMetric] = useState<BusinessKpiMetric>('appsTotal')
    const report = useReport<BusinessKpiResponse>('/api/business-kpi', { body: { months }, keepPreviousData: true })
    const data = report.data
    const rows: BusinessKpiMonth[] = data?.months ?? []
    const latest = rows[rows.length - 1]
    const prev = rows[rows.length - 2]
    const partial = latest ? isPartial(latest) : false

    return (
        <PageShell
            pageId="businessKpi"
            status={{ loading: report.loading && !data, error: report.error, source: 'bq', loadingText: 'プロダクトDBを集計しています...', onRetry: report.run }}
            keepChildrenWhileLoading
            controls={
                <FilterBar>
                    <FilterField label="期間" hint={data ? `${data.dataTo} まで` : undefined}>
                        <select className={ui.select} value={months} onChange={(e) => setMonths(Number(e.target.value))} aria-label="期間">
                            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                    </FilterField>
                </FilterBar>
            }
        >
            {latest && data && (
                <>
                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>
                            {partial ? `${latest.month} の着地見込み` : `${latest.month} の実績`}
                        </h2>
                        <p className={ui.sectionNote}>
                            {partial
                                ? <>{latest.daysInMonth} 日のうち <strong>{latest.daysElapsed} 日</strong>までの実績を、同じペースで月末まで延ばした値です。日数で割り戻しているだけなので、<strong>月初・月末に偏る施策がある月は外れます</strong>。</>
                                : <>この月は確定しています。</>}
                        </p>
                        <div className={styles.projection}>
                            {PROJECTED.map((key) => {
                                const def = BUSINESS_KPI_METRICS[key]
                                const v = metricValue(latest, key)
                                const pace = paceOf(v, latest)
                                const p = prev ? metricValue(prev, key) : null
                                return (
                                    <div key={key} className={styles.projCard} style={{ '--proj-accent': def.color } as CSSProperties}>
                                        <span className={styles.projLabel}>{def.label}</span>
                                        <span className={styles.projPace}>{formatKpi(pace, def)}</span>
                                        <span className={styles.projFormula}>
                                            {partial
                                                ? <>実績 {formatKpi(v, def)} ÷ {latest.daysElapsed}日 × {latest.daysInMonth}日<br /></>
                                                : null}
                                            前月（{prev?.month ?? '—'}）{formatKpi(p, def)} 比 <Delta cur={pace} prev={p} />
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>推移</h2>
                        <div className={styles.metricTabs}>
                            {CHART_METRICS.map((key) => {
                                const def = BUSINESS_KPI_METRICS[key]
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        aria-pressed={metric === key}
                                        className={cx(styles.metricTab, metric === key && styles.metricTabActive)}
                                        style={{ '--tab-accent': def.color } as CSSProperties}
                                        onClick={() => setMetric(key)}
                                    >
                                        {def.label}
                                    </button>
                                )
                            })}
                        </div>
                        <BusinessKpiTrendChart months={rows} metric={metric} />
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>求人広告の応募はどこから来ているか</h2>
                        {rows.map((m) => {
                            const total = JOB_AD_SOURCES.reduce((a, s) => a + m.jobAdBySource[s.key], 0)
                            return (
                                <div key={m.month} className={styles.mixRow}>
                                    <span className={styles.mixMonth}>{m.month.slice(2)}</span>
                                    <div className={styles.mixBar}>
                                        {total > 0 && JOB_AD_SOURCES.map((s) => {
                                            const v = m.jobAdBySource[s.key]
                                            if (v === 0) return null
                                            return (
                                                <span
                                                    key={s.key}
                                                    className={styles.mixSeg}
                                                    style={{ width: `${(v / total) * 100}%`, backgroundColor: s.color }}
                                                    title={`${s.label} ${v}件`}
                                                >
                                                    {v / total >= 0.1 ? v : ''}
                                                </span>
                                            )
                                        })}
                                    </div>
                                    <span className={styles.mixTotal}>{n(total)}</span>
                                </div>
                            )
                        })}
                        <div className={styles.legend}>
                            {JOB_AD_SOURCES.map((s) => (
                                <span key={s.key} className={styles.legendItem}>
                                    <i className={styles.swatch} style={{ backgroundColor: s.color }} aria-hidden />{s.label}
                                </span>
                            ))}
                        </div>
                        <p className={ui.tableNote}>
                            流入分類を出しているのは<strong>求人広告だけ</strong>です（人材紹介・ハローワークは配信の主対象ではないため）。
                            上から順に当てはめる分類で、どれにも当たらない既存会員の応募は「プロダクト経由」に寄せています。
                            「応募同時登録」は応募と同時に会員になった人で、会員登録側の「単独登録」とは分母が違います。
                        </p>
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>月次</h2>
                        <div className={ui.tableWrap}>
                            <table className={ui.dataTable}>
                                <thead>
                                    <tr>
                                        <th>月</th>
                                        <th className={ui.num}>応募合計</th>
                                        <th className={ui.num}>求人広告</th>
                                        <th className={ui.num}>人材紹介</th>
                                        <th className={ui.num}>ハローワーク</th>
                                        <th className={ui.num}>会員登録</th>
                                        <th className={ui.num}>単独登録</th>
                                        <th className={ui.num}>応募同時</th>
                                        <th className={ui.num}>LINE連携</th>
                                        <th className={ui.num}>スカウト送信</th>
                                        <th className={ui.num}>求人あたり</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...rows].reverse().map((m) => (
                                        <tr key={m.month}>
                                            <td>
                                                {m.month}
                                                {isPartial(m) && <span className={styles.partial}>{m.daysElapsed}日経過</span>}
                                            </td>
                                            <td className={cx(ui.num, ui.strong)}>{n(m.appsTotal)}</td>
                                            <td className={ui.num}>{n(m.appsJobAd)}</td>
                                            <td className={ui.num}>{n(m.appsAgent)}</td>
                                            <td className={ui.num}>{n(m.appsHelloWork)}</td>
                                            <td className={cx(ui.num, ui.strong)}>{n(m.reg)}</td>
                                            <td className={ui.num}>{n(m.regPlain)}</td>
                                            <td className={ui.num}>{n(m.regApplySignup)}</td>
                                            <td className={ui.num}>{n(m.regLine)}</td>
                                            <td className={ui.num}>{n(m.sends)}</td>
                                            <td className={ui.num}>{m.appsPerJob != null ? m.appsPerJob.toFixed(3) : '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className={ui.tableNote}>
                            出典は<strong>プロダクトDB（xmile-drm.xwork）</strong>で GA4 ではありません。応募数・会員登録数はこちらが正です。
                            分類は goal-tracker の weekly_actuals.sql と同じ定義に揃えてあり、<strong>片方を変えたらもう片方も直す</strong>必要があります。
                            「求人あたり」の分母は<strong>現在</strong>公開中の求人広告 {n(data.inventoryJobAd)} 件なので、過去月の値は目安です。
                        </p>
                    </div>
                </>
            )}
        </PageShell>
    )
}
