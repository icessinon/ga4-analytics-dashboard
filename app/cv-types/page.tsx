'use client'

import { type CSSProperties } from 'react'
import Link from 'next/link'
import { useProduct } from '@/contexts/ProductContext'
import CvTypesTrendChart from '@/components/cv-types/CvTypesTrendChart'
import PageShell from '@/components/PageShell'
import PeriodSelect from '@/components/PeriodSelect'
import LoadState from '@/components/LoadState'
import { ui, cx } from '@/components/ui'
import { usePeriodRange } from '@/hooks/usePeriodRange'
import { useReport } from '@/hooks/useReport'
import { type PeriodOption } from '@/lib/utils/period'
import { JOB_TYPE_COLORS } from '@/lib/services/cv/jobTypeLabels'
import type { CvTypesResponse } from '@/lib/services/cv/cvTypesTypes'
import type { ApplicationCell, ApplicationsActualResponse } from '@/lib/services/cv/applicationsActualTypes'
import type { RouteFunnelResponse, RouteFunnelSide } from '@/lib/services/cv/routeFunnelTypes'
import { CV_UNIT_VALUE_ASOF, cvValueYen, formatYenApprox } from '@/lib/constants/cvUnitValue'
import styles from './CvTypesPage.module.css'

const PERIOD_OPTIONS: PeriodOption[] = [
    { value: '7daysAgo', label: '過去7日' },
    { value: '14daysAgo', label: '過去14日' },
    { value: '30daysAgo', label: '過去30日' },
    { value: '90daysAgo', label: '過去90日' },
]

function pct(v: number | null): string {
    return v != null ? `${(v * 100).toFixed(1)}%` : '－'
}

const accent = (key: string) => ({ '--summary-accent': JOB_TYPE_COLORS[key] } as CSSProperties)
const ACTUAL_LABEL_TO_KEY: Record<string, string> = { 人材紹介: 'JobR', 求人広告: 'JobA', ハローワーク: 'JobH' }

