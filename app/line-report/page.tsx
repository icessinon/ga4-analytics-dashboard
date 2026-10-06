'use client'

import { useCallback, useEffect, useState } from 'react'
import { useProduct } from '@/lib/contexts/ProductContext'
import BackLink from '@/components/BackLink'
import RelatedPages from '@/components/RelatedPages'
import PeriodSelect, { usePeriodRange } from '@/components/PeriodSelect'
import LinkedGrowthChart from '@/components/line-report/LinkedGrowthChart'
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

/** 'YYYYMMDD' 同士の日数差。配信間隔が週1→週2と変わっているため増分は日割りで見る */
function daysBetween(newer: string, older: string): number {
    const toIso = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`
    return Math.round((Date.parse(toIso(newer)) - Date.parse(toIso(older))) / 86400000)
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
    // 段階に分けられるのは表示人数を取れる導線だけ。基準が混ざらないようバー表示と数値表示を分ける
    const funnelChannels = activeChannels.filter((c) => (c.viewUsers ?? 0) > 0)
    const noViewChannels = activeChannels.filter((c) => !c.viewUsers)
    const maxDaily = data ? Math.max(1, ...data.daily.map((d) => d.users)) : 1
    // 日別テーブルは新しい日付が上（降順）
    const dailyDesc = data ? [...data.daily].sort((a, b) => b.date.localeCompare(a.date)) : []

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>LINEレポート</h1>
                    <p className={styles.subtitle}>
                        サイト内のLINE連携導線（どこから何人が連携に進んだか）、連携者の増え方、LINE経由（utm_medium=line）の再訪・CVと配信実績。LINE施策の判定基盤です。
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

            {loading && <p className={styles.loading}>読み込み中...</p>}
            {error && <div className={styles.error}>{error}</div>}

            {/* ── 一目で状況が分かる3つ（数値サマリー → 連携者の増え方 → 導線ファネル） ── */}

            <div className={styles.summaryRow}>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>LINE連携者（最新配信時点）</span>
                    <span className={styles.summaryValue}>{latestDelivery ? latestDelivery.linked.toLocaleString() : '－'}</span>
                    <span className={styles.summaryHint}>
                        {latestDelivery ? `配信成功 ${latestDelivery.success.toLocaleString()}人${data?.deliverySource === 'snapshot' ? `（${data.snapshotAsOf}時点）` : ''}` : '－'}
                    </span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>期間中に連携へ進んだ人</span>
                    <span className={styles.summaryValue}>{assoc ? assoc.totalUsers.toLocaleString() : '－'}</span>
                    <span className={styles.summaryHint}>サイト内導線からのクリック（重複を除いた実人数）</span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>LINE経由の再訪ユーザー</span>
                    <span className={styles.summaryValue}>{data ? sumUsers.toLocaleString() : '－'}</span>
                    <span className={styles.summaryHint}>セッション {sumSessions.toLocaleString()}</span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>LINE経由のCV</span>
                    <span className={styles.summaryValue}>{data ? totalCv.toLocaleString() : '－'}</span>
                    <span className={styles.summaryHint}>
                        {data ? `応募${data.cv.applyCv} / LP応募${data.cv.lpApplyCv} / 登録${data.cv.signupCv}・${formatYenApprox(cvYen)}` : '－'}
                    </span>
                </div>
            </div>

            {data?.deliveries && data.deliveries.length > 1 && (
                <div className={styles.card}>
                    <h2 className={styles.sectionTitle}>LINE連携者の増え方</h2>
                    <LinkedGrowthChart deliveries={data.deliveries.map((d) => ({ date: d.date, linked: d.linked }))} />
                </div>
            )}

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
                        <div className={styles.funnelGrid}>
                            {funnelChannels.map((c) => {
                                // 表示人数を100%とした段階表示。基準を混ぜないため表示を取れる導線だけを並べる
                                const base = c.viewUsers ?? 0
                                const rows: { stage: string; value: number; color: string }[] = [
                                    { stage: '表示', value: base, color: 'var(--text-muted)' },
                                    { stage: '連携', value: c.users, color: '#06c755' },
                                    // 閉じるボタンが無い導線（会員登録ブロック）は0になるので段を出さない
                                    ...(c.declineUsers ? [{ stage: '見送り', value: c.declineUsers, color: 'var(--text-muted)' }] : []),
                                ]
                                return (
                                    <div key={c.key} className={styles.funnelItem}>
                                        <div className={styles.funnelName}>{c.label}</div>
                                        {rows.map((r) => (
                                            <div key={r.stage} className={styles.funnelRow}>
                                                <span className={styles.funnelStage}>{r.stage}</span>
                                                <span className={styles.funnelTrack}>
                                                    <span className={styles.funnelFill} style={{ width: `${base > 0 ? Math.min(100, (r.value / base) * 100) : 0}%`, backgroundColor: r.color }} />
                                                </span>
                                                <span className={styles.funnelValue}>
                                                    {r.value.toLocaleString()}
                                                    {r.stage !== '表示' && base > 0 && <span className={styles.funnelPct}>{((r.value / base) * 100).toFixed(0)}%</span>}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )
                            })}
                        </div>
                        {noViewChannels.length > 0 && (
                            <p className={styles.tableNote}>
                                表示を取れない導線（段階に分けられないため連携人数のみ）:{' '}
                                {noViewChannels.map((c) => `${c.label} ${c.users.toLocaleString()}人`).join(' / ')}
                            </p>
                        )}
                        <p className={styles.tableNote}>
                            ※ 各カードはその導線の表示人数を100%とした割合です。カード間でバーの長さを比べるものではありません（表示の母数が導線ごとに違うため）。<br />
                            ※ 数えているのは「LINE連携リンクを押した」ところまでで、連携の完了ではありません（遷移先がLIFF・ソーシャルプラスでGA4の外に出るため）。
                        </p>
                    </>
                )}
            </div>

            {/* ── ここから下は詳細。既定で畳む ── */}

            {assoc && !assocLoading && activeChannels.length > 0 && (
                <details className={styles.collapsible}>
                    <summary>
                        導線別の数値詳細
                        <span className={styles.summaryCount}>{activeChannels.length}導線</span>
                    </summary>
                    <div className={styles.collapsibleBody}>
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
                                                <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.8em' }}>{c.hint}</span>
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
                            ※ モーダルの「表示した人」は実態より少なく出ます（Portal配下のview labelを拾い切れない）。モーダルのCTRは目安として見てください。<br />
                            ※「LINEでログイン」は「LINEで会員登録」と同じブロックにあるため表示を分けられず、CTRは会員登録側にのみ出します。<br />
                            ※ Cookie単位のため、デバイス跨ぎやITPによるCookie失効の分は実人数より多めに出ます。<br />
                            ※ BigQueryスキャン {assoc.scannedMb.toLocaleString()}MB。
                        </p>
                    </div>
                </details>
            )}

            {assoc && !assocLoading && assoc.daily.length > 0 && (
                <details className={styles.collapsible}>
                    <summary>
                        連携に進んだ人の日別内訳
                        <span className={styles.summaryCount}>{assoc.daily.length}日分</span>
                    </summary>
                    <div className={styles.collapsibleBody}>
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
                            ※ 各セルはその日のユニーク人数です。日をまたいで同じ人が押した分は日別には別々に出るため、縦に足しても合計とは一致しません。
                        </p>
                    </div>
                </details>
            )}

            {assoc && !assocLoading && assoc.untracked.length > 0 && (
                <details className={styles.collapsible}>
                    <summary>
                        まだ数えられていない導線
                        <span className={styles.summaryCount}>{assoc.untracked.length}件</span>
                    </summary>
                    <div className={styles.collapsibleBody}>
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
                                            <td style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>{u.source}</td>
                                            <td style={{ color: 'var(--text-muted)' }}>{u.destination}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className={styles.tableNote}>
                            ※ data-click-label が無いためクリックを数えられません。上の数字は「計測できている導線だけの合計」です。<br />
                            ※ 遷移先の inflow-routes が同じ導線同士は、LINE側の友だち追加数でも区別できません。面別に分けるにはLINE側で流入経路を発行し直す必要があります。
                        </p>
                    </div>
                </details>
            )}

            {data && !loading && data.deliveries && (
                <details className={styles.collapsible}>
                    <summary>
                        おすすめ求人LINE配信の実績（週次）
                        <span className={styles.summaryCount}>直近12回</span>
                    </summary>
                    <div className={styles.collapsibleBody}>
                        {data.deliverySource === 'snapshot' && (
                            <div className={styles.notice}>
                                {data.snapshotAsOf} 時点のスナップショット表示です（配信は毎週火曜のため次回配信まで最新）。
                                統合SA（ga4-analytics-dashboard@xmile-drm.iam.gserviceaccount.com）から xmile-drm の xwork データセットを読めていれば、自動でライブ表示に切り替わります。
                            </div>
                        )}
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>配信日</th>
                                        <th className={styles.num}>連携者</th>
                                        <th className={styles.num}>増分</th>
                                        <th className={styles.num}>1日あたり</th>
                                        <th className={styles.num}>配信成功</th>
                                        <th className={styles.num}>受取拒否</th>
                                        <th className={styles.num}>求人マッチなし</th>
                                        <th className={styles.num}>エラー</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.deliveries.slice(0, 12).map((d, i) => {
                                        // deliveries は新しい順。1つ後ろの行が前回配信
                                        const prev = data.deliveries?.[i + 1]
                                        const delta = prev ? d.linked - prev.linked : null
                                        const days = prev ? daysBetween(d.date, prev.date) : 0
                                        const perDay = delta != null && days > 0 ? delta / days : null
                                        return (
                                            <tr key={d.unit}>
                                                <td>{fmtDate(d.date)}</td>
                                                <td className={styles.num}>{d.linked.toLocaleString()}</td>
                                                <td className={styles.num}>{delta != null ? `+${delta.toLocaleString()}` : '－'}</td>
                                                <td className={`${styles.num} ${styles.strong}`}>{perDay != null ? perDay.toFixed(1) : '－'}</td>
                                                <td className={styles.num}>{d.success.toLocaleString()}</td>
                                                <td className={styles.num}>{d.optOut.toLocaleString()}<span style={{ color: 'var(--text-muted)' }}>{d.linked > 0 ? ` (${((d.optOut / d.linked) * 100).toFixed(1)}%)` : ''}</span></td>
                                                <td className={styles.num}>{d.noJobs.toLocaleString()}</td>
                                                <td className={styles.num}>{d.error.toLocaleString()}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <p className={styles.tableNote}>
                            ※ 毎週火曜12:00 JSTに連携者へFlexカルーセル（最大5件・20km圏内×免許マッチ）を配信。<br />
                            ※ 配信メッセージのクリック統計（LINE Insight）はdrm-front側でBQ未連携のため未表示。連携され次第このページに追加します。
                        </p>
                    </div>
                </details>
            )}

            {data && !loading && (
                <details className={styles.collapsible}>
                    <summary>
                        LINE経由の流入元別（utm_source）
                        <span className={styles.summaryCount}>{data.sources.length}種類</span>
                    </summary>
                    <div className={styles.collapsibleBody}>
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
                </details>
            )}

            {data && !loading && dailyDesc.length > 0 && (
                <details className={styles.collapsible}>
                    <summary>
                        LINE経由の再訪ユーザー（日別）
                        <span className={styles.summaryCount}>{dailyDesc.length}日分</span>
                    </summary>
                    <div className={styles.collapsibleBody}>
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
                </details>
            )}
        </div>
    )
}
