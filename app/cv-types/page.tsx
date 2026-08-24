'use client'

import { useCallback, useEffect, useState } from 'react'
import { useProduct } from '@/lib/contexts/ProductContext'
import BackLink from '@/components/BackLink'
import RelatedPages from '@/components/RelatedPages/RelatedPages'
import CvTypesTrendChart, { type DailyPoint } from '@/components/cv-types/CvTypesTrendChart'
import PeriodSelect, { usePeriodRange } from '@/components/PeriodSelect/PeriodSelect'
import { withCustomOption, PeriodOption } from '@/lib/utils/period'
import { parseJsonResponse } from '@/lib/utils/fetch'
import { CV_UNIT_VALUE_ASOF, cvValueYen, formatYenApprox } from '@/lib/constants/cvUnitValue'
import styles from './CvTypesPage.module.css'

interface JobTypeRow {
    key: string
    label: string
    detailViews: number
    formViews: number
    completed: number
    detailToForm: number | null
    formToComplete: number | null
    overallRate: number | null
    channels?: { organic: number; direct: number; crm: number; paid: number; other: number }
    viaList?: number
    viaListRate?: number | null
    fields?: Array<{ name: string; users: number }>
}

interface ActualCell { member: number; guest: number }
interface ActualTypeRow {
    label: string
    layers: { natural: ActualCell; featured: ActualCell; scout: ActualCell; caReferral: ActualCell; other: ActualCell }
    total: number
}
interface ActualResponse {
    startDate: string
    endDate: string
    types: ActualTypeRow[]
    grandTotal: number
    memberTotal: number
    guestTotal: number
    signup: { withApplication: number; withApplicationByType: Record<string, number>; standalone: number | null; unknownUserApps: number }
}

interface RouteFunnelSide { detail: number; form: number; complete: number }
interface RouteFunnelType { key: string; label: string; viaList: RouteFunnelSide; direct: RouteFunnelSide }
interface RouteFunnelResponse {
    startDate: string
    endDate: string
    listUsers: number
    types: RouteFunnelType[]
    totals: { viaList: RouteFunnelSide; direct: RouteFunnelSide }
}

