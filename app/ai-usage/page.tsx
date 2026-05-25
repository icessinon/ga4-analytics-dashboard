'use client'

import { useEffect, useState, useMemo } from 'react'
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
} from 'recharts'
import BackLink from '@/components/BackLink'
import styles from './AiUsagePage.module.css'

// ── Types ──────────────────────────────────────────────
interface ParsedLog {
    date: string
    time: string
    function: string
    model: string
    promptTokens: number
    completionTokens: number
    thinkingTokens: number
    totalTokens: number
    costUsd: number
}

interface ByFunctionSummary {
    name: string
    calls: number
    tokens: number
    costUsd: number
}

interface ByDaySummary {
    date: string
    calls: number
    tokens: number
    costUsd: number
}

interface Summary {
    totalCostUsd: number
    totalTokens: number
    callCount: number
    byFunction: ByFunctionSummary[]
    byDay: ByDaySummary[]
}

interface ApiResponse {
    logs: ParsedLog[]
    summary: Summary
}

interface PeriodRow {
    key: string
    label: string
    calls: number
    tokens: number
    costUsd: number
}

type TabKey = 'daily' | 'weekly' | 'monthly'

// ── Function details map ───────────────────────────────
const FUNCTION_DETAILS: Record<string, { name: string; page: string }> = {
    generateWeeklyInsightWithGemini: { name: '月次インサイト生成',     page: '/insights' },
    analyzeStickinessWithGemini:     { name: 'スティッキネス分析',     page: '/user/stickiness' },
    analyzeDropoutPathsWithGemini:   { name: '離脱経路分析',           page: '/journey' },
    analyzeScoringWithGemini:        { name: '活動スコアリング診断',   page: '/user/scoring' },
    evaluateFunnelWithGemini:        { name: 'ファネル評価',           page: '/funnel' },
    evaluateComparisonWithGemini:    { name: 'ファネル期間比較評価',   page: '/funnel' },
    analyzeTrendWithGemini:          { name: 'トレンド傾向分析',       page: '/trend' },
    analyzeEngagementWithGemini:     { name: 'エンゲージメント分析',   page: '/funnel/engagement' },
    evaluateWithGemini:              { name: 'ABテスト評価',           page: '/ab-test' },
}

function getFunctionDetail(raw: string): { name: string; page: string | null } {
    if (FUNCTION_DETAILS[raw]) return FUNCTION_DETAILS[raw]
    return { name: raw, page: null }
}

// ── Formatting helpers ─────────────────────────────────
const JPY_RATE = 150

function fmtUsd(n: number): string {
    return `$${n.toFixed(6)}`
}

function fmtJpy(usd: number): string {
    return `¥${Math.round(usd * JPY_RATE).toLocaleString()}`
}

function fmtTokens(n: number): string {
    return n.toLocaleString()
}

