'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useProduct } from '@/lib/contexts/ProductContext'
import BackLink from '@/components/BackLink'
import RelatedPages from '@/components/RelatedPages/RelatedPages'
import SignupTrendChart from '@/components/signup-funnel/SignupTrendChart'
import PeriodSelect, { usePeriodRange } from '@/components/PeriodSelect/PeriodSelect'
import { PeriodOption } from '@/lib/utils/period'
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

interface CompanyDailyRow {
    companyId: string
    companyName: string | null
    requested: number[]
    viewed: number[]
    applied: number[]
}

interface ScoutFunnelResponse {
    startDate: string
    endDate: string
    summary: {
        requested: number
        sent: number
        failed: number
        skipped?: number
        viewedUsers: number
        viewedScoutIds: number
        appliedUsers: number
    }
    daily: DailyRow[]
    companies: CompanyRow[]
    companyDaily?: CompanyDailyRow[]
    fetchedAt: string
}

const PERIOD_OPTIONS: PeriodOption[] = [
    { value: '7daysAgo', label: '過去7日' },
    { value: '14daysAgo', label: '過去14日' },
    { value: '30daysAgo', label: '過去30日' },
    { value: '90daysAgo', label: '過去90日' },
    { value: '180daysAgo', label: '過去180日' },
    { value: 'thisMonth', label: '今月' },
    { value: 'lastMonth', label: '前月' },
    { value: 'custom', label: 'カスタム（日付指定）' },
]

// 検証済みダークパレット（dataviz参照パレット準拠・固定順）
const SERIES_COLORS = ['#3987e5', '#199e70', '#c98500']

function fmtDateLabel(d: string): string {
    return `${parseInt(d.slice(5, 7), 10)}/${parseInt(d.slice(8, 10), 10)}`
}

// 日次配列を週次（月曜始まり）に合算する
function toWeekly(dates: string[], values: number[]): { labels: string[]; values: number[] } {
    const labels: string[] = []
    const out: number[] = []
    let currentWeek = ''
    for (let i = 0; i < dates.length; i++) {
        const d = new Date(`${dates[i]}T00:00:00`)
        const monday = new Date(d)
        monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
        const weekKey = `${monday.getMonth() + 1}/${monday.getDate()}週`
        if (weekKey !== currentWeek) {
            currentWeek = weekKey
            labels.push(weekKey)
            out.push(0)
        }
        out[out.length - 1] += values[i]
    }
    return { labels, values: out }
}

function pct(num: number, den: number): string {
    return den > 0 ? `${((num / den) * 100).toFixed(1)}%` : '－'
}

