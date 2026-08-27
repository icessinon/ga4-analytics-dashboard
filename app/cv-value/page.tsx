'use client'

import { useCallback, useEffect, useState } from 'react'
import { useProduct } from '@/lib/contexts/ProductContext'
import BackLink from '@/components/BackLink'
import RelatedPages from '@/components/RelatedPages/RelatedPages'
import PeriodSelect, { usePeriodRange } from '@/components/PeriodSelect/PeriodSelect'
import { withCustomOption, PeriodOption } from '@/lib/utils/period'
import { parseJsonResponse } from '@/lib/utils/fetch'
import {
    CV_UNIT_VALUE_ASOF,
    CV_UNIT_VALUE_YEN,
    CV_UNIT_DERIVATIONS,
    cvValueYen,
    formatYenApprox,
} from '@/lib/constants/cvUnitValue'
import styles from './CvValuePage.module.css'

interface JobTypeRow {
    key: string
    label: string
    completed: number
}

interface CvTypesResponse {
    jobTypes: JobTypeRow[]
    signup: { completed: number }
    startDate: string
    endDate: string
}

interface ActualTypeRow { label: string; total: number }
interface ActualResponse {
    types: ActualTypeRow[]
    grandTotal: number
    signup: { standalone: number | null }
}

const PERIOD_OPTIONS: PeriodOption[] = [
    { value: '7daysAgo', label: '過去7日' },
    { value: '14daysAgo', label: '過去14日' },
    { value: '30daysAgo', label: '過去30日' },
    { value: '90daysAgo', label: '過去90日' },
]

const TYPE_COLORS: Record<string, string> = {
    JobR: '#60a5fa',
    JobH: '#fbbf24',
    JobA: '#f87171',
    signup: '#4ade80',
}

const ACTUAL_LABEL_TO_KEY: Record<string, string> = {
    '人材紹介': 'JobR',
    '求人広告': 'JobA',
    'ハローワーク': 'JobH',
}

function yen(v: number): string {
    return `¥${Math.round(v).toLocaleString()}`
}