function getTodayStr(): string {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}/${m}/${d}`
}

function getDateStampStr(): string {
    const now = new Date()
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
}

// ── Aggregation helpers ────────────────────────────────
function getWeekKey(dateStr: string): string {
    const [y, m, d] = dateStr.split('/').map(Number)
    const date = new Date(y, m - 1, d)
    const day = date.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const monday = new Date(date)
    monday.setDate(date.getDate() + diff)
    return `${monday.getFullYear()}/${String(monday.getMonth() + 1).padStart(2, '0')}/${String(monday.getDate()).padStart(2, '0')}`
}

function getMonthKey(dateStr: string): string {
    return dateStr.slice(0, 7)
}

function buildPeriodRows(logs: ParsedLog[], tab: TabKey): PeriodRow[] {
    const map = new Map<string, PeriodRow>()

    for (const log of logs) {
        let key: string
        let label: string

        if (tab === 'daily') {
            key = log.date
            label = log.date
        } else if (tab === 'weekly') {
            key = getWeekKey(log.date)
            label = `${key}〜`
        } else {
            key = getMonthKey(log.date)
            label = key
        }

        const existing = map.get(key)
        if (existing) {
            existing.calls += 1
            existing.tokens += log.totalTokens
            existing.costUsd += log.costUsd
        } else {
            map.set(key, { key, label, calls: 1, tokens: log.totalTokens, costUsd: log.costUsd })
        }
    }

    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key))
}

// ── CSV export ─────────────────────────────────────────
function downloadCsv(filename: string, content: string) {
    const bom = '﻿'
    const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
}

function exportPeriodCsv(rows: PeriodRow[], tab: TabKey) {
    const header = '期間,呼び出し数,合計トークン,コスト(USD),コスト(JPY)'
    const lines = rows.map((r) =>
        [r.label, r.calls, r.tokens, fmtUsd(r.costUsd), fmtJpy(r.costUsd)].join(',')
    )
    downloadCsv(`ai-usage-${tab}-${getDateStampStr()}.csv`, [header, ...lines].join('\n'))
}

function exportFullCsv(logs: ParsedLog[]) {
    const header = '日時,機能名,ページ,モデル,入力トークン,思考トークン,出力トークン,合計トークン,コスト(USD),コスト(JPY)'
    const lines = logs.map((l) => {
        const detail = getFunctionDetail(l.function)
        return [
            `${l.date} ${l.time}`,
            detail.name,
            detail.page ?? '',
            l.model,
            l.promptTokens,
            l.thinkingTokens,
            l.completionTokens,
            l.totalTokens,
            fmtUsd(l.costUsd),
            fmtJpy(l.costUsd),
        ].join(',')
    })
    downloadCsv(`ai-usage-full-${getDateStampStr()}.csv`, [header, ...lines].join('\n'))
}

// ── Custom Tooltip ─────────────────────────────────────
interface TooltipPayload {
    name: string
    value: number
    payload: PeriodRow
}

interface CustomTooltipProps {
    active?: boolean
    payload?: TooltipPayload[]
    label?: string
}

function CustomBarTooltip({ active, payload }: CustomTooltipProps) {
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

// ── Page ───────────────────────────────────────────────
export default function AiUsagePage() {
    const [data, setData] = useState<ApiResponse | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<TabKey>('daily')

    useEffect(() => {
        fetch('/api/ai-usage')
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                return res.json() as Promise<ApiResponse>
            })
            .then(setData)
            .catch((e: Error) => setError(e.message))
    }, [])

    const periodRows = useMemo(() => {
        if (!data) return []
        return buildPeriodRows(data.logs, activeTab)
    }, [data, activeTab])

    if (error) {
        return (
            <div className={styles.container}>
                <div className={styles.error}>データの取得に失敗しました: {error}</div>
            </div>
        )
    }

    if (!data) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>読み込み中...</div>
            </div>
        )
    }

    const { logs, summary } = data

    // Today's cost
    const todayStr = getTodayStr()
    const todayCost = logs
        .filter((l) => l.date === todayStr)
        .reduce((acc, l) => acc + l.costUsd, 0)

    const recentLogs = logs.slice(0, 20)

    // Period summary stats — find the row matching the CURRENT period (today/this week/this month)
    const todayKey = getTodayStr()
    const currentPeriodKey =
        activeTab === 'daily' ? todayKey :
        activeTab === 'weekly' ? getWeekKey(todayKey) :
        getMonthKey(todayKey)
    const currentRow = periodRows.find((r) => r.key === currentPeriodKey) ?? null
    const allPeriodCost = periodRows.reduce((s, r) => s + r.costUsd, 0)
    const periodAvgCost = periodRows.length > 0 ? allPeriodCost / periodRows.length : 0

    const latestLabel = activeTab === 'daily' ? '今日のコスト' : activeTab === 'weekly' ? '今週のコスト' : '今月のコスト'
    const latestCallsLabel = activeTab === 'daily' ? '今日の呼び出し数' : activeTab === 'weekly' ? '今週の呼び出し数' : '今月の呼び出し数'
    const avgLabel = activeTab === 'daily' ? '平均コスト/日' : activeTab === 'weekly' ? '平均コスト/週' : '平均コスト/月'

    // Chart data — show at most 30 points, newest last
    const chartData = periodRows.slice(0, 30).reverse()

    // Detect dominant model for subtitle
    const dominantModel = summary.byFunction.length > 0
        ? logs.find((l) => l.model)?.model ?? 'gemini-2.5-flash'
        : 'gemini-2.5-flash'

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.titleBlock}>
                    <h1 className={styles.title}>AI利用状況</h1>
                    <p className={styles.subtitle}>AI使用量とコストの概算（モデル: {dominantModel}）</p>
                </div>
                <div className={styles.headerActions}>
                    <button
                        className={styles.exportBtn}
                        onClick={() => exportFullCsv(logs)}
                    >
                        CSVで書き出し ↓
                    </button>
                    <BackLink href="/dashboard">ダッシュボードに戻る</BackLink>
                </div>
            </div>

            {/* All-time Summary Cards */}
            <div className={styles.cardGrid}>
                <div className={`${styles.card} ${styles.accentCard}`}>
                    <div className={styles.cardLabel}>累計コスト (USD)</div>
                    <div className={styles.cardValue}>{fmtUsd(summary.totalCostUsd)}</div>
                    <div className={styles.cardSub}>{fmtJpy(summary.totalCostUsd)}</div>
                </div>
                <div className={styles.card}>
                    <div className={styles.cardLabel}>本日のコスト</div>
                    <div className={styles.cardValue}>{fmtUsd(todayCost)}</div>
                    <div className={styles.cardSub}>{fmtJpy(todayCost)}</div>
                </div>
                <div className={styles.card}>
                    <div className={styles.cardLabel}>累計呼び出し数</div>
                    <div className={styles.cardValue}>{summary.callCount.toLocaleString()}</div>
                    <div className={styles.cardSub}>回</div>
                </div>
                <div className={styles.card}>
                    <div className={styles.cardLabel}>累計トークン数</div>
                    <div className={styles.cardValue}>{fmtTokens(summary.totalTokens)}</div>
                    <div className={styles.cardSub}>tokens</div>
                </div>
            </div>

            {/* Period Tab Section */}
            <div className={styles.section}>
                {/* Tab bar */}
                <div className={styles.tabBar}>
                    {(['daily', 'weekly', 'monthly'] as TabKey[]).map((tab) => (
                        <button
                            key={tab}
                            className={`${styles.tab}${activeTab === tab ? ` ${styles.tabActive}` : ''}`}
                            onClick={() => setActiveTab(tab)}
                        >
                            {tab === 'daily' ? '日次' : tab === 'weekly' ? '週次' : '月次'}
                        </button>
                    ))}
                </div>

                {/* Period summary cards */}
                <div className={styles.periodCardGrid}>
                    <div className={styles.card}>
                        <div className={styles.cardLabel}>{latestLabel}</div>
                        <div className={styles.cardValue}>{fmtUsd(currentRow?.costUsd ?? 0)}</div>
                        <div className={styles.cardSub}>{fmtJpy(currentRow?.costUsd ?? 0)}</div>
                    </div>
                    <div className={styles.card}>
                        <div className={styles.cardLabel}>{latestCallsLabel}</div>
                        <div className={styles.cardValue}>{(currentRow?.calls ?? 0).toLocaleString()}</div>
                        <div className={styles.cardSub}>回</div>
                    </div>
                    <div className={styles.card}>
                        <div className={styles.cardLabel}>{avgLabel}</div>
                        <div className={styles.cardValue}>{fmtUsd(periodAvgCost)}</div>
                        <div className={styles.cardSub}>{fmtJpy(periodAvgCost)}</div>
                    </div>
                </div>

                {/* Bar chart */}
                <div className={styles.chartWrapper}>
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis
                                dataKey="label"
                                tick={{ fill: '#9ca3af', fontSize: 11 }}
                                tickLine={false}
                                axisLine={{ stroke: '#374151' }}
                            />
                            <YAxis
                                tick={{ fill: '#9ca3af', fontSize: 11 }}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(v: number) => `$${v.toFixed(4)}`}
                                width={70}
                            />
                            <Tooltip content={<CustomBarTooltip />} cursor={{ fill: 'rgba(99,102,241,0.08)' }} />
                            <Bar dataKey="costUsd" fill="#6366f1" radius={[3, 3, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Period table */}
                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>期間</th>
                                <th>呼び出し数</th>
                                <th>合計トークン</th>
                                <th>コスト (USD)</th>
                                <th>コスト (¥)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {periodRows.length === 0 ? (
                                <tr>
                                    <td colSpan={5} style={{ textAlign: 'center', color: '#6b7280' }}>データなし</td>
                                </tr>
                            ) : (
                                periodRows.map((row) => (
                                    <tr key={row.key}>
                                        <td>{row.label}</td>
                                        <td>{row.calls.toLocaleString()}</td>
                                        <td>{fmtTokens(row.tokens)}</td>
                                        <td className={styles.costCell}>
                                            <span className={styles.costUsd}>{fmtUsd(row.costUsd)}</span>
                                        </td>
                                        <td className={styles.costCell}>
                                            <span className={styles.costJpy}>{fmtJpy(row.costUsd)}</span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <div className={styles.tableActions}>
                    <button
                        className={styles.exportBtn}
                        onClick={() => exportPeriodCsv(periodRows, activeTab)}
                    >
                        この期間をCSVで書き出し ↓
                    </button>
                </div>
            </div>

            {/* Function breakdown */}
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>機能別内訳</h2>
                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>機能名</th>
                                <th>ページ</th>
                                <th>呼び出し数</th>
                                <th>合計トークン</th>
                                <th>コスト (USD)</th>
                                <th>コスト (¥)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {summary.byFunction.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', color: '#6b7280' }}>データなし</td>
                                </tr>
                            ) : (
                                summary.byFunction.map((row) => {
                                    const detail = getFunctionDetail(row.name)
                                    return (
                                        <tr key={row.name}>
                                            <td className={styles.funcName}>{detail.name}</td>
                                            <td>
                                                {detail.page ? (
                                                    <span className={styles.pagePath}>{detail.page}</span>
                                                ) : (
                                                    <span style={{ color: '#6b7280' }}>—</span>
                                                )}
                                            </td>
                                            <td>{row.calls.toLocaleString()}</td>
                                            <td>{fmtTokens(row.tokens)}</td>
                                            <td className={styles.costCell}>
                                                <span className={styles.costUsd}>{fmtUsd(row.costUsd)}</span>
                                            </td>
                                            <td className={styles.costCell}>
                                                <span className={styles.costJpy}>{fmtJpy(row.costUsd)}</span>
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Recent Calls Table */}
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>最近の呼び出し（直近20件）</h2>
                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>日時</th>
                                <th>機能名</th>
                                <th>ページ</th>
                                <th>モデル</th>
                                <th>入力 / 思考 / 出力</th>
                                <th>コスト</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recentLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', color: '#6b7280' }}>データなし</td>
                                </tr>
                            ) : (
                                recentLogs.map((log, i) => {
                                    const detail = getFunctionDetail(log.function)
                                    return (
                                        <tr key={i}>
                                            <td style={{ whiteSpace: 'nowrap' }}>{log.date} {log.time}</td>
                                            <td className={styles.funcName}>{detail.name}</td>
                                            <td>
                                                {detail.page ? (
                                                    <span className={styles.pagePath}>{detail.page}</span>
                                                ) : (
                                                    <span style={{ color: '#6b7280' }}>—</span>
                                                )}
                                            </td>
                                            <td>
                                                <span className={styles.modelBadge}>{log.model}</span>
                                            </td>
                                            <td>
                                                <span className={styles.tokenBreakdown}>
                                                    <span className={styles.tokenInput}>{fmtTokens(log.promptTokens)}</span>
                                                    {' / '}
                                                    <span className={styles.tokenThinking}>{fmtTokens(log.thinkingTokens)}</span>
                                                    {' / '}
                                                    <span className={styles.tokenOutput}>{fmtTokens(log.completionTokens)}</span>
                                                </span>
                                            </td>
                                            <td className={styles.costCell}>
                                                <span className={styles.costUsd}>{fmtUsd(log.costUsd)}</span>
                                                <span className={styles.costJpy}>{fmtJpy(log.costUsd)}</span>
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Note */}
            <p className={styles.note}>
                料金は概算です。実際の請求額はGoogle Cloud Consoleで確認してください。
            </p>
        </div>
    )
}