export default function ScoutFunnelPage() {
    const { currentProduct } = useProduct()
    const periodState = usePeriodRange('30daysAgo')
    const { range } = periodState
    const [data, setData] = useState<ScoutFunnelResponse | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // 企業別内訳テーブルの検索・ページネーション・選択
    const [companyQuery, setCompanyQuery] = useState('')
    const [companyPage, setCompanyPage] = useState(0)
    const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null)

    const load = useCallback(async () => {
        if (!currentProduct?.ga4PropertyId || !range) return
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/scout/funnel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    propertyId: currentProduct.ga4PropertyId,
                    startDate: range.startDate,
                    endDate: range.endDate,
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
    }, [currentProduct?.ga4PropertyId, range])

    useEffect(() => { load() }, [load])

    // 日別推移テーブル: 新しい日付が上。値が0の日は最新7日を除き省略
    const maxDaily = data ? Math.max(1, ...data.daily.map((d) => Math.max(d.requested, d.viewed, d.applied))) : 1
    const recentDaily = data
        ? [...data.daily].reverse().filter((d, i) => d.requested > 0 || d.viewed > 0 || d.applied > 0 || i < 7)
        : []

    // 35日超は週次に合算してチャート表示
    const isWeekly = (data?.daily.length ?? 0) > 35
    const trendChart = useMemo(() => {
        if (!data) return null
        const dates = data.daily.map((d) => d.date)
        const metrics: Array<{ name: string; color: string; values: number[] }> = [
            { name: '送信リクエスト', color: SERIES_COLORS[0], values: data.daily.map((d) => d.requested) },
            { name: '閲覧UU', color: SERIES_COLORS[2], values: data.daily.map((d) => d.viewed) },
            { name: '応募', color: SERIES_COLORS[1], values: data.daily.map((d) => d.applied) },
        ]
        if (isWeekly) {
            const agg = metrics.map((m) => toWeekly(dates, m.values))
            return {
                labels: agg[0].labels,
                series: metrics.map((m, i) => ({ name: m.name, color: m.color, data: agg[i].values })),
            }
        }
        return {
            labels: dates.map(fmtDateLabel),
            series: metrics.map((m) => ({ name: m.name, color: m.color, data: m.values })),
        }
    }, [data, isWeekly])

    // 企業別内訳: 検索フィルタ＋ページネーション
    const COMPANY_PAGE_SIZE = 15
    const filteredCompanies = useMemo(() => {
        if (!data) return []
        const q = companyQuery.trim().toLowerCase()
        if (!q) return data.companies
        return data.companies.filter((c) => (c.companyName ?? c.companyId).toLowerCase().includes(q))
    }, [data, companyQuery])
    const companyPageCount = Math.max(1, Math.ceil(filteredCompanies.length / COMPANY_PAGE_SIZE))
    const safeCompanyPage = Math.min(companyPage, companyPageCount - 1)
    const pagedCompanies = filteredCompanies.slice(safeCompanyPage * COMPANY_PAGE_SIZE, (safeCompanyPage + 1) * COMPANY_PAGE_SIZE)

    // 選択企業の個別チャート（送信・閲覧・応募のミニファネル推移）
    const selectedCompany = useMemo(() => {
        if (!data || !selectedCompanyId) return null
        const meta = data.companies.find((c) => c.companyId === selectedCompanyId)
        const dailyRow = data.companyDaily?.find((c) => c.companyId === selectedCompanyId)
        if (!meta || !dailyRow) return null
        const dates = data.daily.map((d) => d.date)
        const metrics = [
            { name: '送信リクエスト', color: SERIES_COLORS[0], values: dailyRow.requested },
            { name: '閲覧UU', color: SERIES_COLORS[2], values: dailyRow.viewed },
            { name: '応募', color: SERIES_COLORS[1], values: dailyRow.applied },
        ]
        if (isWeekly) {
            const agg = metrics.map((m) => toWeekly(dates, m.values))
            return {
                meta,
                chart: {
                    labels: agg[0].labels,
                    series: metrics.map((m, i) => ({ name: m.name, color: m.color, data: agg[i].values })),
                },
            }
        }
        return {
            meta,
            chart: {
                labels: dates.map(fmtDateLabel),
                series: metrics.map((m) => ({ name: m.name, color: m.color, data: m.values })),
            },
        }
    }, [data, selectedCompanyId, isWeekly])

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
                <PeriodSelect
                    state={periodState}
                    options={PERIOD_OPTIONS}
                    selectClassName={styles.select}
                    noteClassName={styles.periodNote}
                    resolved={data}
                />
            </div>

            {loading && <p className={styles.loading}>DB・GA4から集計中...</p>}
            {error && <div className={styles.error}>{error}</div>}

            {data && !loading && (
                <>
                    <div className={styles.summaryRow}>
                        <div className={styles.summaryCard} style={{ borderTopColor: '#60a5fa' }}>
                            <span className={styles.summaryLabel}>送信リクエスト</span>
                            <span className={styles.summaryValue}>{data.summary.requested.toLocaleString()}</span>
                            <span className={styles.summaryHint}>
                                ScoutHistories（期間内attempt数{(data.summary.skipped ?? 0) > 0 ? `・うちスキップ${data.summary.skipped}件` : ''}）
                            </span>
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

                    {trendChart && (
                        <div className={styles.card}>
                            <h2 className={styles.sectionTitle}>推移（送信・閲覧・応募）{isWeekly && ' — 週次'}</h2>
                            <SignupTrendChart labels={trendChart.labels} series={trendChart.series} />
                        </div>
                    )}

                    <div className={styles.card}>
                        <div className={styles.tableHeader}>
                            <h2 className={styles.sectionTitle}>企業別内訳</h2>
                            <input
                                type="search"
                                className={styles.searchInput}
                                placeholder="企業名で検索"
                                value={companyQuery}
                                onChange={(e) => { setCompanyQuery(e.target.value); setCompanyPage(0) }}
                            />
                        </div>
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
                                    {pagedCompanies.map((c) => (
                                        <tr
                                            key={c.companyId}
                                            className={`${styles.clickableRow} ${c.companyId === selectedCompanyId ? styles.selectedRow : ''}`}
                                            onClick={() => setSelectedCompanyId(c.companyId === selectedCompanyId ? null : c.companyId)}
                                        >
                                            <td>{c.companyName ?? c.companyId}</td>
                                            <td className={styles.num}>{c.requested.toLocaleString()}</td>
                                            <td className={styles.num}>{c.sent > 0 ? c.sent.toLocaleString() : '－'}</td>
                                            <td className={styles.num}>{c.viewed.toLocaleString()}</td>
                                            <td className={styles.num}>{c.applied.toLocaleString()}</td>
                                            <td className={styles.num}>{pct(c.applied, c.viewed)}</td>
                                        </tr>
                                    ))}
                                    {pagedCompanies.length === 0 && (
                                        <tr><td colSpan={6}>該当する企業がありません</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {companyPageCount > 1 && (
                            <div className={styles.pagination}>
                                <button
                                    className={styles.pageBtn}
                                    disabled={safeCompanyPage === 0}
                                    onClick={() => setCompanyPage(safeCompanyPage - 1)}
                                >前へ</button>
                                <span className={styles.periodNote}>{safeCompanyPage + 1} / {companyPageCount}ページ（{filteredCompanies.length}社）</span>
                                <button
                                    className={styles.pageBtn}
                                    disabled={safeCompanyPage >= companyPageCount - 1}
                                    onClick={() => setCompanyPage(safeCompanyPage + 1)}
                                >次へ</button>
                            </div>
                        )}
                        <p className={styles.tableNote}>※ 行をクリックすると、その企業の送信・閲覧・応募の推移を下に表示します。</p>
                    </div>

                    {selectedCompany && (
                        <div className={styles.card}>
                            <div className={styles.tableHeader}>
                                <h2 className={styles.sectionTitle}>
                                    {selectedCompany.meta.companyName ?? selectedCompany.meta.companyId} の推移（送信・閲覧・応募）{isWeekly && ' — 週次'}
                                </h2>
                                <button className={styles.pageBtn} onClick={() => setSelectedCompanyId(null)}>閉じる</button>
                            </div>
                            <SignupTrendChart labels={selectedCompany.chart.labels} series={selectedCompany.chart.series} />
                            <p className={styles.tableNote}>
                                期間合計: 送信 {selectedCompany.meta.requested.toLocaleString()} ／ 送達 {selectedCompany.meta.sent > 0 ? selectedCompany.meta.sent.toLocaleString() : '－'} ／ 閲覧UU {selectedCompany.meta.viewed.toLocaleString()} ／ 応募 {selectedCompany.meta.applied.toLocaleString()}
                            </p>
                        </div>
                    )}

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>日別推移（新しい順）</h2>
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
                            ※ 値が0の日は最新7日を除き省略。バーは上から送信リクエスト（青）・閲覧（黄）・応募（緑）。
                        </p>
                    </div>

                    <p className={styles.note}>
                        ※ 送信リクエスト: ScoutHistoriesの期間内attempt数（status = requested / sent / failed / skipped の合計。送達=sent、スキップ=送信対象外と判定された件数）。<br />
                        ※ 閲覧: /scout/ ページのGA4ユニークユーザー。過去に送られたスカウトの閲覧も期間内に含まれるため、送信数と分母は一致しません。<br />
                        ※ 応募: scoutId付きURLでのエントリーフォーム送信ボタンクリック（クリック=実応募一致をDB照合で確認済み）。スカウトID経由で企業に紐付けています。
                    </p>
                </>
            )}
        </div>
    )
}
