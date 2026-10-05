'use client'

import { useCallback, useEffect, useState } from 'react'
import { useProduct } from '@/lib/contexts/ProductContext'
import BackLink from '@/components/BackLink'
import RelatedPages from '@/components/RelatedPages/RelatedPages'
import PeriodSelect, { usePeriodRange } from '@/components/PeriodSelect/PeriodSelect'
import { withCustomOption, PeriodOption } from '@/lib/utils/period'
import { parseJsonResponse } from '@/lib/utils/fetch'
import { CV_UNIT_VALUE_YEN, formatYenApprox } from '@/lib/constants/cvUnitValue'
import styles from './LineReportPage.module.css'

interface SourceRow { source: string; sessions: number; users: number }
interface DailyRow { date: string; users: number; sessions: number }
interface DeliveryRow { unit: string; date: string; linked: number; success: number; optOut: number; noJobs: number; error: number }

type LineChannelKey = 'signup' | 'signin' | 'thanksModal' | 'thanksBanner' | 'thanksLegacy' | 'sidebar' | 'other'
interface ChannelRow {
    key: LineChannelKey
    label: string
    hint: string
    users: number
    viewUsers: number | null
    declineUsers: number | null
    pages: { path: string; users: number }[]
}
interface UntrackedRow { place: string; source: string; destination: string }
interface AssociationResponse {
    startDate: string
    endDate: string
    clamped: boolean
    channels: ChannelRow[]
    totalUsers: number
    daily: { date: string; users: Partial<Record<LineChannelKey, number>>; total: number }[]
    untracked: UntrackedRow[]
    scannedMb: number
}

interface LineReportResponse {
    startDate: string
    endDate: string
    sources: SourceRow[]
    daily: DailyRow[]
    cv: { applyCv: number; lpApplyCv: number; signupCv: number }
    deliveries: DeliveryRow[] | null
    deliverySource: 'live' | 'snapshot'
    snapshotAsOf: string
}

const PERIOD_OPTIONS: PeriodOption[] = [
    { value: '7daysAgo', label: '過去7日' },
    { value: '14daysAgo', label: '過去14日' },
    { value: '30daysAgo', label: '過去30日' },
    { value: '90daysAgo', label: '過去90日' },
]

const SOURCE_LABELS: Record<string, string> = {
    product: 'おすすめ求人配信（週次バッチ）',
    ca: 'CA個別送信',
    scout: 'スカウト関連',
    social: 'ソーシャル',
    search: '検索',
}

function fmtDate(d: string): string {
    return `${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6, 8)}`
}

