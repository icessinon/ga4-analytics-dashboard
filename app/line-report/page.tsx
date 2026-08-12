'use client'

import { useCallback, useEffect, useState } from 'react'
import { useProduct } from '@/lib/contexts/ProductContext'
import BackLink from '@/components/BackLink'
import RelatedPages from '@/components/RelatedPages/RelatedPages'
import { parseJsonResponse } from '@/lib/utils/fetch'
import { CV_UNIT_VALUE_YEN, formatYenApprox } from '@/lib/constants/cvUnitValue'
import styles from './LineReportPage.module.css'

interface SourceRow { source: string; sessions: number; users: number }
interface DailyRow { date: string; users: number; sessions: number }
interface DeliveryRow { unit: string; date: string; linked: number; success: number; optOut: number; noJobs: number; error: number }

interface LineReportResponse {
    startDate: string
    endDate: string
    sources: SourceRow[]
    daily: DailyRow[]
    cv: { applyCv: number; lpApplyCv: number; signupCv: number }
    deliveries: DeliveryRow[] | null
    deliveryAccess: boolean
}

const PERIOD_OPTIONS = [
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
    const [period, setPeriod] = useState('30daysAgo')
    const [data, setData] = useState<LineReportResponse | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        if (!currentProduct?.ga4PropertyId) return
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/line-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ propertyId: currentProduct.ga4PropertyId, startDate: period, endDate: 'yesterday' }),
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
    }, [currentProduct?.ga4PropertyId, period])

    useEffect(() => { load() }, [load])

    const sumUsers = data ? data.sources.reduce((s, r) => s + r.users, 0) : 0
    const sumSessions = data ? data.sources.reduce((s, r) => s + r.sessions, 0) : 0
    // 円換算: 応募・LP応募は人材紹介単価で近似、登録は単独登録単価
    const cvYen = data
        ? data.cv.applyCv * CV_UNIT_VALUE_YEN.JobR + data.cv.lpApplyCv * CV_UNIT_VALUE_YEN.JobR + data.cv.signupCv * CV_UNIT_VALUE_YEN.signup
        : 0
    const totalCv = data ? data.cv.applyCv + data.cv.lpApplyCv + data.cv.signupCv : 0
    const latestDelivery = data?.deliveries?.[0] ?? null
    const maxDaily = data ? Math.max(1, ...data.daily.map((d) => d.users)) : 1

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>LINE配信レポート</h1>
                    <p className={styles.subtitle}>
                        LINE経由（utm_medium=line）の再訪・CVと、おすすめ求人LINE配信（毎週火曜・連携者向け）の実績。LINE施策の判定基盤です。
                    </p>
                </div>
                <BackLink href="/">ダッシュボード</BackLink>
            </div>

            {!currentProduct && <div className={styles.notice}>プロダクトを選択してください</div>}

            <RelatedPages pages={[{ href: '/cv-value', label: 'CV単価・お金まわり' }, { href: '/cv-types', label: '求人種別CV分析' }, { href: '/insights', label: '月次インサイトレポート' }]} />

            <div className={styles.controls}>
                <select className={styles.select} value={period} onChange={(e) => setPeriod(e.target.value)}>
                    {PERIOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {data && <span className={styles.periodNote}>集計期間: {data.startDate} 〜 {data.endDate}</span>}
            </div>

            {loading && <p className={styles.loading}>読み込み中...</p>}
            {error && <div className={styles.error}>{error}</div>}

            {data && !loading && (
                <>
                    <div className={styles.summaryRow}>
                        <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>LINE連携者（最新配信時点）</span>
                            <span className={styles.summaryValue}>{latestDelivery ? latestDelivery.linked.toLocaleString() : '－'}</span>
                            <span className={styles.summaryHint}>{latestDelivery ? `配信成功 ${latestDelivery.success.toLocaleString()}人` : 'BQ権限付与後に表示'}</span>
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
                        {!data.deliveryAccess && (
                            <div className={styles.notice}>
                                BQテーブル <code>xmile-drm.xwork.line_job_recommendation_unit_stats</code> への閲覧権限がありません。<br />
                                サービスアカウント <strong>ai-product-dashboard@hrs-div.iam.gserviceaccount.com</strong> に
                                xmile-drm プロジェクトの xwork データセットの「BigQuery データ閲覧者」を付与すると、このセクションに配信実績（連携者数の推移・配信成功・スキップ内訳）が表示されます。
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
                                    {data.daily.map((d) => (
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
