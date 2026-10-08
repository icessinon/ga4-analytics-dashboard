'use client'

import type { CSSProperties } from 'react'
import { ui, cx } from '@/components/ui'
import LoadState from '@/components/LoadState'
import Link from '@/components/Link'
import { useReport } from '@/hooks/useReport'
import { CHART_COLORS } from '@/lib/constants/chartColors'
import type { BusinessKpiMonth, BusinessKpiResponse, JobAdSource } from '@/lib/services/kpi/businessKpiTypes'
import styles from './BusinessKpiSection.module.css'

/**
 * ダッシュボード最上段の事業KPI。**出典はプロダクトDB（xmile-drm.xwork）で GA4 ではない。**
 * 応募数・会員登録数の正はこちらなので、GA4 側のCV数（ページ計測）と食い違ったらこの数字を採る。
 * 流入分類の定義は lib/services/kpi/businessKpiService.ts のコメントを読むこと。
 */

/** 求人広告の流入分類。並び順＝積み上げバーの順。色は CHART_SERIES と同系で固定する */
const SOURCES: ReadonlyArray<{ key: JobAdSource; label: string; color: string }> = [
    { key: 'product', label: 'プロダクト経由', color: CHART_COLORS.blue },
    { key: 'apply_signup', label: '応募同時登録', color: CHART_COLORS.green },
    { key: 'line', label: 'LINE公式', color: CHART_COLORS.cyan },
    { key: 'hrs', label: '人材紹介側の配信', color: CHART_COLORS.amber },
    { key: 'scout', label: 'スカウト', color: CHART_COLORS.violet },
    { key: 'others', label: 'その他（広告）', color: CHART_COLORS.pink },
]

const n = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString())

function Delta({ cur, prev }: { cur: number; prev: number | undefined }) {
    if (prev == null || prev === 0) return <>—</>
    const d = ((cur - prev) / prev) * 100
    return <span className={d >= 0 ? styles.up : styles.dn}>{d >= 0 ? '+' : ''}{d.toFixed(0)}%</span>
}

/**
 * 当月の実績を同じペースで進めたときの月末着地。
 * **途中の月をそのまま前月の満額と比べると必ず大きなマイナスに見える**ので、
 * 途中の月は実績ではなく着地見込みで前月比を出す。
 */
const paceOf = (v: number, m: BusinessKpiMonth) =>
    m.daysElapsed > 0 && m.daysElapsed < m.daysInMonth ? Math.round((v / m.daysElapsed) * m.daysInMonth) : v

/** 確定月は「前月比 x%」、途中の月は「月末見込み N（前月比 x%）」 */
function TrendSub({ cur, prev, month }: { cur: number; prev: number | undefined; month: BusinessKpiMonth }) {
    if (month.daysElapsed >= month.daysInMonth) return <>前月比 <Delta cur={cur} prev={prev} /></>
    const pace = paceOf(cur, month)
    return <>月末見込み <strong>{n(pace)}</strong>（前月比 <Delta cur={pace} prev={prev} />）</>
}

interface TileProps { label: string; value: string; accent: string; sub?: React.ReactNode }
function Tile({ label, value, accent, sub }: TileProps) {
    return (
        <div className={styles.tile} style={{ '--tile-accent': accent } as CSSProperties}>
            <span className={styles.tileLabel}>{label}</span>
            <span className={styles.tileValue}>{value}</span>
            {sub && <span className={styles.tileSub}>{sub}</span>}
        </div>
    )
}