interface CvTypesResponse {
    jobTypes: JobTypeRow[]
    listViews?: number
    channelMix?: Array<{ channel: string; sessions: number; users: number }>
    signup: { formViews: number; completed: number; formToComplete: number | null }
    daily: DailyPoint[]
    startDate: string
    endDate: string
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

function pct(v: number | null): string {
    return v != null ? `${(v * 100).toFixed(1)}%` : '－'
}

export default function CvTypesPage() {
    const { currentProduct } = useProduct()
    const periodState = usePeriodRange('30daysAgo')
    const { range } = periodState
    const [data, setData] = useState<CvTypesResponse | null>(null)
    const [actual, setActual] = useState<ActualResponse | null>(null)
    const [actualLoading, setActualLoading] = useState(false)
    const [routeFunnel, setRouteFunnel] = useState<RouteFunnelResponse | null>(null)
    const [routeLoading, setRouteLoading] = useState(false)
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
            // DB実数（重めなので別リクエスト・失敗してもページ全体は落とさない）
            setActualLoading(true)
            fetch('/api/applications/actual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ propertyId: currentProduct.ga4PropertyId, startDate: range.startDate, endDate: range.endDate }),
            })
                .then((r) => parseJsonResponse<ActualResponse & { error?: string }>(r).then((j) => { if (r.ok) setActual(j); else setActual(null) }))
                .catch(() => setActual(null))
                .finally(() => setActualLoading(false))
            // 経路別ファネル（GA4ファネルAPI・遅め）
            setRouteLoading(true)
            fetch('/api/cv-types/route-funnel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ propertyId: currentProduct.ga4PropertyId, startDate: range.startDate, endDate: range.endDate }),
            })
                .then((r) => parseJsonResponse<RouteFunnelResponse & { error?: string }>(r).then((j) => { if (r.ok) setRouteFunnel(j); else setRouteFunnel(null) }))
                .catch(() => setRouteFunnel(null))
                .finally(() => setRouteLoading(false))
        } catch (e) {
            setError(e instanceof Error ? e.message : '取得に失敗しました')
            setData(null)
        } finally {
            setLoading(false)
        }
    }, [currentProduct?.ga4PropertyId, range])

    useEffect(() => { load() }, [load])

    const totalApply = data ? data.jobTypes.reduce((s, t) => s + t.completed, 0) : 0

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>求人種別CV分析</h1>
                    <p className={styles.subtitle}>
                        応募CVを契約種別（人材紹介 / 求人広告 / ハローワーク）に分解し、会員登録と並べて状況を確認します。種別はGTMラベル（JobR / JobA / JobH）ベースです。
                    </p>
                </div>
                <BackLink href="/">ダッシュボード</BackLink>
            </div>

            {!currentProduct && <div className={styles.notice}>プロダクトを選択してください</div>}

            <RelatedPages pages={[{ href: '/cv-value', label: 'CV単価・お金まわり' }, { href: '/occupation', label: '職種別CV分析' }, { href: '/apply-fields', label: '応募フォーム項目別タップ' }, { href: '/pageflow', label: 'ページフロー分析' }, { href: '/funnel/path', label: '経路ファネルビルダー' }]} />

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
                    <div className={styles.summaryRow}>
                        {data.jobTypes.map((t) => (
                            <div key={t.key} className={styles.summaryCard} style={{ borderTopColor: TYPE_COLORS[t.key] }}>
                                <span className={styles.summaryLabel}>{t.label}（応募完了）</span>
                                <span className={styles.summaryValue}>{t.completed.toLocaleString()}</span>
                                <span className={styles.summaryYen}>{formatYenApprox(cvValueYen(t.key, t.completed) ?? 0)}</span>
                                <span className={styles.summaryHint}>
                                    サイト内フォーム応募の構成比 {totalApply > 0 ? `${((t.completed / totalApply) * 100).toFixed(0)}%` : '－'}
                                </span>
                            </div>
                        ))}
                        <div className={styles.summaryCard} style={{ borderTopColor: TYPE_COLORS.signup }}>
                            <span className={styles.summaryLabel}>会員登録（完了）</span>
                            <span className={styles.summaryValue}>{data.signup.completed.toLocaleString()}</span>
                            <span className={styles.summaryYen}>{formatYenApprox(cvValueYen('signup', data.signup.completed) ?? 0)}</span>
                            <span className={styles.summaryHint}>フォーム→完了 {pct(data.signup.formToComplete)}</span>
                        </div>
                    </div>
                    <p className={styles.yenNote}>
                        ※ 金額 = 期待売上換算（入社済の受注額−返金想定。Salesforce {CV_UNIT_VALUE_ASOF} 算出の係数）:
                        人材紹介 約5,300円/応募・求人広告 約7,800円/応募（紹介パスアップ成約分のみ、掲載課金は含まず）・ハローワーク 約2,800円/応募・
                        会員登録 約1.8万円/登録（応募を伴わない単独登録。登録者の2.3%がその後入社）。1件の価値比較用の概算です。
                    </p>

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>求人種別ファネル（求人詳細 → 応募フォーム → 完了）</h2>
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>種別</th>
                                        <th className={styles.num}>求人詳細閲覧</th>
                                        <th className={styles.num}>→ フォーム</th>
                                        <th className={styles.num}>→ 完了</th>
                                        <th className={styles.num}>詳細→フォーム</th>
                                        <th className={styles.num}>フォーム→完了</th>
                                        <th className={styles.num}>詳細→完了</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.jobTypes.map((t) => (
                                        <tr key={t.key}>
                                            <td>
                                                <span className={styles.typeDot} style={{ background: TYPE_COLORS[t.key] }} />
                                                {t.label}
                                            </td>
                                            <td className={styles.num}>{t.detailViews.toLocaleString()}</td>
                                            <td className={styles.num}>{t.formViews.toLocaleString()}</td>
                                            <td className={styles.num}>{t.completed.toLocaleString()}</td>
                                            <td className={styles.num}>{pct(t.detailToForm)}</td>
                                            <td className={styles.num}>{pct(t.formToComplete)}</td>
                                            <td className={`${styles.num} ${styles.strong}`}>{pct(t.overallRate)}</td>
                                        </tr>
                                    ))}
                                    <tr className={styles.signupRow}>
                                        <td>
                                            <span className={styles.typeDot} style={{ background: TYPE_COLORS.signup }} />
                                            会員登録（参考: フォーム → 完了）
                                        </td>
                                        <td className={styles.num}>－</td>
                                        <td className={styles.num}>{data.signup.formViews.toLocaleString()}</td>
                                        <td className={styles.num}>{data.signup.completed.toLocaleString()}</td>
                                        <td className={styles.num}>－</td>
                                        <td className={styles.num}>{pct(data.signup.formToComplete)}</td>
                                        <td className={styles.num}>－</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <p className={styles.tableNote}>
                            ※ 完了は応募フォームの<strong>送信ボタンクリック</strong>（クリックラベル）ベースのユーザー数です。送信ボタンは入力完了までdisabledのため
                            「クリック＝応募実行」であり、DBの実応募数と一致することを確認済み（botの影響も受けません）。<br />
                            ※ 求人詳細・フォームはビューラベル（50%×1秒表示）ベースのため、1〜2割の取りこぼしがあります。<br />
                            ※ スカウト・featured経由の応募（別フォーム、GTMラベル未実装）はこの表に含まれません。サイト内フォームからの応募のみです。<br />
                            ※ 会員登録はページベース（/members/signup → /members/signup/thanks）。求人広告応募時の自動会員化はここに含まれません。
                        </p>
                    </div>

                    {data.channelMix && data.channelMix.length > 0 && (() => {
                        const totalSessions = data.channelMix.reduce((s, c) => s + c.sessions, 0)
                        return (
                            <div className={styles.card}>
                                <h2 className={styles.sectionTitle}>サイト全体の流入チャネル構成（セッション）</h2>
                                <div className={styles.tableWrapper}>
                                    <table className={styles.table}>
                                        <thead>
                                            <tr>
                                                <th>チャネル</th>
                                                <th className={styles.num}>セッション</th>
                                                <th className={styles.num}>構成比</th>
                                                <th className={styles.num}>ユーザー</th>
                                                <th style={{ width: '35%' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.channelMix.map((c) => (
                                                <tr key={c.channel}>
                                                    <td>{c.channel}</td>
                                                    <td className={styles.num}>{c.sessions.toLocaleString()}</td>
                                                    <td className={`${styles.num} ${styles.strong}`}>{totalSessions > 0 ? `${((c.sessions / totalSessions) * 100).toFixed(1)}%` : '－'}</td>
                                                    <td className={styles.num}>{c.users.toLocaleString()}</td>
                                                    <td>
                                                        <span style={{ display: 'inline-block', height: '0.625rem', borderRadius: '0.25rem', background: '#60a5fa', width: `${totalSessions > 0 ? (c.sessions / totalSessions) * 100 : 0}%` }} />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className={styles.tableNote}>
                                    ※ GA4のデフォルトチャネルグループ（セッション基準・ラストタッチ）。オーガニックの「価値」はこの構成比より重い点に注意
                                    （サイト経由の純会員登録の約9割がオーガニック起点＝ファーストタッチ。ラストタッチではDirect等に分類される）。<br />
                                    ※ <strong>2026-08-11以降はUnassignedが異常に膨らむ計測インシデントが発生中</strong>。解決までこの期間を含む構成比は参考値です。
                                </p>
                            </div>
                        )
                    })()}

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>求人詳細の流入内訳（チャネル × 一覧経由）</h2>
                        {data.listViews != null && (
                            <p className={styles.periodNote}>
                                一覧ページ（検索・職種一覧）の閲覧: {data.listViews.toLocaleString()} ユーザー
                                ／ うち詳細へ進んだ人数は下表の「一覧経由」列
                            </p>
                        )}
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>種別</th>
                                        <th className={styles.num}>詳細閲覧</th>
                                        <th className={styles.num}>SEO（自然検索）</th>
                                        <th className={styles.num}>Direct</th>
                                        <th className={styles.num}>CRM(SMS/メール)</th>
                                        <th className={styles.num}>広告</th>
                                        <th className={styles.num}>その他</th>
                                        <th className={styles.num}>一覧経由</th>
                                        <th className={styles.num}>直接着地</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.jobTypes.map((t) => {
                                        const ch = t.channels
                                        const chTotal = ch ? ch.organic + ch.direct + ch.crm + ch.paid + ch.other : 0
                                        const cell = (v: number) => (
                                            <>
                                                {v.toLocaleString()}
                                                <span className={styles.chPct}>{chTotal > 0 ? ` (${((v / chTotal) * 100).toFixed(0)}%)` : ''}</span>
                                            </>
                                        )
                                        return (
                                            <tr key={t.key}>
                                                <td>
                                                    <span className={styles.typeDot} style={{ background: TYPE_COLORS[t.key] }} />
                                                    {t.label}
                                                </td>
                                                <td className={styles.num}>{t.detailViews.toLocaleString()}</td>
                                                <td className={styles.num}>{ch ? cell(ch.organic) : '－'}</td>
                                                <td className={styles.num}>{ch ? cell(ch.direct) : '－'}</td>
                                                <td className={styles.num}>{ch ? cell(ch.crm) : '－'}</td>
                                                <td className={styles.num}>{ch ? cell(ch.paid) : '－'}</td>
                                                <td className={styles.num}>{ch ? cell(ch.other) : '－'}</td>
                                                <td className={`${styles.num} ${styles.strong}`}>
                                                    {(t.viaList ?? 0).toLocaleString()}
                                                    <span className={styles.chPct}>{t.viaListRate != null ? ` (${(t.viaListRate * 100).toFixed(0)}%)` : ''}</span>
                                                </td>
                                                <td className={styles.num}>
                                                    {Math.max(0, t.detailViews - (t.viaList ?? 0)).toLocaleString()}
                                                    <span className={styles.chPct}>{t.detailViews > 0 ? ` (${(((t.detailViews - (t.viaList ?? 0)) / t.detailViews) * 100).toFixed(0)}%)` : ''}</span>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <p className={styles.tableNote}>
                            ※ SEO（自然検索）= GA4のOrganic Search（Google/Yahoo等の検索結果からの流入。広告=Paid検索とは別）。CRM = SMS + Email + Push。<br />
                            ※ チャネル5列（SEO/Direct/CRM/広告/その他）は「サイトに来たきっかけ」で、合計が詳細閲覧と一致します。Direct = 参照元不明（URL直打ち・ブックマーク・アプリ内ブラウザ等でreferrer欠落）、その他 = Referral（他サイトのリンク）・Organic Social・Unassigned等。<br />
                            ※ <strong>「一覧経由」はチャネルとは別軸で重複します</strong>（サイト内で直前に検索・職種一覧ページを見ていた人。例: SEOで一覧に着地→詳細の人はSEOにも一覧経由にも入る）。横に足せるのはチャネル5列まで。リファラー近似のため、間に別ページを挟んだ遷移は含まれません。<br />
                            ※ 直接着地 = 詳細閲覧 −一覧経由（一覧を通らずに詳細へ来た人。SEO・Direct・CRM等）。ハローワークは直接着地が約8割＝SEOで1ページだけ見に来る層が主体、人材紹介・求人広告はサイト内回遊（一覧経由）が約4割、といった「詳細への来方」の違いを見るための表です。
                        </p>
                    </div>

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>経路別ファネル（一覧経由 vs 直接着地）</h2>
                        {routeLoading && <p className={styles.loading}>GA4ファネルAPIで集計中...</p>}
                        {!routeLoading && !routeFunnel && <p className={styles.loading}>経路別ファネルを取得できませんでした</p>}
                        {routeFunnel && !routeLoading && (() => {
                            const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '－')
                            const row = (label: string, side: RouteFunnelSide, colorKey?: string, strong?: boolean) => (
                                <tr key={label} className={strong ? styles.signupRow : undefined}>
                                    <td>
                                        {colorKey && <span className={styles.typeDot} style={{ background: TYPE_COLORS[colorKey] }} />}
                                        {label}
                                    </td>
                                    <td className={styles.num}>{side.detail.toLocaleString()}</td>
                                    <td className={styles.num}>{side.form.toLocaleString()}</td>
                                    <td className={styles.num}>{side.complete.toLocaleString()}</td>
                                    <td className={`${styles.num} ${styles.strong}`}>{pct(side.form, side.detail)}</td>
                                    <td className={styles.num}>{pct(side.complete, side.form)}</td>
                                    <td className={`${styles.num} ${styles.strong}`}>{pct(side.complete, side.detail)}</td>
                                </tr>
                            )
                            return (
                                <>
                                    <p className={styles.periodNote}>
                                        一覧（検索・職種一覧）閲覧: {routeFunnel.listUsers.toLocaleString()} ユーザー。ここから各種別の詳細へ進んだのが「一覧経由」。
                                    </p>
                                    <div className={styles.tableWrapper}>
                                        <table className={styles.table}>
                                            <thead>
                                                <tr>
                                                    <th>種別 × 経路</th>
                                                    <th className={styles.num}>求人詳細</th>
                                                    <th className={styles.num}>→ フォーム</th>
                                                    <th className={styles.num}>→ 完了</th>
                                                    <th className={styles.num}>詳細→フォーム</th>
                                                    <th className={styles.num}>フォーム→完了</th>
                                                    <th className={styles.num}>詳細→完了</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {routeFunnel.types.flatMap((t) => [
                                                    row(`${t.label}・一覧経由`, t.viaList, t.key),
                                                    row(`${t.label}・直接着地`, t.direct, t.key),
                                                ])}
                                                {row('合計・一覧経由', routeFunnel.totals.viaList, undefined, true)}
                                                {row('合計・直接着地', routeFunnel.totals.direct, undefined, true)}
                                            </tbody>
                                        </table>
                                    </div>
                                    <p className={styles.tableNote}>
                                        ※ GA4クローズドファネル（順序付き・country=Japan適用）。詳細=DL__Media__Area__種別、フォーム=EF__種別__Area__Header（ビューラベル基準のため上の求人種別ファネルと同じ定義・視認条件で少なめに出ます）。<br />
                                        ※ 「直接着地」= 全体 − 一覧経由 の差分推定（両経路を踏んだ人は一覧経由側に計上）。<br />
                                        ※ 一覧経由（サイト内で比較検討した人）は直接着地よりフォーム遷移率が数倍高い「濃い経路」。直接着地層はその場の応募より会員化（モザイク施策等）が向く、という判断材料になります。
                                    </p>
                                </>
                            )
                        })()}
                    </div>

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>応募フォームの項目別タップ（着手）</h2>
                        <p className={styles.tableNote} style={{ marginTop: 0 }}>
                            種別ごとに「どの入力項目がどれだけタップ（着手）されているか」の発火数は、専用ページに移しました。フォーム完了率（CVR）と項目別バーをまとめて確認できます。<br />
                            → <a href="/apply-fields" style={{ color: '#93c5fd', textDecoration: 'underline' }}>応募フォーム 項目別タップ計測</a>
                        </p>
                    </div>

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>応募の全体像（DB実数・featured/CRM配信を含む）</h2>
                        {actualLoading && <p className={styles.loading}>本体DBから集計中...（十数秒かかります）</p>}
                        {!actualLoading && !actual && <p className={styles.loading}>DB実数を取得できませんでした</p>}
                        {actual && !actualLoading && (
                            <>
                                <div className={styles.tableWrapper}>
                                    <table className={styles.table}>
                                        <thead>
                                            <tr>
                                                <th>種別</th>
                                                <th className={styles.num}>自然応募（サイト内）</th>
                                                <th className={styles.num}>featured（CRM配信）</th>
                                                <th className={styles.num}>CA紹介</th>
                                                <th className={styles.num}>スカウト</th>
                                                <th className={styles.num}>合計</th>
                                                <th className={styles.num}>構成比</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {actual.types.map((t) => {
                                                const cell = (c: ActualCell) => {
                                                    const total = c.member + c.guest
                                                    if (total === 0) return <>－</>
                                                    return (
                                                        <>
                                                            {total.toLocaleString()}
                                                            <span className={styles.chPct}>{` (会${c.member}/ゲ${c.guest})`}</span>
                                                        </>
                                                    )
                                                }
                                                return (
                                                    <tr key={t.label}>
                                                        <td>
                                                            <span className={styles.typeDot} style={{ background: TYPE_COLORS[t.label === '人材紹介' ? 'JobR' : t.label === '求人広告' ? 'JobA' : t.label === 'ハローワーク' ? 'JobH' : 'signup'] }} />
                                                            {t.label}
                                                        </td>
                                                        <td className={styles.num}>{cell(t.layers.natural)}</td>
                                                        <td className={styles.num}>{cell(t.layers.featured)}</td>
                                                        <td className={styles.num}>{cell(t.layers.caReferral)}</td>
                                                        <td className={styles.num}>{cell(t.layers.scout)}</td>
                                                        <td className={`${styles.num} ${styles.strong}`}>{t.total.toLocaleString()}</td>
                                                        <td className={styles.num}>{actual.grandTotal > 0 ? `${((t.total / actual.grandTotal) * 100).toFixed(1)}%` : '－'}</td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                <p className={styles.tableNote}>
                                    ※ 本体DynamoDB（会員応募 {actual.memberTotal.toLocaleString()} 件 + ゲスト応募 {actual.guestTotal.toLocaleString()} 件）の実数。上のGA4基準の表と違い、featured/CRM配信・CA紹介・スカウト経由をすべて含みます。<br />
                                    ※ セル内の（会/ゲ）は会員応募/ゲスト応募の内訳。「自然応募」= sourceなし（サイト内フォームからの応募）。
                                </p>

                                <h2 className={styles.sectionTitle} style={{ marginTop: '1.5rem' }}>会員登録の内訳（登録のみ vs 応募と同時）</h2>
                                <div className={styles.summaryRow}>
                                    <div className={styles.summaryCard} style={{ borderTopColor: TYPE_COLORS.signup }}>
                                        <span className={styles.summaryLabel}>登録のみ（単独登録）</span>
                                        <span className={styles.summaryValue}>{actual.signup.standalone != null ? actual.signup.standalone.toLocaleString() : '－'}</span>
                                        {actual.signup.standalone != null && (
                                            <span className={styles.summaryYen}>{formatYenApprox(cvValueYen('signup', actual.signup.standalone) ?? 0)}</span>
                                        )}
                                        <span className={styles.summaryHint}>会員登録フォーム完了（GA4 thanks到達）</span>
                                    </div>
                                    <div className={styles.summaryCard} style={{ borderTopColor: '#f87171' }}>
                                        <span className={styles.summaryLabel}>応募と同時の登録</span>
                                        <span className={styles.summaryValue}>{actual.signup.withApplication.toLocaleString()}</span>
                                        <span className={styles.summaryHint}>
                                            {Object.entries(actual.signup.withApplicationByType).map(([k, v]) => `${k} ${v}`).join(' ／ ') || '－'}
                                        </span>
                                    </div>
                                </div>
                                <p className={styles.tableNote}>
                                    ※ 応募と同時の登録 = 会員応募のうち、応募時刻とユーザー作成時刻の差が10分以内のユーザー数（DB判定・同一ユーザーは1回）。応募フォーム内で会員登録した人はこちらに入り、GA4のthanks到達（登録のみ）には含まれません。<br />
                                    ※ userId欠落等で判定できない応募が {actual.signup.unknownUserApps.toLocaleString()} 件あります（CA紹介などシステム起票の応募が中心）。
                                </p>
                            </>
                        )}
                    </div>

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>完了数の日別推移</h2>
                        <CvTypesTrendChart daily={data.daily} />
                    </div>
                </>
            )}
        </div>
    )
}
