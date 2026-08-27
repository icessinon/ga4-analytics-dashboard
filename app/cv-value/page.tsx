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
                    （例: 会員登録 = 成約率2.3% × 約89万円 ≒ 2.0万円）。<br />
                    ※ 期待値（平均）なので個々のCVに値札がつくわけではありません。「登録を月100件増やす施策 = 月約200万円の売上増と同等」のように<strong>件数×単価で施策同士を比較する</strong>のが正しい使い方です。
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
                            会員登録 = 登録履歴のCVイベント（応募を伴わない純登録）、応募 = 登録履歴 <code>RegistHistory__c</code> の <code>RH_DRMOrderType__c</code>（人材紹介 / 求人広告 / ハローワーク）で種別判定した応募イベント数。
                            コホートは登録日 2025-01〜2025-12（会員登録のみ 2025-08〜2025-12）。成約リードタイム確保のため<strong>登録上限を2025-12に固定</strong>（直近コホートは入社が未成熟で単価が過小になるため）。
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
                        <div className={styles.defTerm}>ハロワ・求人広告の売上主体は「CAによる人材紹介案件への再マッチ」</div>
                        <div className={styles.defBody}>
                            重要なのは、応募した求人そのものの成約ではなく<strong>CAが応募者を別求人（特に人材紹介案件）へ再マッチして生んだ成約</strong>が売上の主体という点です。
                            実際、ハローワーク応募者の入社はHW求人（成約手数料ゼロ）ではほぼ発生せず、<strong>大半が人材紹介案件への再マッチ成約</strong>。求人広告応募者も同様。
                            <br />※ 旧版は「応募求人の成約だけ」を見てこの再マッチ売上を取りこぼし、応募系を過小評価していました。CA活動履歴基準で是正した結果、
                            種別間の単価差は大きく縮小（会員登録¥19,760／人材紹介¥15,850／求人広告¥18,602／ハローワーク¥8,726）しています。
                        </div>
                    </div>
                    <div>
                        <div className={styles.defTerm}>二重計上の除去（応募3種別）</div>
                        <div className={styles.defBody}>
                            複数チャネルで登録した人（例: 求人広告と人材紹介の両方で登録）の入社は、そのままだと両方の売上に二重計上されます。
                            そこで応募3種別は<strong>優先度 人材紹介 &gt; 求人広告 &gt; ハローワーク で同一入社を1回だけに寄せて</strong>除去しています
                            （求人広告は人材紹介と重複する18件、ハローワークは人材紹介・求人広告と重複する分を除外）。
                            <br />※ 会員登録は「登録が後日の応募・成約に効く」下流価値の指標のため、応募との重複（87件中32件）を許容して据え置き。
                            <strong>種別を足し上げるときだけ重複に注意</strong>（単一チャネル内の施策比較には影響しません）。
                        </div>
                    </div>
                    <div className={styles.defFlag}>
                        <div className={styles.defTerm}>前提・注意点</div>
                        <div className={styles.defBody}>
                            <strong>直近コホートは入社が未成熟</strong>。登録上限を2025-12に固定して成約リードタイムを確保していますが、それでも新しい登録ほど分子（実現入社）が積み上がり中で単価は保守的（過小）に出ます。<br />
                            <strong>会員登録CVとSalesforce求職者の紐付けは約50%が未紐付け</strong>（電話番号・メール一致ベース）の不整合があり、分子の追跡精度に影響しうる。紐付け定義の確定・Zapier起因の取りこぼし調査は継続中。<br />
                            <strong>求人広告（JobA）は入社68件・会員登録は87件と小標本</strong>で振れやすい。返金は「返金想定額」で確定額ではないため純受注額は保守的。市況・成約率が動くため四半期に1回程度の再算出を推奨。
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
                    ※ {CV_UNIT_VALUE_ASOF} にSalesforce（登録履歴 → CA活動履歴 → 紐づくマッチング「7.入社済」の受注額−返金想定額）から算出。
                    登録上限を2025-12に固定し成約リードタイムを確保したコホートです。<br />
                    ※ 参考: 事業全体の平均手数料は約100万円/件（直近12ヶ月・月400〜600件入社・緩やかな上昇傾向）。Web経由コホートの平均が2〜3割低いのは、DRスカウト・エージェント経由など高単価領域が全体に含まれるためで、係数にはWeb経由の実績値を使っています。<br />
                    ※ 市況・成約率・手数料相場が変わるため、<strong>四半期に1回程度の再算出を推奨</strong>します（手順は lib/constants/cvUnitValue.ts のコメント参照）。
                </p>
            </div>
        </div>
    )
}
