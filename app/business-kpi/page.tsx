'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import PageShell from '@/components/PageShell'
import Alert from '@/components/Alert'
import { useProduct } from '@/contexts/ProductContext'
import { fetchJson } from '@/lib/utils/fetch'
import FilterBar, { FilterField } from '@/components/FilterBar'
import BusinessKpiTrendChart from '@/components/dashboard/BusinessKpiTrendChart'
import { ui, cx } from '@/components/ui'
import { useReport } from '@/hooks/useReport'
import {
    BUSINESS_KPI_METRICS, JOB_AD_SOURCES, formatKpi, isPartial, metricValue, paceOf,
    type BusinessKpiMetric,
} from '@/lib/constants/businessKpi'
import {
    GOAL_METRICS, GOAL_METRIC_KEYS, cumulative, formatGoalValue, halfPeriods, inPeriod,
    type GoalMetricKey,
} from '@/lib/constants/businessGoals'
import { CHART_COLORS } from '@/lib/constants/chartColors'
import type { ProductGoal, ProductGoalsResponse } from '@/lib/services/kpi/productGoalsTypes'
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

const GOAL_COLORS = [CHART_COLORS.blue, CHART_COLORS.violet, CHART_COLORS.cyan]

function Delta({ cur, prev }: { cur: number | null; prev: number | null | undefined }) {
    if (cur == null || prev == null || prev === 0) return <>—</>
    const d = ((cur - prev) / prev) * 100
    return <span className={d >= 0 ? styles.up : styles.dn}>{d >= 0 ? '+' : ''}{d.toFixed(0)}%</span>
}