export default function BusinessKpiSection() {
    const report = useReport<BusinessKpiResponse>('/api/business-kpi', { body: { months: 6 }, keepPreviousData: true })
    const data = report.data
    const months: BusinessKpiMonth[] = data?.months ?? []
    const latest = months[months.length - 1]
    const prev = months[months.length - 2]
    // 当月は途中なので、前月比は「同じ日数での比較」ではない。着地見込みを併記して誤読を防ぐ
    const partial = latest ? latest.daysElapsed < latest.daysInMonth : false

    return (
        <div className={cx(ui.card, styles.section)}>
            <h2 className={ui.sectionTitle}>事業KPI（応募・会員登録）</h2>
            <p className={styles.sourceNote}>
                出典は<strong>プロダクトDB（xmile-drm.xwork）</strong>で、GA4 ではありません。応募数・会員登録数はこちらが正です。
                分類は goal-tracker の weekly_actuals.sql と同じ定義に揃えてあります。
                {data && <> 集計は {data.dataTo} まで（JST の昨日）。</>}
            </p>

            <LoadState loading={report.loading && !data} error={report.error} source="bq" variant="inline" onRetry={report.run}>
                {latest && (
                    <>
                        <div className={styles.tiles}>
                            <Tile
                                label={`応募合計（${latest.month}）`}
                                value={n(latest.appsTotal)}
                                accent={CHART_COLORS.blue}
                                sub={<TrendSub cur={latest.appsTotal} prev={prev?.appsTotal} month={latest} />}
                            />
                            <Tile
                                label="うち求人広告"
                                value={n(latest.appsJobAd)}
                                accent={CHART_COLORS.violet}
                                sub={<TrendSub cur={latest.appsJobAd} prev={prev?.appsJobAd} month={latest} />}
                            />
                            <Tile
                                label="うち人材紹介"
                                value={n(latest.appsAgent)}
                                accent={CHART_COLORS.amber}
                                sub={<TrendSub cur={latest.appsAgent} prev={prev?.appsAgent} month={latest} />}
                            />
                            <Tile
                                label="うちハローワーク"
                                value={n(latest.appsHelloWork)}
                                accent={CHART_COLORS.orange}
                                sub={<TrendSub cur={latest.appsHelloWork} prev={prev?.appsHelloWork} month={latest} />}
                            />
                            <Tile
                                label="会員登録"
                                value={n(latest.reg)}
                                accent={CHART_COLORS.green}
                                sub={<>
                                    単独 {n(latest.regPlain)} / 応募同時 {n(latest.regApplySignup)}<br />
                                    <TrendSub cur={latest.reg} prev={prev?.reg} month={latest} />
                                </>}
                            />
                            <Tile
                                label="求人あたり月間応募"
                                value={latest.appsPerJob != null ? latest.appsPerJob.toFixed(3) : '—'}
                                accent={CHART_COLORS.cyan}
                                sub={<>
                                    {partial && data?.inventoryJobAd ? <>月末見込み <strong>{(paceOf(latest.appsJobAd, latest) / data.inventoryJobAd).toFixed(3)}</strong><br /></> : null}
                                    公開中の求人広告 {n(data?.inventoryJobAd)} 件が分母
                                </>}
                            />
                        </div>

                        {partial && (
                            <p className={styles.sourceNote}>
                                {latest.month} は <strong>{latest.daysInMonth} 日のうち {latest.daysElapsed} 日</strong>までの途中集計です。
                                途中の月をそのまま前月の満額と比べると必ず大きなマイナスに見えるので、前月比は<strong>月末見込み</strong>（今のペースで進んだ場合）で出しています。
                            </p>
                        )}

                        <h3 className={ui.sectionTitle}>求人広告の応募はどこから来ているか</h3>
                        {months.map((m) => {
                            const total = SOURCES.reduce((a, s) => a + m.jobAdBySource[s.key], 0)
                            return (
                                <div key={m.month} className={styles.mixRow}>
                                    <span className={styles.mixMonth}>{m.month.slice(5)}月</span>
                                    <div className={styles.mixBar}>
                                        {total > 0 && SOURCES.map((s) => {
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
                            {SOURCES.map((s) => (
                                <span key={s.key} className={styles.legendItem}>
                                    <i className={styles.swatch} style={{ backgroundColor: s.color }} aria-hidden />{s.label}
                                </span>
                            ))}
                        </div>

                        <div className={ui.tableWrap} style={{ marginTop: '1.25rem' }}>
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
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...months].reverse().map((m) => (
                                        <tr key={m.month}>
                                            <td>
                                                {m.month}
                                                {m.daysElapsed < m.daysInMonth && <span className={styles.partial}>{m.daysElapsed}日経過</span>}
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
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className={ui.tableNote}>
                            求人広告のみ流入分類を出しています（人材紹介・ハローワークは配信の主対象ではないため）。
                            「応募同時登録」は会員登録と同時に応募した人で、<strong>会員登録の単独登録とは分母が違います</strong>。
                            求人あたり月間応募の分母は<strong>現在</strong>公開中の求人広告数なので、過去月の値は目安です。
                            詳しい内訳は <Link href="/cv-types">求人種別CV分析</Link> / <Link href="/scout">スカウト効果ファネル</Link> を見てください。
                        </p>
                    </>
                )}
            </LoadState>
        </div>
    )
}