export default function LineReportPage() {
    const { currentProduct } = useProduct()
    const periodState = usePeriodRange('30daysAgo')
    const { range } = periodState
    const [data, setData] = useState<LineReportResponse | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [assoc, setAssoc] = useState<AssociationResponse | null>(null)
    const [assocLoading, setAssocLoading] = useState(false)
    const [assocError, setAssocError] = useState<string | null>(null)

    const load = useCallback(async () => {
        if (!currentProduct?.ga4PropertyId || !range) return
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/line-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ propertyId: currentProduct.ga4PropertyId, startDate: range.startDate, endDate: range.endDate }),
            })
            const json = await parseJsonResponse<LineReportResponse & { error?: string }>(res)
            if (!res.ok) throw new Error(json.error || '取得に失敗しました')
            setData(json)
        } catch (e) {
            setError(e instanceof Error ? e.message : '取得に失敗しました')
            setData(null)
        } finally {
            setLoading(false)
        }
    }, [currentProduct?.ga4PropertyId, range])

    useEffect(() => { load() }, [load])

    // 連携導線はBQ直読みで重いため、GA4 Data API側とは別に叩く（片方が落ちてももう片方は出す）
    const loadAssoc = useCallback(async () => {
        if (!range) return
        setAssocLoading(true)
        setAssocError(null)
        try {
            const res = await fetch('/api/line-report/associations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ startDate: range.startDate, endDate: range.endDate }),
            })
            const json = await parseJsonResponse<AssociationResponse & { error?: string }>(res)
            if (!res.ok) throw new Error(json.error || '取得に失敗しました')
            setAssoc(json)
        } catch (e) {
            setAssocError(e instanceof Error ? e.message : '取得に失敗しました')
            setAssoc(null)
        } finally {
            setAssocLoading(false)
        }
    }, [range])

    useEffect(() => { loadAssoc() }, [loadAssoc])

    const sumUsers = data ? data.sources.reduce((s, r) => s + r.users, 0) : 0
    const sumSessions = data ? data.sources.reduce((s, r) => s + r.sessions, 0) : 0
    // 円換算: 応募・LP応募は人材紹介単価で近似、登録は単独登録単価
    const cvYen = data
        ? data.cv.applyCv * CV_UNIT_VALUE_YEN.JobR + data.cv.lpApplyCv * CV_UNIT_VALUE_YEN.JobR + data.cv.signupCv * CV_UNIT_VALUE_YEN.signup
        : 0
    const totalCv = data ? data.cv.applyCv + data.cv.lpApplyCv + data.cv.signupCv : 0
    const latestDelivery = data?.deliveries?.[0] ?? null
    // 連携導線は実績のあるものだけ出す（未分類 other は0件でも出すと紛らわしいので同じ扱い）
    const activeChannels = assoc ? assoc.channels.filter((c) => c.users > 0 || (c.viewUsers ?? 0) > 0) : []
    const assocDailyMax = assoc ? Math.max(1, ...assoc.daily.map((d) => d.total)) : 1
    const maxDaily = data ? Math.max(1, ...data.daily.map((d) => d.users)) : 1
    // 日別テーブルは新しい日付が上（降順）
    const dailyDesc = data ? [...data.daily].sort((a, b) => b.date.localeCompare(a.date)) : []

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>LINE配信レポート</h1>
                    <p className={styles.subtitle}>
                        サイト内のLINE連携導線（どこから何人が連携に進んだか）と、LINE経由（utm_medium=line）の再訪・CV、おすすめ求人LINE配信（毎週火曜・連携者向け）の実績。LINE施策の判定基盤です。
                    </p>
                </div>
                <BackLink href="/">ダッシュボード</BackLink>
            </div>

            {!currentProduct && <div className={styles.notice}>プロダクトを選択してください</div>}

            <RelatedPages pages={[{ href: '/cv-value', label: 'CV単価・お金まわり' }, { href: '/cv-types', label: '求人種別CV分析' }, { href: '/insights', label: '月次インサイトレポート' }]} />

            <div className={styles.controls}>
                <PeriodSelect
                    state={periodState}
                    options={withCustomOption(PERIOD_OPTIONS)}
                    selectClassName={styles.select}
                    noteClassName={styles.periodNote}
                    resolved={data}
                />
            </div>

            <div className={styles.card}>
                <h2 className={styles.sectionTitle}>サイト → LINE連携の導線</h2>
                {assocLoading && <p className={styles.loading}>読み込み中...</p>}
                {assocError && <div className={styles.error}>{assocError}</div>}
                {assoc && !assocLoading && (
                    <>
                        {assoc.clamped && (
                            <div className={styles.notice}>
                                BQエクスポートの開始日と上限30日に合わせて {assoc.startDate}〜{assoc.endDate} で集計しました。
                            </div>
                        )}
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>導線</th>
                                        <th className={styles.num}>表示した人</th>
                                        <th className={styles.num}>連携に進んだ人</th>
                                        <th className={styles.num}>見送った人</th>
                                        <th className={styles.num}>CTR</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeChannels.map((c) => (
                                        <tr key={c.key}>
                                            <td>
                                                {c.label}
                                                <span style={{ display: 'block', color: '#6b7280', fontSize: '0.8em' }}>{c.hint}</span>
                                            </td>
                                            <td className={styles.num}>{c.viewUsers != null ? c.viewUsers.toLocaleString() : '－'}</td>
                                            <td className={`${styles.num} ${styles.strong}`}>{c.users.toLocaleString()}</td>
                                            <td className={styles.num}>{c.declineUsers != null ? c.declineUsers.toLocaleString() : '－'}</td>
                                            <td className={styles.num}>{c.viewUsers ? `${((c.users / c.viewUsers) * 100).toFixed(1)}%` : '－'}</td>
                                        </tr>
                                    ))}
                                    <tr>
                                        <td className={styles.strong}>合計（重複を除いた実人数）</td>
                                        <td></td>
                                        <td className={`${styles.num} ${styles.strong}`}>{(assoc.totalUsers ?? 0).toLocaleString()}</td>
                                        <td colSpan={2}></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <p className={styles.tableNote}>
                            ※ 全列ユニーク人数（Cookie単位）です。クリック件数で数えると認証画面から戻って押し直した分が乗るため（会員登録系は実測1.25回/人）、導線間を比べられるよう人数に揃えています。合計は導線を横断した実人数で、各行の和とは一致しません（複数の導線を押した人は1人）。<br />
                            ※「見送った人」＝モーダルの「あとで」・バナーの「閉じる」を押した人。この2つ以外の導線には閉じるボタンが無いため「－」になります。<br />
                            ※ 数えているのは「LINE連携リンクを押した」ところまでで、連携の完了ではありません（遷移先がLIFF・ソーシャルプラスでGA4の外に出るため）。<br />
                            ※ モーダルの「表示した人」は実態より少なく出ます（Portal配下のview labelを拾い切れない）。モーダルのCTRは目安として見てください。<br />
                            ※「LINEでログイン」は「LINEで会員登録」と同じブロックにあるため表示を分けられず、CTRは会員登録側にのみ出します。<br />
                            ※ Cookie単位のため、デバイス跨ぎやITPによるCookie失効の分は実人数より多めに出ます。<br />
                            ※ BigQueryスキャン {assoc.scannedMb.toLocaleString()}MB。
                        </p>
                    </>
                )}
            </div>

            {assoc && !assocLoading && assoc.daily.length > 0 && (
                <div className={styles.card}>
                    <h2 className={styles.sectionTitle}>連携に進んだ人の日別推移</h2>
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>日付</th>
                                    {activeChannels.map((c) => <th key={c.key} className={styles.num}>{c.label}</th>)}
                                    <th className={styles.num}>合計</th>
                                    <th style={{ width: '30%' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {assoc.daily.map((d) => (
                                    <tr key={d.date}>
                                        <td>{d.date}</td>
                                        {activeChannels.map((c) => (
                                            <td key={c.key} className={styles.num}>{(d.users[c.key] ?? 0).toLocaleString()}</td>
                                        ))}
                                        <td className={`${styles.num} ${styles.strong}`}>{d.total.toLocaleString()}</td>
                                        <td><span className={styles.bar} style={{ width: `${(d.total / assocDailyMax) * 100}%` }} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className={styles.tableNote}>
                        ※ 各セルはその日のユニーク人数です。日をまたいで同じ人が押した分は日別には別々に出るため、縦に足しても上の合計とは一致しません。
                    </p>
                </div>
            )}

            {assoc && !assocLoading && assoc.untracked.length > 0 && (
                <div className={styles.card}>
                    <h2 className={styles.sectionTitle}>まだ数えられていない導線（{assoc.untracked.length}件）</h2>
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>場所</th>
                                    <th>実装箇所（drm-front）</th>
                                    <th>遷移先</th>
                                </tr>
                            </thead>
                            <tbody>
                                {assoc.untracked.map((u) => (
                                    <tr key={u.source}>
                                        <td>{u.place}</td>
                                        <td style={{ color: '#6b7280', fontSize: '0.85em' }}>{u.source}</td>
                                        <td style={{ color: '#6b7280' }}>{u.destination}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className={styles.tableNote}>
                        ※ data-click-label が無いためクリックを数えられません。上の表の数字は「計測できている導線だけの合計」です。<br />
                        ※ 遷移先の inflow-routes が同じ導線同士は、LINE側の友だち追加数でも区別できません。面別に分けるにはLINE側で流入経路を発行し直す必要があります。
                    </p>
                </div>
            )}

            {loading && <p className={styles.loading}>読み込み中...</p>}
            {error && <div className={styles.error}>{error}</div>}

            {data && !loading && (
                <>
                    <div className={styles.summaryRow}>
                        <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>LINE連携者（最新配信時点）</span>
                            <span className={styles.summaryValue}>{latestDelivery ? latestDelivery.linked.toLocaleString() : '－'}</span>
                            <span className={styles.summaryHint}>
                                {latestDelivery ? `配信成功 ${latestDelivery.success.toLocaleString()}人${data.deliverySource === 'snapshot' ? `（${data.snapshotAsOf}時点）` : ''}` : '－'}
                            </span>
                        </div>
                        <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>LINE経由の再訪ユーザー</span>
                            <span className={styles.summaryValue}>{sumUsers.toLocaleString()}</span>
                            <span className={styles.summaryHint}>セッション {sumSessions.toLocaleString()}</span>
                        </div>
                        <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>LINE経由のCV</span>
                            <span className={styles.summaryValue}>{totalCv.toLocaleString()}</span>
                            <span className={styles.summaryHint}>応募{data.cv.applyCv} / LP応募{data.cv.lpApplyCv} / 登録{data.cv.signupCv}</span>
                        </div>
                        <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>期待売上換算</span>
                            <span className={styles.summaryValue}>{formatYenApprox(cvYen)}</span>
                            <span className={styles.summaryHint}>応募・LP応募は人材紹介単価で近似</span>
                        </div>
                    </div>

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>流入元別（utm_source × medium=line）</h2>
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>utm_source</th>
                                        <th>意味</th>
                                        <th className={styles.num}>セッション</th>
                                        <th className={styles.num}>ユーザー</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.sources.map((r) => (
                                        <tr key={r.source}>
                                            <td>{r.source}</td>
                                            <td>{SOURCE_LABELS[r.source] ?? '－'}</td>
                                            <td className={styles.num}>{r.sessions.toLocaleString()}</td>
                                            <td className={`${styles.num} ${styles.strong}`}>{r.users.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>おすすめ求人LINE配信の実績（週次・BQ）</h2>
                        {data.deliverySource === 'snapshot' && (
                            <div className={styles.notice}>
                                {data.snapshotAsOf} 時点のスナップショット表示です（配信は毎週火曜のため次回配信まで最新）。
                                統合SA（ga4-analytics-dashboard@xmile-drm.iam.gserviceaccount.com）から xmile-drm の xwork データセットを読めていれば、自動でライブ表示に切り替わります。
                            </div>
                        )}
                        {data.deliveries && (
                            <>
                                <div className={styles.tableWrapper}>
                                    <table className={styles.table}>
                                        <thead>
                                            <tr>
                                                <th>配信日</th>
                                                <th className={styles.num}>連携者</th>
                                                <th className={styles.num}>配信成功</th>
                                                <th className={styles.num}>受取拒否</th>
                                                <th className={styles.num}>求人マッチなし</th>
                                                <th className={styles.num}>エラー</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.deliveries.slice(0, 12).map((d) => (
                                                <tr key={d.unit}>
                                                    <td>{d.date.slice(0, 4)}/{d.date.slice(4, 6)}/{d.date.slice(6, 8)}</td>
                                                    <td className={styles.num}>{d.linked.toLocaleString()}</td>
                                                    <td className={`${styles.num} ${styles.strong}`}>{d.success.toLocaleString()}</td>
                                                    <td className={styles.num}>{d.optOut.toLocaleString()}<span style={{ color: '#6b7280' }}>{d.linked > 0 ? ` (${((d.optOut / d.linked) * 100).toFixed(1)}%)` : ''}</span></td>
                                                    <td className={styles.num}>{d.noJobs.toLocaleString()}</td>
                                                    <td className={styles.num}>{d.error.toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className={styles.tableNote}>
                                    ※ 毎週火曜12:00 JSTに連携者へFlexカルーセル（最大5件・20km圏内×免許マッチ）を配信。連携者数の推移＝LINE連携率施策の主要KPIとしても使えます。<br />
                                    ※ 配信メッセージのクリック統計（LINE Insight）はdrm-front側でBQ未連携のため未表示。連携され次第このページに追加します。
                                </p>
                            </>
                        )}
                    </div>

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>LINE経由の再訪ユーザー（日別）</h2>
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>日付</th>
                                        <th className={styles.num}>ユーザー</th>
                                        <th style={{ width: '50%' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dailyDesc.map((d) => (
                                        <tr key={d.date}>
                                            <td>{fmtDate(d.date)}</td>
                                            <td className={styles.num}>{d.users.toLocaleString()}</td>
                                            <td><span className={styles.bar} style={{ width: `${(d.users / maxDaily) * 100}%` }} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className={styles.tableNote}>
                            ※ 火曜（おすすめ配信日）にピークが立つのが正常。配信頻度ABをやる場合はこの分布の変化で健全性を確認します。
                        </p>
                    </div>
                </>
            )}
        </div>
    )
}