export default function CvValuePage() {
    const { currentProduct } = useProduct()
    const periodState = usePeriodRange('30daysAgo')
    const { range } = periodState
    const [data, setData] = useState<CvTypesResponse | null>(null)
    const [actual, setActual] = useState<ActualResponse | null>(null)
    const [actualLoading, setActualLoading] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        if (!currentProduct?.ga4PropertyId || !range) return
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/cv-types', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    propertyId: currentProduct.ga4PropertyId,
                    startDate: range.startDate,
                    endDate: range.endDate,
                }),
            })
            const json = await parseJsonResponse<CvTypesResponse & { error?: string }>(res)
            if (!res.ok) throw new Error(json.error || '取得に失敗しました')
            setData(json)
            // DB実数（featured/CRM配信込み）は重いので別リクエスト
            setActualLoading(true)
            fetch('/api/applications/actual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ propertyId: currentProduct.ga4PropertyId, startDate: range.startDate, endDate: range.endDate }),
            })
                .then((r) => parseJsonResponse<ActualResponse & { error?: string }>(r).then((j) => { if (r.ok) setActual(j); else setActual(null) }))
                .catch(() => setActual(null))
                .finally(() => setActualLoading(false))
        } catch (e) {
            setError(e instanceof Error ? e.message : '取得に失敗しました')
            setData(null)
        } finally {
            setLoading(false)
        }
    }, [currentProduct?.ga4PropertyId, range])

    useEffect(() => { load() }, [load])

    // DB実数ベースの期間換算（featured込み・実態に近い）
    const actualRows = actual
        ? actual.types
            .filter((t) => ACTUAL_LABEL_TO_KEY[t.label])
            .map((t) => {
                const key = ACTUAL_LABEL_TO_KEY[t.label]
                return { key, label: t.label, count: t.total, value: cvValueYen(key, t.total) ?? 0 }
            })
        : []
    const actualSignup = actual?.signup.standalone != null
        ? { key: 'signup', label: '会員登録（単独）', count: actual.signup.standalone, value: cvValueYen('signup', actual.signup.standalone) ?? 0 }
        : null
    const actualTotal = actualRows.reduce((s, r) => s + r.value, 0) + (actualSignup?.value ?? 0)

    const hwUnit = CV_UNIT_VALUE_YEN.JobH
    const signupUnit = CV_UNIT_VALUE_YEN.signup

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>CV単価・お金まわり</h1>
                    <p className={styles.subtitle}>
                        応募・会員登録1件の期待売上（Salesforceの入社済受注額から算出した係数）と、期間のCV数を金額換算した早見ページです。
                        施策の価値比較・優先度判断の共通モノサシとして使います。
                    </p>
                </div>
                <BackLink href="/">ダッシュボード</BackLink>
            </div>

            {!currentProduct && <div className={styles.notice}>プロダクトを選択してください</div>}

            <RelatedPages pages={[{ href: '/cv-types', label: '求人種別CV分析' }, { href: '/signup-funnel', label: '会員登録フォームファネル' }, { href: '/insights', label: '月次インサイトレポート' }]} />

            <div className={styles.card}>
                <h2 className={styles.sectionTitle}>CV1件あたりの期待売上（{CV_UNIT_VALUE_ASOF} 算出）</h2>
                <div className={styles.summaryRow}>
                    {CV_UNIT_DERIVATIONS.map((d) => (
                        <div key={d.key} className={styles.summaryCard} style={{ borderTopColor: TYPE_COLORS[d.key] }}>
                            <span className={styles.summaryLabel}>{d.key === 'signup' ? '会員登録（単独）' : d.label}</span>
                            <span className={styles.summaryValue}>{yen(d.unitYen)}</span>
                            <span className={styles.summaryHint}>
                                {d.key === 'signup'
                                    ? `ハロワ応募の約${(d.unitYen / hwUnit).toFixed(1)}倍の価値`
                                    : `会員登録1件 ≒ ${d.label.replace(' 応募', '')}応募${(signupUnit / d.unitYen).toFixed(1)}件分`}
                            </span>
                        </div>
                    ))}
                </div>
                <p className={styles.tableNote}>
                    ※ 期待売上 = そのCVに紐づくCA活動履歴経由で生まれた入社済の受注額（−返金想定額）÷ CV件数。<strong>成約率 × 平均紹介手数料</strong>に分解できます
                    （例: 会員登録 = 成約率2.2% × 約83万円 ≒ 1.8万円）。<br />
                    ※ 期待値（平均）なので個々のCVに値札がつくわけではありません。「登録を月100件増やす施策 = 月180万円の売上増と同等」のように<strong>件数×単価で施策同士を比較する</strong>のが正しい使い方です。
                    受注額ベース（検収・入金ベースではありません）。詳しい読み方は<a href="/docs/glossary" style={{ color: '#93c5fd' }}>用語・ドメイン知識</a>参照。
                </p>
            </div>

            <div className={styles.card}>
                <h2 className={styles.sectionTitle}>算出ロジックの定義（そのまま共有可）</h2>
                <div className={styles.formula}>
                    <strong>期待売上</strong> ＝ CV件数 × CV単価（種別ごとの固定係数）<br />
                    <strong>CV単価</strong> ＝ 分子（Salesforce実測の売上）÷ 分母（同コホートのCV件数）
                </div>
                <div className={styles.defList}>
                    <div>
                        <div className={styles.defTerm}>分子（売上）= CVに紐づくCA活動履歴経由の入社済受注額</div>
                        <div className={styles.defBody}>
                            CVを起点とする<strong>CA活動履歴（<code>AgentActivityHistory__c</code>）</strong>に紐づくマッチング（<code>Matching__c.MA_AgentActivityHistory__c</code>）のうち、
                            フェーズ <code>Field2__c</code>=「<strong>7.入社済</strong>」の受注額 <code>MA_ClosingFee__c</code> − 返金想定額 <code>Estimated_refund_amount__c</code>。
                            経路は CV（<code>RegistHistory__c</code>）→ そのCVの <strong>CA活動履歴</strong> → 紐づくマッチング。受注額ベース（検収・入金ベースではない）。
                            <br />※ <strong>求職者単位で全マッチングを合算しない</strong>のが要点。同一求職者は平均約2.6件のCA活動履歴（別接点・別登録・後日の掘り起こし）を持つため、
                            求職者で束ねると<strong>測りたいCVと無関係な成約まで乗って過大評価</strong>になる。CVに対応するCA活動履歴に紐づく成約のみを数える。
                        </div>
                    </div>
                    <div>
                        <div className={styles.defTerm}>分母（件数）= そのコホートのCVイベント数</div>
                        <div className={styles.defBody}>
                            会員登録 = 登録履歴のCVイベント、応募 = 求職者 <code>CustomObject1__c</code> の <code>CO1_DRMOrderType__c</code>（人材紹介 / 求人広告 / ハローワーク）で種別判定した応募イベント数。
                            コホートは登録日 2025-01〜2026-05（会員登録のみ 2025-08〜2026-05）、成約リードタイム確保のため直近2ヶ月は除外。
                        </div>
                    </div>
                    <div>
                        <div className={styles.defTerm}>データソースの注記：BigQueryではなくSalesforce</div>
                        <div className={styles.defBody}>
                            この単価はBigQueryのライブ集計ではなく、<strong>{CV_UNIT_VALUE_ASOF} にSalesforce実測から一度算出した固定係数</strong>です（<code>lib/constants/cvUnitValue.ts</code> に定義、全ページ共通）。
                            BigQueryはGA4のセッション・イベント集計に使いますが、<strong>単価の分子（売上）には使っていません</strong>。市況・成約率・手数料相場が動くため四半期に1回程度の再算出を推奨。
                        </div>
                    </div>
                    <div>
                        <div className={styles.defTerm}>なぜ種別で数倍の差が出るか＝成約率の差（手数料単価ではない）</div>
                        <div className={styles.defBody}>
                            平均紹介手数料は各種別とも約73〜83万円で大差ありません。差はほぼ<strong>成約率</strong>由来です。会員登録者はCA提案エンジンに乗る（登録→面談は平均3.4日・約41%が面談到達）ため成約率2.2%、
                            一方ハローワーク応募者はゲストのまま応募止まりで成約率0.39%。この約6.5倍差が単価差（1.8万円 vs 2,800円）の正体です。
                        </div>
                    </div>
                    <div className={styles.defFlag}>
                        <div className={styles.defTerm}>要注意：下記の係数値は旧集計で再算出待ち（過大評価の可能性）</div>
                        <div className={styles.defBody}>
                            現在表示している単価（{CV_UNIT_VALUE_ASOF} 算出）は、上記の正しい定義ではなく<strong>旧「求職者単位で入社済を合算」する方法</strong>で出した暫定値です。
                            上で述べたとおり求職者単位はCVと無関係な成約を含むため<strong>実際より高く出ている可能性が高く</strong>、CA活動履歴基準で再算出予定です（特に会員登録・人材紹介は下振れ方向の見込み）。<br />
                            あわせて、会員登録CVとSalesforce求職者の紐付けは電話番号・メール一致ベースで現状<strong>約50%が未紐付け</strong>の不整合があり（分子の追跡精度に影響）、
                            紐付け定義の確定・Zapier起因の取りこぼし調査も継続中。
                            また求人広告（JobA）は入社29件の小標本で、含むのは<strong>紹介パスアップ成約のみ・広告の掲載課金売上は含まない</strong>点に注意。
                        </div>
                    </div>
                </div>
            </div>

            <div className={styles.card}>
                <h2 className={styles.sectionTitle}>期間のCVを金額換算</h2>
                <div className={styles.controls}>
                    <PeriodSelect
                        state={periodState}
                        options={withCustomOption(PERIOD_OPTIONS)}
                        selectClassName={styles.select}
                        noteClassName={styles.periodNote}
                        resolved={data}
                    />
                </div>

                {loading && <p className={styles.loading}>読み込み中...</p>}
                {error && <div className={styles.error}>{error}</div>}

                {data && !loading && (
                    <>
                        <h3 className={styles.summaryLabel} style={{ marginBottom: '0.5rem' }}>① 応募の全体像ベース（DB実数・featured/CRM配信込み）</h3>
                        {actualLoading && <p className={styles.loading}>本体DBから集計中...（十数秒かかります）</p>}
                        {!actualLoading && !actual && <p className={styles.loading}>DB実数を取得できませんでした（下のGA4ベースを参照）</p>}
                        {actual && !actualLoading && (
                            <div className={styles.tableWrapper}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>CV種別</th>
                                            <th className={styles.num}>件数</th>
                                            <th className={styles.num}>単価</th>
                                            <th className={styles.num}>期待売上換算</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {actualRows.map((r) => (
                                            <tr key={r.key}>
                                                <td><span className={styles.typeDot} style={{ background: TYPE_COLORS[r.key] }} />{r.label}</td>
                                                <td className={styles.num}>{r.count.toLocaleString()}</td>
                                                <td className={styles.num}>{yen(CV_UNIT_VALUE_YEN[r.key])}</td>
                                                <td className={`${styles.num} ${styles.yen}`}>{yen(r.value)}</td>
                                            </tr>
                                        ))}
                                        {actualSignup && (
                                            <tr>
                                                <td><span className={styles.typeDot} style={{ background: TYPE_COLORS.signup }} />{actualSignup.label}</td>
                                                <td className={styles.num}>{actualSignup.count.toLocaleString()}</td>
                                                <td className={styles.num}>{yen(signupUnit)}</td>
                                                <td className={`${styles.num} ${styles.yen}`}>{yen(actualSignup.value)}</td>
                                            </tr>
                                        )}
                                        <tr className={styles.totalRow}>
                                            <td>合計</td>
                                            <td className={styles.num}>－</td>
                                            <td className={styles.num}>－</td>
                                            <td className={`${styles.num} ${styles.yen}`}>{yen(actualTotal)}（{formatYenApprox(actualTotal)}）</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <h3 className={styles.summaryLabel} style={{ margin: '1.25rem 0 0.5rem' }}>② サイト内フォームベース（GA4・自然応募のみ）</h3>
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>CV種別</th>
                                        <th className={styles.num}>件数</th>
                                        <th className={styles.num}>単価</th>
                                        <th className={styles.num}>期待売上換算</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.jobTypes.map((t) => (
                                        <tr key={t.key}>
                                            <td><span className={styles.typeDot} style={{ background: TYPE_COLORS[t.key] }} />{t.label}</td>
                                            <td className={styles.num}>{t.completed.toLocaleString()}</td>
                                            <td className={styles.num}>{yen(CV_UNIT_VALUE_YEN[t.key])}</td>
                                            <td className={`${styles.num} ${styles.yen}`}>{yen(cvValueYen(t.key, t.completed) ?? 0)}</td>
                                        </tr>
                                    ))}
                                    <tr>
                                        <td><span className={styles.typeDot} style={{ background: TYPE_COLORS.signup }} />会員登録（完了）</td>
                                        <td className={styles.num}>{data.signup.completed.toLocaleString()}</td>
                                        <td className={styles.num}>{yen(signupUnit)}</td>
                                        <td className={`${styles.num} ${styles.yen}`}>{yen(cvValueYen('signup', data.signup.completed) ?? 0)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <p className={styles.tableNote}>
                            ※ ①はDynamoDB実応募（自然 + featured/CRM配信 + CA紹介 + スカウト）で、単価係数の分母（Salesforceの応募イベント）と揃った実態ベース。
                            ②はGA4のサイト内フォーム完了のみで、サイト改善施策のインパクト試算に使いやすい数字です。<br />
                            ※ 会員登録の単価は「応募を伴わない単独登録」の係数。応募と同時の登録は応募側の単価に含まれるため二重計上しません。
                        </p>
                    </>
                )}
            </div>

            <div className={styles.card}>
                <h2 className={styles.sectionTitle}>単価の算出根拠（Salesforce実測）</h2>
                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>CV種別</th>
                                <th>コホート（登録日）</th>
                                <th className={styles.num}>CV件数</th>
                                <th className={styles.num}>人数</th>
                                <th className={styles.num}>入社成約</th>
                                <th className={styles.num}>受注額−返金</th>
                                <th className={styles.num}>単価</th>
                                <th>備考</th>
                            </tr>
                        </thead>
                        <tbody>
                            {CV_UNIT_DERIVATIONS.map((d) => (
                                <tr key={d.key}>
                                    <td><span className={styles.typeDot} style={{ background: TYPE_COLORS[d.key] }} />{d.label}</td>
                                    <td>{d.cohort}</td>
                                    <td className={styles.num}>{d.events.toLocaleString()}</td>
                                    <td className={styles.num}>{d.uniq.toLocaleString()}</td>
                                    <td className={styles.num}>{d.hires.toLocaleString()}件（{((d.hires / d.uniq) * 100).toFixed(2)}%/人）</td>
                                    <td className={styles.num}>{formatYenApprox(d.grossFeeYen - d.refundYen)}</td>
                                    <td className={`${styles.num} ${styles.yen}`}>{yen(d.unitYen)}</td>
                                    <td className={styles.noteCell}>{d.note}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className={styles.tableNote}>
                    ※ {CV_UNIT_VALUE_ASOF} にSalesforce（登録履歴 → 求職者 → マッチング「7.入社済」の受注額−返金想定額）から算出。
                    成約リードタイム確保のため直近2ヶ月の登録は除外したコホートです。<br />
                    ※ 参考: 事業全体の平均手数料は約100万円/件（直近12ヶ月・月400〜600件入社・緩やかな上昇傾向）。Web経由コホートの平均が2〜3割低いのは、DRスカウト・エージェント経由など高単価領域が全体に含まれるためで、係数にはWeb経由の実績値を使っています。<br />
                    ※ 市況・成約率・手数料相場が変わるため、<strong>四半期に1回程度の再算出を推奨</strong>します（手順は lib/constants/cvUnitValue.ts のコメント参照）。
                </p>
            </div>
        </div>
    )
}