export default function BusinessKpiPage() {
    const [months, setMonths] = useState(12)
    const [metric, setMetric] = useState<BusinessKpiMetric>('appsTotal')
    const { currentProduct } = useProduct()
    const propertyId = currentProduct?.ga4PropertyId ?? ''
    // propertyId を渡すとフォーム完了率（GA4）が付く。プロダクト未選択でも本体の数字は出る
    const report = useReport<BusinessKpiResponse>('/api/business-kpi', { body: { months, propertyId }, keepPreviousData: true })
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

                    <ProductGoalsCard latest={latest} partial={partial} rows={rows} lineRateAll={data.lineRateAll} />

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

/**
 * プロダクト目標。**目標値は画面から設定して DB に持ち、実績はプロダクトDBから自動で数える。**
 * 数え方は metricKey が決める（lib/constants/businessGoals.ts の GOAL_METRICS）ので、
 * 目標を足すときに集計コードを書く必要はない。
 */
function ProductGoalsCard({ latest, partial, rows, lineRateAll }: {
    latest: BusinessKpiMonth
    partial: boolean
    rows: BusinessKpiMonth[]
    lineRateAll: number | null
}) {
    const { currentProduct } = useProduct()
    const productId = currentProduct?.id
    const [goals, setGoals] = useState<ProductGoal[]>([])
    // 読み込み前に「目標を設定」を押すと空の編集画面が開いてしまうので、終わるまで押させない
    const [loaded, setLoaded] = useState(false)
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState<ProductGoal[]>([])
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!productId) return
        let cancelled = false
        setLoaded(false)
        fetchJson<ProductGoalsResponse>(`/api/product-goals?productId=${productId}`)
            .then((r) => { if (!cancelled) setGoals(r.goals) })
            .catch((e: Error) => { if (!cancelled) setError(e.message) })
            .finally(() => { if (!cancelled) setLoaded(true) })
        return () => { cancelled = true }
    }, [productId])

    /** 目安を入れる月。直近 3 ヶ月＋この先 3 ヶ月 */
    const milestoneMonths = useMemo(() => {
        const base = latest?.month ?? ''
        if (!base) return []
        const [y, m] = base.split('-').map(Number)
        return Array.from({ length: 6 }, (_, i) => {
            const d = new Date(Date.UTC(y, m - 1 - 2 + i, 1))
            return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
        })
    }, [latest])

    /** 期のプリセット。表示中の期間に重なる上半期・下半期を出す */
    const periodPresets = useMemo(
        () => (rows.length > 0 ? halfPeriods(rows[0].month, rows[rows.length - 1].month) : []),
        [rows],
    )
    const applyPeriod = (start: string, end: string) =>
        setDraft((d) => d.map((g) => ({ ...g, periodStart: start, periodEnd: end })))

    const startEdit = () => { setDraft(goals.map((g) => ({ ...g, milestones: { ...g.milestones } }))); setError(null); setEditing(true) }
    const patch = (i: number, p: Partial<ProductGoal>) => setDraft((d) => d.map((g, j) => (j === i ? { ...g, ...p } : g)))
    const patchMilestone = (i: number, month: string, raw: string) =>
        setDraft((d) => d.map((g, j) => {
            if (j !== i) return g
            const ms = { ...g.milestones }
            if (raw.trim() === '') delete ms[month]
            else ms[month] = Number(raw)
            return { ...g, milestones: ms }
        }))

    const addGoal = () => setDraft((d) => [...d, {
        id: 0, productId: productId ?? 0, metricKey: 'apps_total',
        label: '', note: null, target: null, weight: null, milestones: {}, sortOrder: d.length,
        // 期は直前の目標に揃える（同じ期の目標をまとめて足すことが多い）
        periodStart: d[d.length - 1]?.periodStart ?? null,
        periodEnd: d[d.length - 1]?.periodEnd ?? null,
    }])

    const save = async () => {
        if (!productId) return
        setSaving(true); setError(null)
        try {
            const res = await fetchJson<{ goals: ProductGoal[] }>('/api/product-goals', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productId,
                    goals: draft.map((g, i) => ({
                        id: g.id || undefined, metricKey: g.metricKey, label: g.label, note: g.note,
                        target: g.target == null ? null : Number(g.target),
                        weight: g.weight == null ? null : Number(g.weight),
                        milestones: g.milestones, sortOrder: i,
                        periodStart: g.periodStart, periodEnd: g.periodEnd,
                    })),
                }),
            })
            setGoals(res.goals)
            setEditing(false)
        } catch (e) {
            setError(e instanceof Error ? e.message : '保存に失敗しました')
        } finally {
            setSaving(false)
        }
    }

    const remove = async (g: ProductGoal, i: number) => {
        if (!g.id) { setDraft((d) => d.filter((_, j) => j !== i)); return }
        if (!productId) return
        setSaving(true); setError(null)
        try {
            await fetchJson(`/api/product-goals?productId=${productId}&id=${g.id}`, { method: 'DELETE' })
            setDraft((d) => d.filter((_, j) => j !== i))
            setGoals((gs) => gs.filter((x) => x.id !== g.id))
        } catch (e) {
            setError(e instanceof Error ? e.message : '削除に失敗しました')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className={ui.card}>
            <div className={styles.goalCardHead}>
                <h2 className={ui.sectionTitle}>プロダクト目標</h2>
                {!editing
                    ? <button type="button" className={ui.btnGhost} onClick={startEdit} disabled={!productId || !loaded}>{loaded ? '目標を設定' : '読み込み中...'}</button>
                    : (
                        <span className={styles.goalActions}>
                            <button type="button" className={ui.btnGhost} onClick={addGoal} disabled={saving}>＋ 目標を追加</button>
                            <button type="button" className={ui.btnGhost} onClick={() => setEditing(false)} disabled={saving}>キャンセル</button>
                            <button type="button" className={ui.btnPrimary} onClick={save} disabled={saving}>{saving ? '保存中...' : '保存'}</button>
                        </span>
                    )}
            </div>
            <p className={ui.sectionNote}>
                目標値はこの画面で設定します。<strong>実績はプロダクトDBから自動で数える</strong>ので、設定したあとは手入力は要りません。
                月別の目安を入れると、その月に届いているかを判定します。
            </p>
            {error && <Alert tone="error">{error}</Alert>}

            {editing ? (
                <>
                <div className={styles.presetRow}>
                    <span className={styles.presetLabel}>期をまとめて設定:</span>
                    {periodPresets.map((p) => (
                        <button key={p.start} type="button" className={ui.btnGhost} onClick={() => applyPeriod(p.start, p.end)}>{p.label}</button>
                    ))}
                </div>
                <div className={ui.tableWrap}>
                    <table className={ui.dataTable}>
                        <thead>
                            <tr>
                                <th>目標の名前</th>
                                <th>何を数えるか</th>
                                <th>期（開始〜終了）</th>
                                <th className={ui.num}>期末目標</th>
                                <th className={ui.num}>比重%</th>
                                {milestoneMonths.map((m) => <th key={m} className={ui.num}>{m.slice(2)}</th>)}
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {draft.map((g, i) => (
                                <tr key={g.id || `new-${i}`}>
                                    <td><input className={cx(ui.input, styles.nameInput)} value={g.label} placeholder="目標の名前" onChange={(e) => patch(i, { label: e.target.value })} /></td>
                                    <td>
                                        <select className={cx(ui.select, styles.metricSelect)} value={g.metricKey} onChange={(e) => patch(i, { metricKey: e.target.value as GoalMetricKey })} aria-label="数える指標">
                                            {GOAL_METRIC_KEYS.map((k) => <option key={k} value={k}>{GOAL_METRICS[k].label}</option>)}
                                        </select>
                                    </td>
                                    <td className={styles.periodCell}>
                                        <input className={cx(ui.input, styles.monthInput)} value={g.periodStart ?? ''} placeholder="2026-07" onChange={(e) => patch(i, { periodStart: e.target.value || null })} aria-label="期の開始月" />
                                        <span className={ui.note}>〜</span>
                                        <input className={cx(ui.input, styles.monthInput)} value={g.periodEnd ?? ''} placeholder="2026-12" onChange={(e) => patch(i, { periodEnd: e.target.value || null })} aria-label="期の終了月" />
                                    </td>
                                    <td className={ui.num}><input className={cx(ui.input, styles.numInput)} type="number" step="any" value={g.target ?? ''} placeholder="未設定" onChange={(e) => patch(i, { target: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                                    <td className={ui.num}><input className={cx(ui.input, styles.numInput)} type="number" value={g.weight ?? ''} onChange={(e) => patch(i, { weight: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                                    {milestoneMonths.map((m) => (
                                        <td key={m} className={ui.num}>
                                            <input className={cx(ui.input, styles.numInput)} type="number" step="any" value={g.milestones[m] ?? ''} onChange={(e) => patchMilestone(i, m, e.target.value)} />
                                        </td>
                                    ))}
                                    <td><button type="button" className={ui.btnGhost} onClick={() => remove(g, i)} disabled={saving}>削除</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className={ui.tableNote}>
                        「何を数えるか」で選んだ指標の実績が、毎回プロダクトDBから自動で集計されます。
                        率の指標（一斉送信の応募率・新規のLINE連携率）は <strong>0.15 のように小数</strong>で入れてください（0.15 = 15%）。
                        月別の目安は空欄にすると判定しません。
                        <strong>期</strong>を入れると、その期間の累計（率は通算）が目標カードに出ます。
                    </p>
                </div>
                </>
            ) : !loaded ? (
                <p className={ui.sectionNote}>目標を読み込んでいます...</p>
            ) : goals.length === 0 ? (
                <p className={ui.sectionNote}>目標がまだありません。「目標を設定」から追加してください。</p>
            ) : (
                <>
                    <div className={styles.goalGrid}>
                        {goals.map((g, i) => {
                            const def = GOAL_METRICS[g.metricKey]
                            const color = GOAL_COLORS[i % GOAL_COLORS.length]
                            const actual = def.extract(latest)
                            // 率は日数で割り戻しても意味が変わらないので、ペース換算は実数の指標だけ
                            const pace = def.isRate ? actual : (paceOf(actual, latest) ?? actual)
                            const milestone = g.milestones[latest.month] ?? null
                            const basis = partial ? pace : actual
                            // 期の累計。率は Σ分子 ÷ Σ分母 で出す（月をまたいで足せないため）
                            const periodMonths = rows.filter((m) => inPeriod(m.month, g.periodStart, g.periodEnd))
                            const total = cumulative(periodMonths, g.metricKey)
                            const hasTarget = g.target != null && g.target > 0
                            const w = (v: number | null) => `${v == null || !hasTarget ? 0 : Math.min(100, (v / (g.target as number)) * 100)}%`
                            const ok = milestone == null || basis == null ? null : basis >= milestone
                            return (
                                <div key={g.id} className={styles.goalCard} style={{ '--goal-accent': color } as CSSProperties}>
                                    <div className={styles.goalHead}>
                                        <h3 className={styles.goalTitle}>{g.label}</h3>
                                        {g.weight != null && <span className={styles.goalWeight}>比重 {g.weight}%</span>}
                                    </div>
                                    <p className={styles.goalDef}>
                                        {def.label}｜{def.definition}
                                        {def.fromGa4 && <span className={styles.ga4Tag}>GA4</span>}
                                    </p>
                                    <div className={styles.goalNums}>
                                        <span className={styles.goalActual}>{formatGoalValue(actual, g.metricKey)}</span>
                                        <span className={styles.goalPace}>
                                            {latest.month}
                                            {partial && !def.isRate && <> ／ 月末見込み <strong>{formatGoalValue(pace, g.metricKey)}</strong></>}
                                        </span>
                                    </div>
                                    {hasTarget ? (
                                        <>
                                            <div className={styles.goalTrack}>
                                                {partial && !def.isRate && <span className={styles.goalFillPace} style={{ width: w(pace) }} />}
                                                <span className={styles.goalFillActual} style={{ width: w(actual) }} />
                                                {milestone != null && milestone < (g.target as number) && (
                                                    <span className={styles.goalMark} style={{ left: w(milestone) }} title={`${latest.month} の目安 ${milestone}`} />
                                                )}
                                            </div>
                                            <div className={styles.goalScale}>
                                                <span>0</span>
                                                <span>{latest.month} 目安 {milestone == null ? '—' : formatGoalValue(milestone, g.metricKey)}</span>
                                                <span>期末 {formatGoalValue(g.target, g.metricKey)}</span>
                                            </div>
                                        </>
                                    ) : (
                                        <p className={styles.goalNoTarget}>目標値は未設定（実績だけ見ています）</p>
                                    )}
                                    <p className={styles.goalPeriod}>
                                        {g.periodStart || g.periodEnd
                                            ? <>期 {g.periodStart ?? '—'} 〜 {g.periodEnd ?? '—'} の{def.isRate ? '通算' : '累計'}: <strong>{formatGoalValue(total, g.metricKey)}</strong>（{periodMonths.length} ヶ月分）</>
                                            : <>期が未設定です。表示中の {rows.length} ヶ月の{def.isRate ? '通算' : '累計'}: <strong>{formatGoalValue(total, g.metricKey)}</strong></>}
                                    </p>
                                    {hasTarget && (
                                        <p className={styles.goalVerdict}>
                                            {milestone == null
                                                ? <>この月の目安は設定されていません。</>
                                                : ok
                                                    ? <>今月の目安に <span className={styles.up}>{partial && !def.isRate ? '見込みで届いています' : '到達'}</span>（{formatGoalValue(basis, g.metricKey)}）。</>
                                                    : <>今月の目安 {formatGoalValue(milestone, g.metricKey)} に <span className={styles.dn}>届いていません</span>（{partial && !def.isRate ? '見込み' : '実績'} {formatGoalValue(basis, g.metricKey)}）。</>}
                                        </p>
                                    )}
                                    {g.note && <p className={styles.goalNote}>{g.note}</p>}
                                </div>
                            )
                        })}
                    </div>

                    <div className={cx(ui.tableWrap, styles.subTable)}>
                        <table className={ui.dataTable}>
                            <thead>
                                <tr>
                                    <th>月</th>
                                    {goals.map((g) => <th key={g.id} className={ui.num}>{g.label}</th>)}
                                    <th className={ui.num}>…LINEプッシュ</th>
                                    <th className={ui.num}>…登録当日</th>
                                    <th className={ui.num}>…1〜30日の再訪</th>
                                    <th className={ui.num}>…既存会員</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...rows].reverse().map((m) => {
                                    const b = m.breakdown
                                    return (
                                        <tr key={m.month}>
                                            <td>{m.month}{isPartial(m) && <span className={styles.partial}>{m.daysElapsed}日経過</span>}</td>
                                            {goals.map((g) => (
                                                <td key={g.id} className={cx(ui.num, ui.strong)}>{formatGoalValue(GOAL_METRICS[g.metricKey].extract(m), g.metricKey)}</td>
                                            ))}
                                            <td className={ui.num}>{n(b.prodLinePush)}</td>
                                            <td className={ui.num}>{n(b.prodDay0 + b.lineDay0)}</td>
                                            <td className={ui.num}>{n(b.prodD1_30 + b.lineD1_30)}</td>
                                            <td className={ui.num}>{n(b.prodD31 + b.lineD31)}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                    <p className={ui.tableNote}>
                        <strong>GA4</strong> の印が付いた指標だけ出典が GA4 で、他はプロダクトDBです。
                        <strong>応募フォーム完了率はサイト内の通常フォームだけ</strong>を数えており、featured 配信経由の応募（別フォーム・GTMラベル未実装）は入りません。
                        2026-09 でラベル基準の完了は 94 件、プロダクトDB の求人広告の応募は 187 件で、この差が featured 経由などです。
                        到達側のビューラベルは「50%表示×1秒」が条件でハイドレーション後に付くため、ファーストビューでは少なく出て完了率が高めに振れることがあります。
                        <strong>水準ではなく種別間の差と時系列の変化で見てください。</strong>
                    </p>
                    <p className={ui.tableNote}>
                        右の 4 列は「プロダクト経由＋LINE公式の応募」を、会員になってからの経過で分けたものです
                        （LINEプッシュ＋登録当日＋1〜30日の再訪＋既存会員＝その合計）。
                        会員全体の LINE 連携率は現在 <strong>{lineRateAll == null ? '—' : `${(lineRateAll * 100).toFixed(1)}%`}</strong>（月次ではなく現在値）。
                    </p>
                </>
            )}
        </div>
    )
}
