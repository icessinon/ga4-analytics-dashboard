'use client'

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import PageShell from '@/components/PageShell'
import { ui, cx } from '@/components/ui'
import { useReport } from '@/hooks/useReport'
import { CHART_COLORS } from '@/lib/constants/chartColors'
import type { AiUsageLog, AiUsageResponse } from '@/lib/services/aiUsage/aiUsageTypes'
import styles from './AiUsagePage.module.css'

interface PeriodRow {
    key: string
    label: string
    calls: number
    tokens: number
    costUsd: number
}

type TabKey = 'daily' | 'weekly' | 'monthly'
const TABS: ReadonlyArray<{ id: TabKey; label: string }> = [
    { id: 'daily', label: '日次' },
    { id: 'weekly', label: '週次' },
    { id: 'monthly', label: '月次' },
]

/** ログの関数名 → 画面上の機能名と呼び出し元ページ */
const FUNCTION_DETAILS: Record<string, { name: string; page: string }> = {
    generateWeeklyInsightWithGemini: { name: '月次インサイト生成', page: '/insights' },
    analyzeStickinessWithGemini: { name: 'スティッキネス分析', page: '/user/stickiness' },
    analyzeDropoutPathsWithGemini: { name: '離脱経路分析', page: '/journey' },
    analyzeScoringWithGemini: { name: '活動スコアリング診断', page: '/user/scoring' },
    evaluateFunnelWithGemini: { name: 'ファネル評価', page: '/funnel' },
    evaluateComparisonWithGemini: { name: 'ファネル期間比較評価', page: '/funnel' },
    analyzeTrendWithGemini: { name: 'トレンド傾向分析', page: '/trend' },
    analyzeEngagementWithGemini: { name: 'エンゲージメント分析', page: '/funnel/engagement' },
    evaluateWithGemini: { name: 'ABテスト評価', page: '/ab-test' },
}
const detailOf = (raw: string) => FUNCTION_DETAILS[raw] ?? { name: raw, page: null }

