'use client'

import { useMemo, useState } from 'react'
import { useProduct } from '@/lib/contexts/ProductContext'
import SignupTrendChart from '@/components/signup-funnel/SignupTrendChart'
import ScoutAttributeSections from '@/components/scout/ScoutAttributeSections'
import ScoutFunnelStages from '@/components/scout/ScoutFunnelStages'
import ScoutHourlyClickRate from '@/components/scout/ScoutHourlyClickRate'
import PageShell from '@/components/PageShell'
import PeriodSelect from '@/components/PeriodSelect'
import { ui, cx } from '@/components/ui'
import { usePeriodRange } from '@/hooks/usePeriodRange'
import { useReport } from '@/hooks/useReport'
import { type PeriodOption } from '@/lib/utils/period'
import { CHART_COLORS } from '@/lib/constants/chartColors'
import type { ScoutFunnelResponse } from '@/lib/services/scout/scoutFunnelTypes'
import styles from './ScoutPage.module.css'

const PERIOD_OPTIONS: PeriodOption[] = [
    { value: '7daysAgo', label: '過去7日' },
    { value: '14daysAgo', label: '過去14日' },
    { value: '30daysAgo', label: '過去30日' },
    { value: '90daysAgo', label: '過去90日' },
    { value: '180daysAgo', label: '過去180日' },
]

// 系列色は固定順: 送信=青 / 応募=緑 / 閲覧=琥珀（日別表のバーと同じ）
const SERIES_COLORS = [CHART_COLORS.blue, CHART_COLORS.green, CHART_COLORS.amber]

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

const COMPANY_PAGE_SIZE = 15

