'use client'

import { useMemo, useState } from 'react'
import BackLink from '@/components/BackLink'
import RelatedPages from '@/components/RelatedPages/RelatedPages'
import {
    PERSONA_SNAPSHOT_ASOF,
    PERSONA_BASE,
    PERSONA_OVERALL,
    PERSONA_DOMAINS,
    PERSONA_OCCUPATIONS,
    AGE_BANDS,
    GENDERS,
    TIMINGS,
    SITUATIONS,
    toShares,
    sumCounts,
    type Counts,
    type OccupationPersona,
} from '@/lib/constants/personaSnapshot'
import styles from './PersonaPage.module.css'

// 各軸の配色（左→右で意味づけ）
const AGE_COLORS = ['#38bdf8', '#22d3ee', '#34d399', '#fbbf24', '#fb923c', '#f87171']
const GENDER_COLORS: Record<string, string> = { '男性': '#60a5fa', '女性': '#f472b6', 'その他': '#9ca3af' }
const TIMING_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#6b7280', '#4b5563']
const SITUATION_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#a3e635', '#38bdf8', '#6b7280', '#374151']

const pct = (v: number) => `${(v * 100).toFixed(0)}%`
const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`

/** 100%積み上げ横棒＋凡例 */
function StackBar({ counts, labels, colors }: { counts: Counts; labels: readonly string[]; colors: string[] | Record<string, string> }) {
    const shares = toShares(counts, labels).filter((s) => s.count > 0)
    const colorOf = (label: string) =>
        Array.isArray(colors) ? colors[labels.indexOf(label)] ?? '#6b7280' : colors[label] ?? '#6b7280'
    return (
        <div className={styles.stackWrap}>
            <div className={styles.stackBar}>
                {shares.map((s) => (
                    <div
                        key={s.label}
                        className={styles.stackSeg}
                        style={{ width: pct(s.share), backgroundColor: colorOf(s.label) }}
                        title={`${s.label}: ${s.count.toLocaleString()}件 (${pct1(s.share)})`}
                    >
                        {s.share >= 0.08 ? pct(s.share) : ''}
                    </div>
                ))}
            </div>
            <div className={styles.legend}>
                {shares.map((s) => (
                    <span key={s.label} className={styles.legendItem}>
                        <i className={styles.dot} style={{ backgroundColor: colorOf(s.label) }} />
                        {s.label} <b>{pct(s.share)}</b>
                    </span>
                ))}
            </div>
        </div>
    )
}

/** 横棒ランキング（都道府県・雇用形態など） */
function RankBars({ items, color = '#818cf8', max }: { items: Array<{ label: string; count: number }>; color?: string; max?: number }) {
    const top = max ?? Math.max(...items.map((i) => i.count), 1)
    return (
        <div className={styles.rankList}>
            {items.map((it) => (
                <div key={it.label} className={styles.rankRow}>
                    <span className={styles.rankLabel}>{it.label}</span>
                    <div className={styles.rankTrack}>
                        <div className={styles.rankFill} style={{ width: pct(it.count / top), backgroundColor: color }} />
                    </div>
                    <span className={styles.rankVal}>{it.count.toLocaleString()}</span>
                </div>
            ))}
        </div>
    )
}

// 顕在層＝転職時期が3ヶ月以内までに入っている人の割合
const ACTIVE_TIMINGS = ['なるべく早く', '1ヶ月以内', '2ヶ月以内', '3ヶ月以内']
const activeShare = (timing: Counts) => {
    const total = sumCounts(timing, TIMINGS)
    return total > 0 ? ACTIVE_TIMINGS.reduce((s, l) => s + (timing[l] ?? 0), 0) / total : 0
}
const femaleShare = (gender: Counts) => {
    const total = sumCounts(gender, GENDERS)
    return total > 0 ? (gender['女性'] ?? 0) / total : 0
}
const youngShare = (age: Counts) => {
    const total = sumCounts(age, AGE_BANDS)
    return total > 0 ? ((age['10代'] ?? 0) + (age['20代'] ?? 0)) / total : 0
}

type AxisMode = 'domain' | 'occupation'

export default function PersonaPage() {
    const [axisMode, setAxisMode] = useState<AxisMode>('domain')
    const dataset: OccupationPersona[] = axisMode === 'domain' ? PERSONA_DOMAINS : PERSONA_OCCUPATIONS
    const [selectedByMode, setSelectedByMode] = useState<Record<AxisMode, string>>({
        domain: PERSONA_DOMAINS[0].occ,
        occupation: PERSONA_OCCUPATIONS[0].occ,
    })
    const selected = selectedByMode[axisMode]
    const setSelected = (occ: string) => setSelectedByMode((s) => ({ ...s, [axisMode]: occ }))
    const occ = useMemo(() => dataset.find((o) => o.occ === selected) ?? dataset[0], [dataset, selected])

    const overall = PERSONA_OVERALL
    const totalRegistered = PERSONA_BASE.ageFilled
    const maleShareOverall = (overall.gender['男性'] ?? 0) / sumCounts(overall.gender, GENDERS)
    const femaleShareOverall = (overall.gender['女性'] ?? 0) / sumCounts(overall.gender, GENDERS)
    const activeOverall = activeShare(overall.timing)
    const kantoShare = useMemo(() => {
        const kanto = ['東京都', '神奈川県', '埼玉県', '千葉県', '茨城県', '栃木県', '群馬県']
        const sum = overall.prefecture.filter((p) => kanto.includes(p.label)).reduce((s, p) => s + p.count, 0)
        const all = overall.prefecture.reduce((s, p) => s + p.count, 0)
        return sum / all
    }, [overall.prefecture])

    // 職種比較テーブル（女性比・若手比・顕在層比、母数）
    const occTable = useMemo(
        () =>
            dataset
                .map((o) => ({
                    occ: o.occ,
                    n: sumCounts(o.age, AGE_BANDS),
                    female: femaleShare(o.gender),
                    young: youngShare(o.age),
                    active: activeShare(o.timing),
                }))
                .sort((a, b) => b.n - a.n),
        [dataset]
    )

    const occN = sumCounts(occ.age, AGE_BANDS)
    const isDomain = axisMode === 'domain'

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>求職者属性・ペルソナ</h1>
                    <p className={styles.subtitle}>
                        Salesforce登録者（人材紹介側リード）の年齢層・性別・事業領域・転職意欲。事業領域ごとにどんな年齢・性別・顕在度の人が来ているかをペルソナ設計の土台として見ます。
                    </p>
                </div>
                <BackLink href="/">ダッシュボード</BackLink>
            </div>

            <div className={styles.notice}>
                <strong>読み方</strong>: これは<strong>登録者（人材紹介リード）</strong>の姿で、サイト訪問者全体ではありません。
                職種軸は<strong>事業領域（登録サービス）</strong>を主に使い、約{(PERSONA_BASE.serviceFilled / 10000).toFixed(0)}万件に付与済み＝ほぼ全登録者をカバー（<strong>ドライバーが最大領域</strong>）。
                「希望職種」への切替もできますが、そちらは約2万件で施工・製造系に偏り<strong>ドライバーは含まれません</strong>。各軸は母数（回答者）が異なるので割合はその軸内で計算しています。
                <strong>性別は63%しか埋まっていない</strong>（ドライバーは約56%）ため、女性比は性別回答者の部分集合上の値です。
                <span className={styles.asof}>スナップショット: {PERSONA_SNAPSHOT_ASOF} 時点（Salesforce CustomObject1__c）／事業領域=登録サービスを正規化、全登録者の100%をカバー</span>
            </div>

            <RelatedPages pages={[{ href: '/occupation', label: '職種別CV分析' }, { href: '/cv-types', label: '求人種別CV分析' }, { href: '/user', label: 'セグメント行動分析' }]} />

            {/* 全体サマリー */}
            <div className={styles.summaryRow}>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>登録者（年齢付与ベース）</span>
                    <span className={styles.summaryValue}>{totalRegistered.toLocaleString()}</span>
                    <span className={styles.summaryHint}>Field90__c 年齢層が入っている件数</span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>男性比率</span>
                    <span className={styles.summaryValue}>{pct(maleShareOverall)}</span>
                    <span className={styles.summaryHint}>女性 {pct(femaleShareOverall)}（性別回答63%ベース）／ ドライバー・現場系に強く偏る</span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>顕在層（3ヶ月以内）</span>
                    <span className={styles.summaryValue}>{pct(activeOverall)}</span>
                    <span className={styles.summaryHint}>残りは「未定」中心の潜在層</span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>首都圏比率</span>
                    <span className={styles.summaryValue}>{pct(kantoShare)}</span>
                    <span className={styles.summaryHint}>上位15都道府県中の1都6県</span>
                </div>
            </div>

            {/* 全体の分布 */}
            <div className={styles.grid2}>
                <div className={styles.card}>
                    <h2 className={styles.sectionTitle}>年齢層（全体）</h2>
                    <StackBar counts={overall.ageband} labels={AGE_BANDS} colors={AGE_COLORS} />
                    <p className={styles.cardNote}>40〜60代が約7割。一般的な転職媒体よりかなり高年齢寄り。</p>
                </div>
                <div className={styles.card}>
                    <h2 className={styles.sectionTitle}>性別×年齢</h2>
                    <div className={styles.subBar}>
                        <span className={styles.subBarLabel}>男性</span>
                        <StackBar counts={overall.genderByAge['男性']} labels={AGE_BANDS} colors={AGE_COLORS} />
                    </div>
                    <div className={styles.subBar}>
                        <span className={styles.subBarLabel}>女性</span>
                        <StackBar counts={overall.genderByAge['女性']} labels={AGE_BANDS} colors={AGE_COLORS} />
                    </div>
                    <p className={styles.cardNote}>男性は50〜60代が中心、女性は20〜50代に分散しやや若い。</p>
                </div>
                <div className={styles.card}>
                    <h2 className={styles.sectionTitle}>希望勤務地 上位15</h2>
                    <RankBars items={overall.prefecture} color="#818cf8" />
                </div>
                <div className={styles.card}>
                    <h2 className={styles.sectionTitle}>希望雇用形態</h2>
                    <RankBars items={Object.entries(overall.employment).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)} color="#34d399" />
                    <h2 className={styles.sectionTitle} style={{ marginTop: '1.25rem' }}>転職意欲（現在の気持ち）</h2>
                    <StackBar counts={overall.mood} labels={['近いうちに転職したい', '今は情報収集したい']} colors={['#f97316', '#6b7280']} />
                </div>
            </div>

            {/* 職種別ペルソナ */}
            <div className={styles.card}>
                <div className={styles.tableHead}>
                    <h2 className={styles.sectionTitle}>{isDomain ? '事業領域別ペルソナ' : '希望職種別ペルソナ（細分類）'}</h2>
                    <span className={styles.count}>{isDomain ? '登録サービス＝ほぼ全登録者。年齢・性別・顕在度・意欲の内訳が切り替わります' : '希望職種は約2万件・施工/製造系に偏りドライバー無し'}</span>
                </div>

                {/* 軸トグル */}
                <div className={styles.axisToggle}>
                    <button className={`${styles.toggleBtn} ${isDomain ? styles.toggleActive : ''}`} onClick={() => setAxisMode('domain')}>事業領域（登録サービス）</button>
                    <button className={`${styles.toggleBtn} ${!isDomain ? styles.toggleActive : ''}`} onClick={() => setAxisMode('occupation')}>希望職種（細分類）</button>
                </div>

                <div className={styles.chips}>
                    {dataset.map((o) => (
                        <button
                            key={o.occ}
                            className={`${styles.chip} ${selected === o.occ ? styles.chipActive : ''}`}
                            onClick={() => setSelected(o.occ)}
                        >
                            {o.occ}
                        </button>
                    ))}
                </div>

                <div className={styles.occHeadline}>
                    <span className={styles.occName}>{occ.occ}</span>
                    <span className={styles.occN}>母数 {occN.toLocaleString()}人（年齢付与ベース）</span>
                </div>

                <div className={styles.axisGrid}>
                    <div className={styles.axis}>
                        <span className={styles.axisTitle}>年齢層</span>
                        <StackBar counts={occ.age} labels={AGE_BANDS} colors={AGE_COLORS} />
                    </div>
                    <div className={styles.axis}>
                        <span className={styles.axisTitle}>性別</span>
                        <StackBar counts={occ.gender} labels={GENDERS} colors={GENDER_COLORS} />
                    </div>
                    <div className={styles.axis}>
                        <span className={styles.axisTitle}>転職時期（顕在度）</span>
                        <StackBar counts={occ.timing} labels={TIMINGS} colors={TIMING_COLORS} />
                    </div>
                    <div className={styles.axis}>
                        <span className={styles.axisTitle}>仕事の状況（転職意欲）</span>
                        <StackBar counts={occ.situation} labels={SITUATIONS} colors={SITUATION_COLORS} />
                    </div>
                </div>
            </div>

            {/* 職種横断の比較表 */}
            <div className={styles.card}>
                <div className={styles.tableHead}>
                    <h2 className={styles.sectionTitle}>{isDomain ? '事業領域横断サマリー' : '希望職種横断サマリー'}</h2>
                    <span className={styles.count}>女性比・若手(20代以下)比・顕在層(3ヶ月以内)比で性格を比較</span>
                </div>
                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>{isDomain ? '事業領域' : '希望職種'}</th>
                                <th className={styles.num}>母数</th>
                                <th className={styles.num}>女性比</th>
                                <th className={styles.num}>若手(〜20代)</th>
                                <th className={styles.num}>顕在層(3ヶ月内)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {occTable.map((r) => (
                                <tr key={r.occ} className={r.occ === selected ? styles.rowActive : ''} onClick={() => setSelected(r.occ)}>
                                    <td>{r.occ}</td>
                                    <td className={styles.num}>{r.n.toLocaleString()}</td>
                                    <td className={styles.num}>{pct1(r.female)}</td>
                                    <td className={styles.num}>{pct1(r.young)}</td>
                                    <td className={styles.num}>{pct1(r.active)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className={styles.tableNote}>
                    ※ 行クリックで上のペルソナが切り替わります。<br />
                    ※ 出典は Salesforce 求職者(CustomObject1__c)。事業領域は登録サービス(Field5__c)を正規化・合算したもの（ほぼ全登録者）。
                    「希望職種」は約2万件のみで施工/製造系に偏り<strong>ドライバーは構造的に含まれない</strong>ため、全体像は事業領域で見るのが正確です。
                    サイト訪問者全体の年齢・性別を見たい場合はGA4のデモグラフィック（別母集団・匿名）を参照。
                </p>
            </div>
        </div>
    )
}
