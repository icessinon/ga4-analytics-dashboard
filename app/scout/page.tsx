'use client'

import { useCallback, useEffect, useState } from 'react'
import { useProduct } from '@/lib/contexts/ProductContext'
import BackLink from '@/components/BackLink'
import RelatedPages from '@/components/RelatedPages/RelatedPages'
import { parseJsonResponse } from '@/lib/utils/fetch'
import styles from './ScoutPage.module.css'

interface DailyRow {
    date: string
    requested: number
    viewed: number
    applied: number
}

interface CompanyRow {
    companyId: string
    companyName: string | null
    requested: number
    sent: number
    viewed: number
    applied: number
}

interface ScoutFunnelResponse {
    startDate: string
    endDate: string
    summary: {
        requested: number
        sent: number
        failed: number
        viewedUsers: number
        viewedScoutIds: number
        appliedUsers: number
    }
    daily: DailyRow[]
    companies: CompanyRow[]
    fetchedAt: string
}

const PERIOD_OPTIONS = [
    { value: '7daysAgo', label: '過去7日' },
    { value: '30daysAgo', label: '過去30日' },
    { value: '90daysAgo', label: '過去90日' },
    { value: '180daysAgo', label: '過去180日' },
]

function pct(num: number, den: number): string {
    return den > 0 ? `${((num / den) * 100).toFixed(1)}%` : '－'
}