export default function CvTypesPage() {
    const { currentProduct } = useProduct()
    const periodState = usePeriodRange('30daysAgo')
    const { range } = periodState
    const body = { propertyId: currentProduct?.ga4PropertyId, startDate: range?.startDate, endDate: range?.endDate }
    const enabled = !!currentProduct?.ga4PropertyId && !!range

    const report = useReport<CvTypesResponse>('/api/cv-types', { body, enabled })
    const data = report.data
    // DB実数（重めなので別リクエスト・失敗してもページ全体は落とさない）
    const actualReport = useReport<ApplicationsActualResponse>('/api/applications/actual', { body, enabled: enabled && !!data })
    const actual = actualReport.data
    // 経路別ファネル（GA4ファネルAPI・遅め）
    const routeReport = useReport<RouteFunnelResponse>('/api/cv-types/route-funnel', { body, enabled: enabled && !!data })
    const routeFunnel = routeReport.data

    const totalApply = data ? data.jobTypes.reduce((s, t) => s + t.completed, 0) : 0

    return (
        <PageShell
            pageId="cvTypes"
            requireProduct
            status={{ loading: report.loading, error: report.error, source: 'ga4', onRetry: report.run }}
            controls={<PeriodSelect state={periodState} options={PERIOD_OPTIONS} resolved={data} />}
        >
            {data && (
                <>
                    <div className={ui.summaryRow}>
                        {data.jobTypes.map((t) => (
                            <div key={t.key} className={ui.summaryCard} style={accent(t.key)}>
                                <span className={ui.summaryLabel}>{t.label}（応募完了）</span>
                                <span className={ui.summaryValue}>{t.completed.toLocaleString()}</span>
                                <span className={styles.summaryYen}>{formatYenApprox(cvValueYen(t.key, t.completed) ?? 0)}</span>
                                <span className={ui.summaryHint}>サイト内フォーム応募の構成比 {totalApply > 0 ? `${((t.completed / totalApply) * 100).toFixed(0)}%` : '－'}</span>
                            </div>
                        ))}
                        <div className={ui.summaryCard} style={accent('signup')}>
                            <span className={ui.summaryLabel}>会員登録（完了）</span>
                            <span className={ui.summaryValue}>{data.signup.completed.toLocaleString()}</span>
                            <span className={styles.summaryYen}>{formatYenApprox(cvValueYen('signup', data.signup.completed) ?? 0)}</span>
                            <span className={ui.summaryHint}>フォーム→完了 {pct(data.signup.formToComplete)}</span>
                        </div>
                    </div>
                    <p className={styles.yenNote}>
                        ※ 金額 = 期待売上換算（入社済の受注額−返金想定。Salesforce {CV_UNIT_VALUE_ASOF} 算出の係数）:
                        人材紹介 約5,300円/応募・求人広告 約7,800円/応募（紹介パスアップ成約分のみ、掲載課金は含まず）・ハローワーク 約2,800円/応募・
                        会員登録 約1.8万円/登録（応募を伴わない単独登録。登録者の2.3%がその後入社）。1件の価値比較用の概算です。
                    </p>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>求人種別ファネル（求人詳細 → 応募フォーム → 完了）</h2>
                        <div className={ui.tableWrap}>
                            <table className={ui.dataTable}>
                                <thead>
                                    <tr>
                                        <th>種別</th>
                                        <th className={ui.num}>求人詳細閲覧</th>
                                        <th className={ui.num}>→ フォーム</th>
                                        <th className={ui.num}>→ 完了</th>
                                        <th className={ui.num}>詳細→フォーム</th>
                                        <th className={ui.num}>フォーム→完了</th>
                                        <th className={ui.num}>詳細→完了</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.jobTypes.map((t) => (
                                        <tr key={t.key}>
                                            <td><span className={styles.typeDot} style={{ background: JOB_TYPE_COLORS[t.key] }} />{t.label}</td>
                                            <td className={ui.num}>{t.detailViews.toLocaleString()}</td>
                                            <td className={ui.num}>{t.formViews.toLocaleString()}</td>
                                            <td className={ui.num}>{t.completed.toLocaleString()}</td>
                                            <td className={ui.num}>{pct(t.detailToForm)}</td>
                                            <td className={ui.num}>{pct(t.formToComplete)}</td>
                                            <td className={cx(ui.num, ui.strong)}>{pct(t.overallRate)}</td>
                                        </tr>
                                    ))}
                                    <tr className={styles.signupRow}>
                                        <td><span className={styles.typeDot} style={{ background: JOB_TYPE_COLORS.signup }} />会員登録（参考: フォーム → 完了）</td>
                                        <td className={ui.num}>－</td>
                                        <td className={ui.num}>{data.signup.formViews.toLocaleString()}</td>
                                        <td className={ui.num}>{data.signup.completed.toLocaleString()}</td>
                                        <td className={ui.num}>－</td>
                                        <td className={ui.num}>{pct(data.signup.formToComplete)}</td>
                                        <td className={ui.num}>－</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <p className={ui.tableNote}>
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
                            <div className={ui.card}>
                                <h2 className={ui.sectionTitle}>サイト全体の流入チャネル構成（セッション）</h2>
                                <div className={ui.tableWrap}>
                                    <table className={ui.dataTable}>
                                        <thead>
                                            <tr>
                                                <th>チャネル</th>
                                                <th className={ui.num}>セッション</th>
                                                <th className={ui.num}>構成比</th>
                                                <th className={ui.num}>ユーザー</th>
                                                <th style={{ width: '35%' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.channelMix.map((c) => (
                                                <tr key={c.channel}>
                                                    <td>{c.channel}</td>
                                                    <td className={ui.num}>{c.sessions.toLocaleString()}</td>
                                                    <td className={cx(ui.num, ui.strong)}>{totalSessions > 0 ? `${((c.sessions / totalSessions) * 100).toFixed(1)}%` : '－'}</td>
                                                    <td className={ui.num}>{c.users.toLocaleString()}</td>
                                                    <td><span className={styles.shareBar} style={{ width: `${totalSessions > 0 ? (c.sessions / totalSessions) * 100 : 0}%` }} /></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className={ui.tableNote}>
                                    ※ GA4のデフォルトチャネルグループ（セッション基準・ラストタッチ）。オーガニックの「価値」はこの構成比より重い点に注意
                                    （サイト経由の純会員登録の約9割がオーガニック起点＝ファーストタッチ。ラストタッチではDirect等に分類される）。<br />
                                    ※ <strong>2026-08-11以降はUnassignedが異常に膨らむ計測インシデントが発生中</strong>。解決までこの期間を含む構成比は参考値です。
                                </p>
                            </div>
                        )
                    })()}

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>求人詳細の流入内訳（チャネル × 一覧経由）</h2>
                        {data.listViews != null && (
                            <p className={ui.sectionNote}>一覧ページ（検索・職種一覧）の閲覧: {data.listViews.toLocaleString()} ユーザー ／ うち詳細へ進んだ人数は下表の「一覧経由」列</p>
                        )}
                        <div className={ui.tableWrap}>
                            <table className={ui.dataTable}>
                                <thead>
                                    <tr>
                                        <th>種別</th>
                                        <th className={ui.num}>詳細閲覧</th>
                                        <th className={ui.num}>SEO（自然検索）</th>
                                        <th className={ui.num}>Direct</th>
                                        <th className={ui.num}>CRM(SMS/メール)</th>
                                        <th className={ui.num}>広告</th>
                                        <th className={ui.num}>その他</th>
                                        <th className={ui.num}>一覧経由</th>
                                        <th className={ui.num}>直接着地</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.jobTypes.map((t) => {
                                        const ch = t.channels
                                        const chTotal = ch.organic + ch.direct + ch.crm + ch.paid + ch.other
                                        const cell = (v: number) => (
                                            <>
                                                {v.toLocaleString()}
                                                <span className={styles.chPct}>{chTotal > 0 ? ` (${((v / chTotal) * 100).toFixed(0)}%)` : ''}</span>
                                            </>
                                        )
                                        return (
                                            <tr key={t.key}>
                                                <td><span className={styles.typeDot} style={{ background: JOB_TYPE_COLORS[t.key] }} />{t.label}</td>
                                                <td className={ui.num}>{t.detailViews.toLocaleString()}</td>
                                                <td className={ui.num}>{cell(ch.organic)}</td>
                                                <td className={ui.num}>{cell(ch.direct)}</td>
                                                <td className={ui.num}>{cell(ch.crm)}</td>
                                                <td className={ui.num}>{cell(ch.paid)}</td>
                                                <td className={ui.num}>{cell(ch.other)}</td>
                                                <td className={cx(ui.num, ui.strong)}>
                                                    {t.viaList.toLocaleString()}
                                                    <span className={styles.chPct}>{t.viaListRate != null ? ` (${(t.viaListRate * 100).toFixed(0)}%)` : ''}</span>
                                                </td>
                                                <td className={ui.num}>
                                                    {Math.max(0, t.detailViews - t.viaList).toLocaleString()}
                                                    <span className={styles.chPct}>{t.detailViews > 0 ? ` (${(((t.detailViews - t.viaList) / t.detailViews) * 100).toFixed(0)}%)` : ''}</span>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <p className={ui.tableNote}>
                            ※ SEO（自然検索）= GA4のOrganic Search（Google/Yahoo等の検索結果からの流入。広告=Paid検索とは別）。CRM = SMS + Email + Push。<br />
                            ※ チャネル5列（SEO/Direct/CRM/広告/その他）は「サイトに来たきっかけ」で、合計が詳細閲覧と一致します。Direct = 参照元不明（URL直打ち・ブックマーク・アプリ内ブラウザ等でreferrer欠落）、その他 = Referral（他サイトのリンク）・Organic Social・Unassigned等。<br />
                            ※ <strong>「一覧経由」はチャネルとは別軸で重複します</strong>（サイト内で直前に検索・職種一覧ページを見ていた人。例: SEOで一覧に着地→詳細の人はSEOにも一覧経由にも入る）。横に足せるのはチャネル5列まで。リファラー近似のため、間に別ページを挟んだ遷移は含まれません。<br />
                            ※ 直接着地 = 詳細閲覧 −一覧経由（一覧を通らずに詳細へ来た人。SEO・Direct・CRM等）。ハローワークは直接着地が約8割＝SEOで1ページだけ見に来る層が主体、人材紹介・求人広告はサイト内回遊（一覧経由）が約4割、といった「詳細への来方」の違いを見るための表です。
                        </p>
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>経路別ファネル（一覧経由 vs 直接着地）</h2>
                        <LoadState variant="inline" loading={routeReport.loading} error={routeReport.error} source="ga4" loadingText="GA4ファネルAPIで集計中..." onRetry={routeReport.run}>
                            {routeFunnel && (() => {
                                const ratio = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '－')
                                const row = (label: string, side: RouteFunnelSide, colorKey?: string, strong?: boolean) => (
                                    <tr key={label} className={strong ? styles.signupRow : undefined}>
                                        <td>{colorKey && <span className={styles.typeDot} style={{ background: JOB_TYPE_COLORS[colorKey] }} />}{label}</td>
                                        <td className={ui.num}>{side.detail.toLocaleString()}</td>
                                        <td className={ui.num}>{side.form.toLocaleString()}</td>
                                        <td className={ui.num}>{side.complete.toLocaleString()}</td>
                                        <td className={cx(ui.num, ui.strong)}>{ratio(side.form, side.detail)}</td>
                                        <td className={ui.num}>{ratio(side.complete, side.form)}</td>
                                        <td className={cx(ui.num, ui.strong)}>{ratio(side.complete, side.detail)}</td>
                                    </tr>
                                )
                                return (
                                    <>
                                        <p className={ui.sectionNote}>一覧（検索・職種一覧）閲覧: {routeFunnel.listUsers.toLocaleString()} ユーザー。ここから各種別の詳細へ進んだのが「一覧経由」。</p>
                                        <div className={ui.tableWrap}>
                                            <table className={ui.dataTable}>
                                                <thead>
                                                    <tr>
                                                        <th>種別 × 経路</th>
                                                        <th className={ui.num}>求人詳細</th>
                                                        <th className={ui.num}>→ フォーム</th>
                                                        <th className={ui.num}>→ 完了</th>
                                                        <th className={ui.num}>詳細→フォーム</th>
                                                        <th className={ui.num}>フォーム→完了</th>
                                                        <th className={ui.num}>詳細→完了</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {routeFunnel.types.flatMap((t) => [row(`${t.label}・一覧経由`, t.viaList, t.key), row(`${t.label}・直接着地`, t.direct, t.key)])}
                                                    {row('合計・一覧経由', routeFunnel.totals.viaList, undefined, true)}
                                                    {row('合計・直接着地', routeFunnel.totals.direct, undefined, true)}
                                                </tbody>
                                            </table>
                                        </div>
                                        <p className={ui.tableNote}>
                                            ※ GA4クローズドファネル（順序付き・country=Japan適用）。詳細=DL__Media__Area__種別、フォーム=EF__種別__Area__Header（ビューラベル基準のため上の求人種別ファネルと同じ定義・視認条件で少なめに出ます）。<br />
                                            ※ 「直接着地」= 全体 − 一覧経由 の差分推定（両経路を踏んだ人は一覧経由側に計上）。<br />
                                            ※ 一覧経由（サイト内で比較検討した人）は直接着地よりフォーム遷移率が数倍高い「濃い経路」。直接着地層はその場の応募より会員化（モザイク施策等）が向く、という判断材料になります。
                                        </p>
                                    </>
                                )
                            })()}
                        </LoadState>
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>応募フォームの項目別タップ（着手）</h2>
                        <p className={ui.sectionNote}>
                            種別ごとに「どの入力項目がどれだけタップ（着手）されているか」の発火数は、専用ページに移しました。フォーム完了率（CVR）と項目別バーをまとめて確認できます。
                            → <Link href="/apply-fields" className={styles.inlineLink}>応募フォーム 項目別タップ計測</Link>
                        </p>
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>応募の全体像（DB実数・featured/CRM配信を含む）</h2>
                        <LoadState variant="inline" loading={actualReport.loading} error={actualReport.error} source="db" loadingText="本体DBから集計中...（十数秒かかります）" onRetry={actualReport.run}>
                            {actual && (
                                <>
                                    <div className={ui.tableWrap}>
                                        <table className={ui.dataTable}>
                                            <thead>
                                                <tr>
                                                    <th>種別</th>
                                                    <th className={ui.num}>自然応募（サイト内）</th>
                                                    <th className={ui.num}>featured（CRM配信）</th>
                                                    <th className={ui.num}>CA紹介</th>
                                                    <th className={ui.num}>スカウト</th>
                                                    <th className={ui.num}>合計</th>
                                                    <th className={ui.num}>構成比</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {actual.types.map((t) => {
                                                    const cell = (c: ApplicationCell) => {
                                                        const total = c.member + c.guest
                                                        if (total === 0) return <>－</>
                                                        return <>{total.toLocaleString()}<span className={styles.chPct}>{` (会${c.member}/ゲ${c.guest})`}</span></>
                                                    }
                                                    return (
                                                        <tr key={t.label}>
                                                            <td><span className={styles.typeDot} style={{ background: JOB_TYPE_COLORS[ACTUAL_LABEL_TO_KEY[t.label] ?? 'signup'] }} />{t.label}</td>
                                                            <td className={ui.num}>{cell(t.layers.natural)}</td>
                                                            <td className={ui.num}>{cell(t.layers.featured)}</td>
                                                            <td className={ui.num}>{cell(t.layers.caReferral)}</td>
                                                            <td className={ui.num}>{cell(t.layers.scout)}</td>
                                                            <td className={cx(ui.num, ui.strong)}>{t.total.toLocaleString()}</td>
                                                            <td className={ui.num}>{actual.grandTotal > 0 ? `${((t.total / actual.grandTotal) * 100).toFixed(1)}%` : '－'}</td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    <p className={ui.tableNote}>
                                        ※ 本体DynamoDB（会員応募 {actual.memberTotal.toLocaleString()} 件 + ゲスト応募 {actual.guestTotal.toLocaleString()} 件）の実数。上のGA4基準の表と違い、featured/CRM配信・CA紹介・スカウト経由をすべて含みます。<br />
                                        ※ セル内の（会/ゲ）は会員応募/ゲスト応募の内訳。「自然応募」= sourceなし（サイト内フォームからの応募）。
                                    </p>

                                    <h2 className={ui.sectionTitle} style={{ marginTop: '1.5rem' }}>会員登録の内訳（登録のみ vs 応募と同時）</h2>
                                    <div className={ui.summaryRow}>
                                        <div className={ui.summaryCard} style={accent('signup')}>
                                            <span className={ui.summaryLabel}>登録のみ（単独登録）</span>
                                            <span className={ui.summaryValue}>{actual.signup.standalone != null ? actual.signup.standalone.toLocaleString() : '－'}</span>
                                            {actual.signup.standalone != null && <span className={styles.summaryYen}>{formatYenApprox(cvValueYen('signup', actual.signup.standalone) ?? 0)}</span>}
                                            <span className={ui.summaryHint}>会員登録フォーム完了（GA4 thanks到達）</span>
                                        </div>
                                        <div className={ui.summaryCard} style={accent('JobA')}>
                                            <span className={ui.summaryLabel}>応募と同時の登録</span>
                                            <span className={ui.summaryValue}>{actual.signup.withApplication.toLocaleString()}</span>
                                            <span className={ui.summaryHint}>{Object.entries(actual.signup.withApplicationByType).map(([k, v]) => `${k} ${v}`).join(' ／ ') || '－'}</span>
                                        </div>
                                    </div>
                                    <p className={ui.tableNote}>
                                        ※ 応募と同時の登録 = 会員応募のうち、応募時刻とユーザー作成時刻の差が10分以内のユーザー数（DB判定・同一ユーザーは1回）。応募フォーム内で会員登録した人はこちらに入り、GA4のthanks到達（登録のみ）には含まれません。<br />
                                        ※ userId欠落等で判定できない応募が {actual.signup.unknownUserApps.toLocaleString()} 件あります（CA紹介などシステム起票の応募が中心）。
                                    </p>
                                </>
                            )}
                        </LoadState>
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>完了数の日別推移</h2>
                        <CvTypesTrendChart daily={data.daily} />
                    </div>
                </>
            )}
        </PageShell>
    )
}
