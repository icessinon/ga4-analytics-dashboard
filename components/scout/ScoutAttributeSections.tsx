'use client'

import { useState } from 'react'
import styles from '@/app/scout/ScoutPage.module.css'
import { SCOUT_RECIPIENT_SNAPSHOT as S } from '@/lib/constants/scoutRecipientSnapshot'

type Pair = readonly [string, number]
type Usage = {
    sharePct: number; candidates: number; sendsPerCandidate: number; jobs: number; sendsPerJob: number
    activeDays: number; sendsPerActiveDay: number; firstAt: string; lastAt: string; viewRate: number; sentRate: number
}
type CoRow = {
    companyId: string; companyName: string | null; sends: number; viewed: number; applied: number; matched: number; usage: Usage
    ageBand: readonly Pair[]; prefecture: readonly Pair[]; employment: readonly Pair[]; timing: readonly Pair[]; licenses: readonly Pair[]
}
const COMPANIES = S.byCompany as readonly CoRow[]
const U = S.usageOverall

function pctOf(n: number, d: number): string {
    return d > 0 ? `${Math.round((n / d) * 100)}%` : '－'
}

/** 分布バー（label + 件数 + 横バー + %）。%は当該分布内の合計に対する比率。 */
function Dist({ title, items, max = 8 }: { title: string; items: readonly Pair[]; max?: number }) {
    const total = items.reduce((s, [, c]) => s + c, 0)
    const top = items.slice(0, max)
    const peak = Math.max(1, ...top.map(([, c]) => c))
    return (
        <div className={styles.distBlock}>
            <div className={styles.distTitle}>{title}</div>
            {top.map(([label, count]) => (
                <div key={label} className={styles.distRow}>
                    <span className={styles.distLabel} title={label}>{label}</span>
                    <span className={styles.distBarTrack}>
                        <span className={styles.distBarFill} style={{ width: `${(count / peak) * 100}%` }} />
                    </span>
                    <span className={styles.distVal}>{pctOf(count, total)}</span>
                </div>
            ))}
        </div>
    )
}

/** 上位n件を「40代36%・20代31%」のような1行文字列に */
function summarize(items: readonly Pair[], n = 3): string {
    const total = items.reduce((s, [, c]) => s + c, 0)
    return items.slice(0, n).map(([l, c]) => `${l}${pctOf(c, total)}`).join('・') || '－'
}

function FunnelTable({ title, rows }: { title: string; rows: readonly { key: string; sends: number; viewed: number; viewRate: number }[] }) {
    return (
        <div className={styles.funnelBlock}>
            <div className={styles.distTitle}>{title}</div>
            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr><th>{title}</th><th className={styles.num}>送信</th><th className={styles.num}>閲覧率</th></tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.key}>
                                <td>{r.key}</td>
                                <td className={styles.num}>{r.sends.toLocaleString()}</td>
                                <td className={styles.num}>{r.viewRate}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>{label}</span>
            <span className={styles.summaryValue}>{value}</span>
            {hint && <span className={styles.summaryHint}>{hint}</span>}
        </div>
    )
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div className={styles.usageItem}>
            <span className={styles.usageLabel}>{label}</span>
            <span className={styles.usageValue}>{value}</span>
        </div>
    )
}