export default function ScoutFunnelPage() {
    const { currentProduct } = useProduct()
    const periodState = usePeriodRange('30daysAgo')
    const { range, period } = periodState
    // 企業別内訳テーブルの検索・ページネーション・選択
    const [companyQuery, setCompanyQuery] = useState('')
    const [companyPage, setCompanyPage] = useState(0)
    const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null)

    // 相対期間（過去N日・今月）は当日速報まで含める。前月・カスタムは指定期間を尊重。
    const endDate = period === 'lastMonth' || period === 'custom' ? range?.endDate : 'today'
    const report = useReport<ScoutFunnelResponse>('/api/scout/funnel', {
        body: { propertyId: currentProduct?.ga4PropertyId, startDate: range?.startDate, endDate },
        enabled: !!currentProduct && !!range,
    })
    const data = report.data

    // 日別推移テーブル: 新しい日付が上。値が0の日は最新7日を除き省略
    const maxDaily = data ? Math.max(1, ...data.daily.map((d) => Math.max(d.requested, d.viewed, d.applied))) : 1
    const recentDaily = data ? [...data.daily].reverse().filter((d, i) => d.requested > 0 || d.viewed > 0 || d.applied > 0 || i < 7) : []

    // 35日超は週次に合算してチャート表示
    const isWeekly = (data?.daily.length ?? 0) > 35
    const buildChart = (values: { requested: number[]; viewed: number[]; applied: number[] }) => {
        if (!data) return null
        const dates = data.daily.map((d) => d.date)
        const metrics = [
            { name: '送信リクエスト', color: SERIES_COLORS[0], values: values.requested },
            { name: '閲覧UU', color: SERIES_COLORS[2], values: values.viewed },
            { name: '応募', color: SERIES_COLORS[1], values: values.applied },
        ]
        if (isWeekly) {
            const agg = metrics.map((m) => toWeekly(dates, m.values))
            return { labels: agg[0].labels, series: metrics.map((m, i) => ({ name: m.name, color: m.color, data: agg[i].values })) }
        }
        return { labels: dates.map(fmtDateLabel), series: metrics.map((m) => ({ name: m.name, color: m.color, data: m.values })) }
    }

    const trendChart = useMemo(
        () => (data ? buildChart({ requested: data.daily.map((d) => d.requested), viewed: data.daily.map((d) => d.viewed), applied: data.daily.map((d) => d.applied) }) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [data, isWeekly],
    )

    // 企業別内訳: 検索フィルタ＋ページネーション
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
        const chart = buildChart(dailyRow)
        return chart ? { meta, chart } : null
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, selectedCompanyId, isWeekly])

    return (
        <PageShell
            pageId="scout"
            requireProduct
            status={{ loading: report.loading, error: report.error, source: 'ga4', loadingText: 'DB・GA4から集計中...', onRetry: report.run }}
            controls={<PeriodSelect state={periodState} options={PERIOD_OPTIONS} resolved={data} />}
        >
            {data && (
                <>
                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>全体ファネル</h2>
                        <ScoutFunnelStages summary={data.summary} />
                        <p className={ui.tableNote}>※ バー幅＝直前段からの通過率。崖①=送達→クリック（最大の漏れ）、崖②=クリック→フォーム到達。</p>
                    </div>

                    {trendChart && (
                        <div className={ui.card}>
                            <h2 className={ui.sectionTitle}>推移（送信・閲覧・応募）{isWeekly && ' — 週次'}</h2>
                            <SignupTrendChart labels={trendChart.labels} series={trendChart.series} />
                        </div>
                    )}

                    {data.hourly && data.hourly.some((h) => h.sent > 0) && (
                        <div className={ui.card}>
                            <h2 className={ui.sectionTitle}>時間別 送信数・クリック率（送信時刻・JST）</h2>
                            <ScoutHourlyClickRate hourly={data.hourly} />
                        </div>
                    )}

                    <div className={ui.card}>
                        <div className={styles.tableHeader}>
                            <h2 className={ui.sectionTitle} style={{ marginBottom: 0 }}>企業別内訳</h2>
                            <input
                                type="search"
                                className={styles.searchInput}
                                placeholder="企業名で検索"
                                value={companyQuery}
                                onChange={(e) => { setCompanyQuery(e.target.value); setCompanyPage(0) }}
                            />
                        </div>
                        <div className={ui.tableWrap}>
                            <table className={ui.dataTable}>
                                <thead>
                                    <tr>
                                        <th>企業</th>
                                        <th className={ui.num}>送信リクエスト</th>
                                        <th className={ui.num}>送達</th>
                                        <th className={ui.num}>閲覧UU</th>
                                        <th className={ui.num}>クリック率</th>
                                        <th className={ui.num}>応募</th>
                                        <th className={ui.num}>閲覧→応募</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pagedCompanies.map((c) => (
                                        <tr
                                            key={c.companyId}
                                            className={cx(styles.clickableRow, c.companyId === selectedCompanyId && styles.selectedRow)}
                                            onClick={() => setSelectedCompanyId(c.companyId === selectedCompanyId ? null : c.companyId)}
                                        >
                                            <td>{c.companyName ?? c.companyId}</td>
                                            <td className={ui.num}>{c.requested.toLocaleString()}</td>
                                            <td className={ui.num}>{c.sent > 0 ? c.sent.toLocaleString() : '－'}</td>
                                            <td className={ui.num}>{c.viewed.toLocaleString()}</td>
                                            <td className={ui.num}>{c.sent > 0 ? pct(c.viewed, c.sent) : '－'}</td>
                                            <td className={ui.num}>{c.applied.toLocaleString()}</td>
                                            <td className={ui.num}>{pct(c.applied, c.viewed)}</td>
                                        </tr>
                                    ))}
                                    {pagedCompanies.length === 0 && (
                                        <tr><td colSpan={7} className={ui.empty}>該当する企業がありません</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {companyPageCount > 1 && (
                            <div className={styles.pagination}>
                                <button type="button" className={ui.btn} disabled={safeCompanyPage === 0} onClick={() => setCompanyPage(safeCompanyPage - 1)}>前へ</button>
                                <span className={ui.note}>{safeCompanyPage + 1} / {companyPageCount}ページ（{filteredCompanies.length}社）</span>
                                <button type="button" className={ui.btn} disabled={safeCompanyPage >= companyPageCount - 1} onClick={() => setCompanyPage(safeCompanyPage + 1)}>次へ</button>
                            </div>
                        )}
                        <p className={ui.tableNote}>※ 行をクリックすると、その企業の送信・閲覧・応募の推移を下に表示します。</p>
                    </div>

                    {selectedCompany && (
                        <div className={ui.card}>
                            <div className={styles.tableHeader}>
                                <h2 className={ui.sectionTitle} style={{ marginBottom: 0 }}>
                                    {selectedCompany.meta.companyName ?? selectedCompany.meta.companyId} の推移（送信・閲覧・応募）{isWeekly && ' — 週次'}
                                </h2>
                                <button type="button" className={ui.btnGhost} onClick={() => setSelectedCompanyId(null)}>閉じる</button>
                            </div>
                            <SignupTrendChart labels={selectedCompany.chart.labels} series={selectedCompany.chart.series} />
                            <p className={ui.tableNote}>
                                期間合計: 送信 {selectedCompany.meta.requested.toLocaleString()} ／ 送達 {selectedCompany.meta.sent > 0 ? selectedCompany.meta.sent.toLocaleString() : '－'} ／ 閲覧UU {selectedCompany.meta.viewed.toLocaleString()} ／ 応募 {selectedCompany.meta.applied.toLocaleString()}
                            </p>
                        </div>
                    )}

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>日別推移（新しい順）</h2>
                        <div className={ui.tableWrap}>
                            <table className={ui.dataTable}>
                                <thead>
                                    <tr>
                                        <th>日付</th>
                                        <th className={ui.num}>送信リクエスト</th>
                                        <th className={ui.num}>閲覧UU</th>
                                        <th className={ui.num}>応募</th>
                                        <th className={styles.barCol}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentDaily.map((d) => (
                                        <tr key={d.date}>
                                            <td>{d.date}</td>
                                            <td className={ui.num}>{d.requested.toLocaleString()}</td>
                                            <td className={ui.num}>{d.viewed.toLocaleString()}</td>
                                            <td className={ui.num}>{d.applied.toLocaleString()}</td>
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
                        <p className={ui.tableNote}>※ 値が0の日は最新7日を除き省略。バーは上から送信リクエスト（青）・閲覧（黄）・応募（緑）。</p>
                    </div>

                    <p className={ui.tableNote}>
                        ※ 送信リクエスト: ScoutHistoriesの期間内attempt数（status = requested / sent / failed / skipped の合計。送達=sent、スキップ=送信対象外と判定された件数）。<br />
                        ※ 閲覧: /scout/ ページのGA4ユニークユーザー。過去に送られたスカウトの閲覧も期間内に含まれるため、送信数と分母は一致しません。<br />
                        ※ 応募: scoutId付きURLでのエントリーフォーム送信ボタンクリック（クリック=実応募一致をDB照合で確認済み）。スカウトID経由で企業に紐付けています。
                    </p>
                </>
            )}

            <ScoutAttributeSections />
        </PageShell>
    )
}