const JPY_RATE = 150
const fmtUsd = (n: number) => `$${n.toFixed(6)}`
const fmtJpy = (usd: number) => `¥${Math.round(usd * JPY_RATE).toLocaleString()}`
const fmtTokens = (n: number) => n.toLocaleString()
const pad = (n: number) => String(n).padStart(2, '0')
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}` }

/** ログの日付（YYYY/MM/DD）→ その週の月曜日 */
function weekKey(dateStr: string): string {
    const [y, m, d] = dateStr.split('/').map(Number)
    const date = new Date(y, m - 1, d)
    const monday = new Date(date)
    monday.setDate(date.getDate() + (date.getDay() === 0 ? -6 : 1 - date.getDay()))
    return `${monday.getFullYear()}/${pad(monday.getMonth() + 1)}/${pad(monday.getDate())}`
}
const monthKey = (dateStr: string) => dateStr.slice(0, 7)
const periodKeyOf = (date: string, tab: TabKey) => (tab === 'daily' ? date : tab === 'weekly' ? weekKey(date) : monthKey(date))

function buildPeriodRows(logs: AiUsageLog[], tab: TabKey): PeriodRow[] {
    const map = new Map<string, PeriodRow>()
    for (const log of logs) {
        const key = periodKeyOf(log.date, tab)
        const row = map.get(key) ?? { key, label: tab === 'weekly' ? `${key}〜` : key, calls: 0, tokens: 0, costUsd: 0 }
        row.calls += 1
        row.tokens += log.totalTokens
        row.costUsd += log.costUsd
        map.set(key, row)
    }
    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key))
}

function downloadCsv(filename: string, lines: string[]) {
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
}
const dateStamp = () => todayStr().replaceAll('/', '')

function exportPeriodCsv(rows: PeriodRow[], tab: TabKey) {
    downloadCsv(`ai-usage-${tab}-${dateStamp()}.csv`, [
        '期間,呼び出し数,合計トークン,コスト(USD),コスト(JPY)',
        ...rows.map((r) => [r.label, r.calls, r.tokens, fmtUsd(r.costUsd), fmtJpy(r.costUsd)].join(',')),
    ])
}

function exportFullCsv(logs: AiUsageLog[]) {
    downloadCsv(`ai-usage-full-${dateStamp()}.csv`, [
        '日時,機能名,ページ,モデル,入力トークン,思考トークン,出力トークン,合計トークン,コスト(USD),コスト(JPY)',
        ...logs.map((l) => {
            const d = detailOf(l.function)
            return [`${l.date} ${l.time}`, d.name, d.page ?? '', l.model, l.promptTokens, l.thinkingTokens, l.completionTokens, l.totalTokens, fmtUsd(l.costUsd), fmtJpy(l.costUsd)].join(',')
        }),
    ])
}

function CostTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: PeriodRow }> }) {
    if (!active || !payload?.length) return null
    const row = payload[0].payload
    return (
        <div className={styles.chartTooltip}>
            <div className={styles.chartTooltipLabel}>{row.label}</div>
            <div>{fmtUsd(row.costUsd)}</div>
            <div className={styles.chartTooltipSub}>{row.calls}回 / {fmtTokens(row.tokens)} tokens</div>
        </div>
    )
}

function CostCells({ usd }: { usd: number }) {
    return (
        <>
            <td className={cx(ui.num, styles.costUsd)}>{fmtUsd(usd)}</td>
            <td className={cx(ui.num, styles.costJpy)}>{fmtJpy(usd)}</td>
        </>
    )
}

export default function AiUsagePage() {
    const report = useReport<AiUsageResponse>('/api/ai-usage')
    const [activeTab, setActiveTab] = useState<TabKey>('daily')
    const logs = report.data?.logs ?? []
    const summary = report.data?.summary ?? null

    const periodRows = useMemo(() => buildPeriodRows(logs, activeTab), [logs, activeTab])
    const today = todayStr()
    const todayCost = logs.filter((l) => l.date === today).reduce((acc, l) => acc + l.costUsd, 0)
    const currentRow = periodRows.find((r) => r.key === periodKeyOf(today, activeTab)) ?? null
    const periodAvgCost = periodRows.length > 0 ? periodRows.reduce((s, r) => s + r.costUsd, 0) / periodRows.length : 0
    const chartData = periodRows.slice(0, 30).reverse()
    const recentLogs = logs.slice(0, 20)
    const dominantModel = logs.find((l) => l.model)?.model ?? 'gemini-2.5-flash'
    const unit = activeTab === 'daily' ? '日' : activeTab === 'weekly' ? '週' : '月'
    const current = activeTab === 'daily' ? '今日' : activeTab === 'weekly' ? '今週' : '今月'

    return (
        <PageShell
            pageId="aiUsage"
            width="wide"
            subtitle={`Gemini の使用量とコストの概算（モデル: ${dominantModel}）。料金は概算で、実際の請求額は Google Cloud Console で確認してください`}
            status={{ loading: report.loading, error: report.error, source: 'db', onRetry: report.run }}
            actions={<button type="button" className={ui.btnGhost} onClick={() => exportFullCsv(logs)} disabled={logs.length === 0}>CSVで書き出し</button>}
        >
            {summary && (
                <>
                    <div className={ui.summaryRow}>
                        <div className={ui.summaryCard} style={{ '--summary-accent': CHART_COLORS.violet } as React.CSSProperties}>
                            <span className={ui.summaryLabel}>累計コスト (USD)</span>
                            <span className={ui.summaryValue}>{fmtUsd(summary.totalCostUsd)}</span>
                            <span className={ui.summaryHint}>{fmtJpy(summary.totalCostUsd)}</span>
                        </div>
                        <div className={ui.summaryCard}>
                            <span className={ui.summaryLabel}>本日のコスト</span>
                            <span className={ui.summaryValue}>{fmtUsd(todayCost)}</span>
                            <span className={ui.summaryHint}>{fmtJpy(todayCost)}</span>
                        </div>
                        <div className={ui.summaryCard}>
                            <span className={ui.summaryLabel}>累計呼び出し数</span>
                            <span className={ui.summaryValue}>{summary.callCount.toLocaleString()}</span>
                            <span className={ui.summaryHint}>回</span>
                        </div>
                        <div className={ui.summaryCard}>
                            <span className={ui.summaryLabel}>累計トークン数</span>
                            <span className={ui.summaryValue}>{fmtTokens(summary.totalTokens)}</span>
                            <span className={ui.summaryHint}>tokens</span>
                        </div>
                    </div>

                    <div className={ui.card}>
                        <div className={styles.sectionHead}>
                            <h2 className={ui.sectionTitle}>期間別コスト</h2>
                            <div className={styles.tabs} role="tablist">
                                {TABS.map((t) => (
                                    <button key={t.id} type="button" role="tab" aria-selected={activeTab === t.id}
                                        className={cx(styles.tab, activeTab === t.id && styles.tabActive)} onClick={() => setActiveTab(t.id)}>
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className={ui.summaryRow}>
                            <div className={ui.summaryCard}>
                                <span className={ui.summaryLabel}>{current}のコスト</span>
                                <span className={ui.summaryValue}>{fmtUsd(currentRow?.costUsd ?? 0)}</span>
                                <span className={ui.summaryHint}>{fmtJpy(currentRow?.costUsd ?? 0)}</span>
                            </div>
                            <div className={ui.summaryCard}>
                                <span className={ui.summaryLabel}>{current}の呼び出し数</span>
                                <span className={ui.summaryValue}>{(currentRow?.calls ?? 0).toLocaleString()}</span>
                                <span className={ui.summaryHint}>回</span>
                            </div>
                            <div className={ui.summaryCard}>
                                <span className={ui.summaryLabel}>平均コスト/{unit}</span>
                                <span className={ui.summaryValue}>{fmtUsd(periodAvgCost)}</span>
                                <span className={ui.summaryHint}>{fmtJpy(periodAvgCost)}</span>
                            </div>
                        </div>

                        <div className={styles.chartWrap}>
                            <ResponsiveContainer width="100%" height={200}>
                                <BarChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                                    <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'var(--border-subtle)' }} />
                                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `$${v.toFixed(4)}`} width={70} />
                                    <Tooltip content={<CostTooltip />} cursor={{ fill: 'var(--bg-hover)' }} />
                                    <Bar dataKey="costUsd" fill={CHART_COLORS.violet} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        <div className={ui.tableWrap}>
                            <table className={ui.dataTable}>
                                <thead>
                                    <tr><th>期間</th><th className={ui.num}>呼び出し数</th><th className={ui.num}>合計トークン</th><th className={ui.num}>コスト (USD)</th><th className={ui.num}>コスト (¥)</th></tr>
                                </thead>
                                <tbody>
                                    {periodRows.length === 0 ? (
                                        <tr><td colSpan={5} className={ui.empty}>データなし</td></tr>
                                    ) : periodRows.map((row) => (
                                        <tr key={row.key}>
                                            <td>{row.label}</td>
                                            <td className={ui.num}>{row.calls.toLocaleString()}</td>
                                            <td className={ui.num}>{fmtTokens(row.tokens)}</td>
                                            <CostCells usd={row.costUsd} />
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className={ui.controls}>
                            <button type="button" className={ui.btnGhost} onClick={() => exportPeriodCsv(periodRows, activeTab)} disabled={periodRows.length === 0}>この期間をCSVで書き出し</button>
                        </div>
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>機能別内訳</h2>
                        <div className={ui.tableWrap}>
                            <table className={ui.dataTable}>
                                <thead>
                                    <tr><th>機能名</th><th>ページ</th><th className={ui.num}>呼び出し数</th><th className={ui.num}>合計トークン</th><th className={ui.num}>コスト (USD)</th><th className={ui.num}>コスト (¥)</th></tr>
                                </thead>
                                <tbody>
                                    {summary.byFunction.length === 0 ? (
                                        <tr><td colSpan={6} className={ui.empty}>データなし</td></tr>
                                    ) : summary.byFunction.map((row) => {
                                        const d = detailOf(row.name)
                                        return (
                                            <tr key={row.name}>
                                                <td className={ui.strong}>{d.name}</td>
                                                <td>{d.page ? <code className={styles.pagePath}>{d.page}</code> : <span className={ui.note}>—</span>}</td>
                                                <td className={ui.num}>{row.calls.toLocaleString()}</td>
                                                <td className={ui.num}>{fmtTokens(row.tokens)}</td>
                                                <CostCells usd={row.costUsd} />
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>最近の呼び出し（直近20件）</h2>
                        <div className={ui.tableWrap}>
                            <table className={ui.dataTable}>
                                <thead>
                                    <tr><th>日時</th><th>機能名</th><th>ページ</th><th>モデル</th><th className={ui.num}>入力 / 思考 / 出力</th><th className={ui.num}>コスト</th></tr>
                                </thead>
                                <tbody>
                                    {recentLogs.length === 0 ? (
                                        <tr><td colSpan={6} className={ui.empty}>データなし</td></tr>
                                    ) : recentLogs.map((log, i) => {
                                        const d = detailOf(log.function)
                                        return (
                                            <tr key={i}>
                                                <td className={styles.nowrap}>{log.date} {log.time}</td>
                                                <td className={ui.strong}>{d.name}</td>
                                                <td>{d.page ? <code className={styles.pagePath}>{d.page}</code> : <span className={ui.note}>—</span>}</td>
                                                <td><span className={styles.modelBadge}>{log.model}</span></td>
                                                <td className={cx(ui.num, styles.tokenBreakdown)}>
                                                    <span className={styles.tokenInput}>{fmtTokens(log.promptTokens)}</span>
                                                    {' / '}
                                                    <span className={styles.tokenThinking}>{fmtTokens(log.thinkingTokens)}</span>
                                                    {' / '}
                                                    <span className={styles.tokenOutput}>{fmtTokens(log.completionTokens)}</span>
                                                </td>
                                                <td className={cx(ui.num, styles.costUsd)}>{fmtUsd(log.costUsd)}<br /><span className={styles.costJpy}>{fmtJpy(log.costUsd)}</span></td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <p className={ui.tableNote}>入力 / 思考 / 出力はトークン数。思考トークンは単価が高い（gemini-2.5-flash で入力の約 47 倍）ため、コストの大半を占めることがあります。</p>
                    </div>
                </>
            )}
        </PageShell>
    )
}