export default function ScoutAttributeSections() {
    const [showJobs, setShowJobs] = useState(false)
    const [openCompany, setOpenCompany] = useState<string | null>(null)
    const t = S.totals
    const selectedCo = openCompany ? COMPANIES.find((c) => c.companyId === openCompany) : null
    return (
        <>
            <div className={styles.card}>
                <div className={styles.tableHeader}>
                    <h2 className={styles.sectionTitle}>スカウト利用サマリ（全体）</h2>
                    <span className={styles.asof}>as of {S.asof}｜{U.firstAt}〜{U.lastAt}</span>
                </div>
                <div className={styles.summaryRow}>
                    <Stat label="送信総数" value={U.sends.toLocaleString()} hint={`稼働 ${U.activeDays}日`} />
                    <Stat label="稼働企業数" value={`${U.companies}社`} hint={`上位2社で${U.top2Share}%`} />
                    <Stat label="対象求職者" value={U.candidates.toLocaleString()} hint={`1人あたり${U.sendsPerCandidate}送信（再スカウトほぼ無）`} />
                    <Stat label="全体閲覧率" value={`${U.viewRate}%`} hint="送信→スカウトページ閲覧" />
                    <Stat label="中央値 送信/社" value={U.medianSendsPerCompany.toLocaleString()} hint="大半の企業は少量・上位が大量" />
                </div>
            </div>

            <div className={styles.card}>
                <div className={styles.tableHeader}>
                    <h2 className={styles.sectionTitle}>送信先の求職者属性（スナップショット）</h2>
                    <span className={styles.asof}>as of {S.asof}｜{S.windowStart}〜{S.windowEnd}</span>
                </div>
                <p className={styles.tableNote}>
                    どんな属性の求職者にスカウトが送られているか。送信{t.sends.toLocaleString()}件のうち属性を結合できた{t.matchedAttrs.toLocaleString()}件（{pctOf(t.matchedAttrs, t.sends)}）で集計。
                    {S.overall.ageStats && `平均年齢 ${S.overall.ageStats.mean}歳（中央${S.overall.ageStats.median}歳）。`}
                </p>
                <div className={styles.attrGrid}>
                    <Dist title="年代" items={S.overall.ageBand} />
                    <Dist title="就業形態" items={S.overall.employment} />
                    <Dist title="転職時期" items={S.overall.timing} />
                    <Dist title="エリア（都道府県）" items={S.overall.prefecture} max={10} />
                    <Dist title="保有免許・資格" items={S.overall.licenses} max={12} />
                </div>
            </div>

            <div className={styles.card}>
                <h2 className={styles.sectionTitle}>企業別の送信先属性（上位{COMPANIES.length}社）</h2>
                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>企業</th><th className={styles.num}>送信</th><th className={styles.num}>閲覧率</th>
                                <th>主な年代</th><th>主なエリア</th><th>主な免許・資格</th>
                            </tr>
                        </thead>
                        <tbody>
                            {COMPANIES.map((c) => (
                                <tr
                                    key={c.companyId}
                                    className={`${styles.clickableRow} ${c.companyId === openCompany ? styles.selectedRow : ''}`}
                                    onClick={() => setOpenCompany(c.companyId === openCompany ? null : c.companyId)}
                                >
                                    <td>{c.companyName ?? c.companyId.slice(0, 8)}</td>
                                    <td className={styles.num}>{c.sends.toLocaleString()}</td>
                                    <td className={styles.num}>{pctOf(c.viewed, c.sends)}</td>
                                    <td>{summarize(c.ageBand)}</td>
                                    <td>{summarize(c.prefecture)}</td>
                                    <td>{summarize(c.licenses)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className={styles.tableNote}>※ 行をクリックすると、その企業の送信先属性の詳細を下に表示します。「主な〜」は上位。</p>

                {selectedCo && (
                    <div className={styles.companyDetail}>
                        <div className={styles.tableHeader}>
                            <h3 className={styles.distTitle}>
                                {selectedCo.companyName ?? selectedCo.companyId.slice(0, 8)} の送信先属性
                            </h3>
                            <button className={styles.pageBtn} onClick={() => setOpenCompany(null)}>閉じる</button>
                        </div>
                        <div className={styles.usageGrid}>
                            <Metric label="送信数（全体シェア）" value={`${selectedCo.sends.toLocaleString()}（${selectedCo.usage.sharePct}%）`} />
                            <Metric label="対象求職者" value={`${selectedCo.usage.candidates.toLocaleString()}名（1人${selectedCo.usage.sendsPerCandidate}送信）`} />
                            <Metric label="対象求人" value={`${selectedCo.usage.jobs}件（1求人${selectedCo.usage.sendsPerJob.toLocaleString()}送信）`} />
                            <Metric label="稼働" value={`${selectedCo.usage.activeDays}日・1日あたり${selectedCo.usage.sendsPerActiveDay.toLocaleString()}件`} />
                            <Metric label="送信期間" value={`${selectedCo.usage.firstAt}〜${selectedCo.usage.lastAt}`} />
                            <Metric label="閲覧率" value={`${selectedCo.usage.viewRate}%（全体${U.viewRate}%）`} />
                            <Metric label="送達率" value={`${selectedCo.usage.sentRate}%`} />
                            <Metric label="属性結合" value={`${selectedCo.matched.toLocaleString()}名`} />
                        </div>
                        <div className={styles.attrGrid}>
                            <Dist title="年代" items={selectedCo.ageBand} />
                            <Dist title="就業形態" items={selectedCo.employment} />
                            <Dist title="転職時期" items={selectedCo.timing} />
                            <Dist title="エリア（都道府県）" items={selectedCo.prefecture} max={8} />
                            <Dist title="保有免許・資格" items={selectedCo.licenses} max={10} />
                        </div>
                    </div>
                )}
            </div>

            <div className={styles.card}>
                <h2 className={styles.sectionTitle}>属性別の効果（送信 → スカウトページ閲覧率）</h2>
                <p className={styles.tableNote}>どの層に刺さっているか。閲覧率＝そのセグメント送信のうちスカウトページ閲覧に至った割合。※応募はscoutIdがフォーム送信前にURLから脱落するため直接計測不可（全応募クリック中scoutId付き0件）。成果指標は閲覧率まで。</p>
                <div className={styles.attrGrid}>
                    <FunnelTable title="年代" rows={S.funnelByAttr.ageBand} />
                    <FunnelTable title="大型免許" rows={S.funnelByAttr.license} />
                    <FunnelTable title="転職時期" rows={S.funnelByAttr.timing} />
                    <FunnelTable title="就業形態" rows={S.funnelByAttr.employment} />
                    <FunnelTable title="エリア" rows={S.funnelByAttr.prefecture} />
                </div>
            </div>

            <div className={styles.card}>
                <div className={styles.tableHeader}>
                    <h2 className={styles.sectionTitle}>求人別の送信先属性（上位{S.byJob.length}求人）</h2>
                    <button className={styles.pageBtn} onClick={() => setShowJobs((v) => !v)}>{showJobs ? '閉じる' : '表示'}</button>
                </div>
                {showJobs && (
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr><th>求人ID</th><th className={styles.num}>送信</th><th className={styles.num}>閲覧率</th><th>主な年代</th><th>主なエリア</th><th>主な免許</th></tr>
                            </thead>
                            <tbody>
                                {S.byJob.map((j) => (
                                    <tr key={j.jobId}>
                                        <td>{j.jobId}</td>
                                        <td className={styles.num}>{j.sends.toLocaleString()}</td>
                                        <td className={styles.num}>{pctOf(j.viewed, j.sends)}</td>
                                        <td>{summarize(j.ageBand)}</td>
                                        <td>{summarize(j.prefecture)}</td>
                                        <td>{summarize(j.licenses)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <p className={styles.note}>{S.note}</p>
        </>
    )
}