export default function ScoutFunnelPage() {
    const { currentProduct } = useProduct()
    const [period, setPeriod] = useState('30daysAgo')
    const [data, setData] = useState<ScoutFunnelResponse | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        if (!currentProduct?.ga4PropertyId) return
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/scout/funnel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    propertyId: currentProduct.ga4PropertyId,
                    startDate: period,
                    endDate: 'yesterday',
                }),
            })
            const json = await parseJsonResponse<ScoutFunnelResponse & { error?: string; message?: string }>(res)
            if (!res.ok) throw new Error(json.message || json.error || '取得に失敗しました')
            setData(json)
        } catch (e) {
            setError(e instanceof Error ? e.message : '取得に失敗しました')
            setData(null)
        } finally {
            setLoading(false)
        }
    }, [currentProduct?.ga4PropertyId, period])

    useEffect(() => { load() }, [load])

    const maxDaily = data ? Math.max(1, ...data.daily.map((d) => Math.max(d.requested, d.viewed, d.applied))) : 1
    const recentDaily = data ? data.daily.filter((d, i) => d.requested > 0 || d.viewed > 0 || d.applied > 0 || i >= data.daily.length - 7) : []

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>スカウト効果ファネル</h1>
                    <p className={styles.subtitle}>
                        スカウトの送信リクエスト（DB）→ スカウトページ閲覧（GA4）→ 応募（送信ボタンクリック）を一本のファネルで確認します。
                    </p>
                </div>
                <BackLink href="/">ダッシュボード</BackLink>
            </div>

            {!currentProduct && <div className={styles.notice}>プロダクトを選択してください</div>}

            <RelatedPages pages={[{ href: '/cv-types', label: '求人種別CV分析' }, { href: '/pageflow', label: 'ページフロー分析' }, { href: '/funnel/path', label: '経路ファネルビルダー' }]} />

            <div className={styles.controls}>
                <select className={styles.select} value={period} onChange={(e) => setPeriod(e.target.value)}>
                    {PERIOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {data && <span className={styles.periodNote}>集計期間: {data.startDate} 〜 {data.endDate}</span>}
            </div>

            {loading && <p className={styles.loading}>DB・GA4から集計中...</p>}
            {error && <div className={styles.error}>{error}</div>}

            {data && !loading && (
                <>
                    <div className={styles.summaryRow}>
                        <div className={styles.summaryCard} style={{ borderTopColor: '#60a5fa' }}>
                            <span className={styles.summaryLabel}>送信リクエスト</span>
                            <span className={styles.summaryValue}>{data.summary.requested.toLocaleString()}</span>
                            <span className={styles.summaryHint}>ScoutHistories（期間内attempt数）</span>
                        </div>
                        <div className={styles.summaryCard} style={{ borderTopColor: '#94a3b8' }}>
                            <span className={styles.summaryLabel}>送達（sent）</span>
                            <span className={styles.summaryValue}>{data.summary.sent.toLocaleString()}</span>
                            <span className={styles.summaryHint}>
                                {data.summary.sent === 0 ? '未計測（送信結果の書き戻し実装待ち）' : `送達率 ${pct(data.summary.sent, data.summary.requested)}`}
                            </span>
                        </div>
                        <div className={styles.summaryCard} style={{ borderTopColor: '#fbbf24' }}>
                            <span className={styles.summaryLabel}>スカウトページ閲覧</span>
                            <span className={styles.summaryValue}>{data.summary.viewedUsers.toLocaleString()}</span>
                            <span className={styles.summaryHint}>ユニークユーザー ／ {data.summary.viewedScoutIds}スカウトID</span>
                        </div>
                        <div className={styles.summaryCard} style={{ borderTopColor: '#4ade80' }}>
                            <span className={styles.summaryLabel}>応募（クリック）</span>
                            <span className={styles.summaryValue}>{data.summary.appliedUsers.toLocaleString()}</span>
                            <span className={styles.summaryHint}>閲覧→応募 {pct(data.summary.appliedUsers, data.summary.viewedUsers)}</span>
                        </div>
                    </div>

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>企業別内訳</h2>
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>企業</th>
                                        <th className={styles.num}>送信リクエスト</th>
                                        <th className={styles.num}>送達</th>
                                        <th className={styles.num}>閲覧UU</th>
                                        <th className={styles.num}>応募</th>
                                        <th className={styles.num}>閲覧→応募</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.companies.map((c) => (
                                        <tr key={c.companyId}>
                                            <td>{c.companyName ?? c.companyId}</td>
                                            <td className={styles.num}>{c.requested.toLocaleString()}</td>
                                            <td className={styles.num}>{c.sent > 0 ? c.sent.toLocaleString() : '－'}</td>
                                            <td className={styles.num}>{c.viewed.toLocaleString()}</td>
                                            <td className={styles.num}>{c.applied.toLocaleString()}</td>
                                            <td className={styles.num}>{pct(c.applied, c.viewed)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>日別推移</h2>
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>日付</th>
                                        <th className={styles.num}>送信リクエスト</th>
                                        <th className={styles.num}>閲覧UU</th>
                                        <th className={styles.num}>応募</th>
                                        <th className={styles.barCol}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentDaily.map((d) => (
                                        <tr key={d.date}>
                                            <td>{d.date}</td>
                                            <td className={styles.num}>{d.requested.toLocaleString()}</td>
                                            <td className={styles.num}>{d.viewed.toLocaleString()}</td>
                                            <td className={styles.num}>{d.applied.toLocaleString()}</td>
                                            <td className={styles.barCol}>
                                                <div className={styles.barStack}>
                                                    <div className={styles.barReq} style={{ width: `${(d.requested / maxDaily) * 100}%` }} />
                                                    <div className={styles.barView} style={{ width: `${(d.viewed / maxDaily) * 100}%` }} />
                                                    <div className={styles.barApply} style={{ width: `${(d.applied / maxDaily) * 100}%` }} />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className={styles.tableNote}>
                            ※ 値が0の日は直近7日を除き省略。バーは上から送信リクエスト（青）・閲覧（黄）・応募（緑）。
                        </p>
                    </div>

                    <p className={styles.note}>
                        ※ 送信リクエスト: ScoutHistoriesの期間内attempt数（現状は全件status=requestedのため、送達数はSMS送信結果の書き戻し実装後に表示されます）。<br />
                        ※ 閲覧: /scout/ ページのGA4ユニークユーザー。過去に送られたスカウトの閲覧も期間内に含まれるため、送信数と分母は一致しません。<br />
                        ※ 応募: scoutId付きURLでのエントリーフォーム送信ボタンクリック（クリック=実応募一致をDB照合で確認済み）。スカウトID経由で企業に紐付けています。
                    </p>
                </>
            )}
        </div>
    )
}
