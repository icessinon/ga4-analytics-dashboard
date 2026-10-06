'use client'

import { useEffect, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from 'recharts'
import DateInput from '@/components/DateInput'
import AISpinner from '@/components/AISpinner'
import InfoTooltip from '@/components/InfoTooltip'
import PageShell from '@/components/PageShell'
import PeriodSelect from '@/components/PeriodSelect'
import Alert from '@/components/Alert'
import { ui, cx } from '@/components/ui'
import { usePeriodRange } from '@/hooks/usePeriodRange'
import { useReport } from '@/hooks/useReport'
import { fetchJson } from '@/lib/utils/fetch'
import { CHART_COLORS } from '@/lib/constants/chartColors'
import { useProduct } from '@/contexts/ProductContext'
import type { StickinessResponse } from '@/lib/services/user/stickinessTypes'
import styles from './StickinessPage.module.css'

/** 期間A（当期）と期間B（比較）の色。グラフ・バッジで共通 */
const PERIOD_A = CHART_COLORS.violet
const PERIOD_B = CHART_COLORS.orange

/** 期間Aと同じ日数で、直前に接する期間を比較の既定にする */
function previousPeriod(startDate: string, endDate: string) {
    const start = new Date(startDate)
    const end = new Date(endDate)
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1
    const cEnd = new Date(start)
    cEnd.setDate(cEnd.getDate() - 1)
    const cStart = new Date(cEnd)
    cStart.setDate(cStart.getDate() - (days - 1))
    const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { start: fmt(cStart), end: fmt(cEnd) }
}

function toMMDD(dateStr: string): string {
    const parts = dateStr.split('-')
    if (parts.length === 3) return `${parts[1]}/${parts[2]}`
    return dateStr
}

function engagementLabel(ratio: number): { text: string; color: string } {
    const pct = ratio * 100
    if (pct >= 20) return { text: '高エンゲージメント', color: 'var(--status-good)' }
    if (pct >= 10) return { text: '中程度のエンゲージメント', color: 'var(--status-warn)' }
    return { text: '低エンゲージメント', color: 'var(--status-bad)' }
}

function delta(current: number, compare: number, fmt: (n: number) => string = String) {
    if (compare === 0) return null
    const diff = current - compare
    const pct = ((diff / compare) * 100).toFixed(1)
    const up = diff >= 0
    return { text: `${up ? '+' : ''}${pct}%`, up, diff, fmt: fmt(Math.abs(diff)) }
}

function fmtPct(n: number) { return `${(n * 100).toFixed(1)}%` }

const AXIS_TICK = { fill: 'var(--text-muted)', fontSize: 11 }
const TOOLTIP_STYLE = { backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '0.375rem', color: 'var(--text-primary)' }

export default function StickinessPage() {
    const { currentProduct } = useProduct()
    const periodState = usePeriodRange('30daysAgo')
    const range = periodState.range

    const [compareMode, setCompareMode] = useState(false)
    const [compareStart, setCompareStart] = useState('')
    const [compareEnd, setCompareEnd] = useState('')
    const compareOk = !compareMode || (!!compareStart && !!compareEnd && compareStart <= compareEnd)

    // 期間を変えると即再取得（旧実装は「分析を実行」ボタン）。比較期間が未確定の間は待つ
    const report = useReport<StickinessResponse>('/api/user/stickiness', {
        body: {
            propertyId: currentProduct?.ga4PropertyId,
            startDate: range?.startDate,
            endDate: range?.endDate,
            ...(compareMode ? { compareStartDate: compareStart, compareEndDate: compareEnd } : {}),
        },
        enabled: !!currentProduct && !!range && compareOk,
    })
    const current = report.data?.current ?? null
    const compare = report.data?.compare ?? null

    const [geminiLoading, setGeminiLoading] = useState(false)
    const [geminiResult, setGeminiResult] = useState<string | null>(null)
    const [geminiError, setGeminiError] = useState<string | null>(null)
    // 数字が変われば前の AI 分析は古くなる
    useEffect(() => { setGeminiResult(null); setGeminiError(null) }, [report.data])

    function toggleCompare() {
        if (!compareMode && range) {
            const prev = previousPeriod(range.startDate, range.endDate)
            setCompareStart(prev.start)
            setCompareEnd(prev.end)
        }
        setCompareMode((v) => !v)
    }

    const handleGeminiAnalysis = async () => {
        if (!current || !range) return
        setGeminiLoading(true)
        setGeminiError(null)
        setGeminiResult(null)
        try {
            const pick = (r: typeof current, startDate: string, endDate: string) => ({
                avgDAU: r.avgDAU, totalMAU: r.totalMAU, stickinessDAUMAU: r.stickinessDAUMAU,
                stickinessWAUMAU: r.stickinessWAUMAU, avgSessionsPerUser: r.avgSessionsPerUser, startDate, endDate,
            })
            const data = await fetchJson<{ analysis: string }>('/api/user/stickiness/gemini', {
                method: 'POST',
                body: JSON.stringify({
                    current: pick(current, range.startDate, range.endDate),
                    compare: compare ? pick(compare, compareStart, compareEnd) : null,
                }),
            })
            setGeminiResult(data.analysis)
        } catch (e) {
            setGeminiError(e instanceof Error ? e.message : 'エラーが発生しました')
        } finally {
            setGeminiLoading(false)
        }
    }

    const engagement = current ? engagementLabel(current.stickinessDAUMAU) : null
    const chartData = current?.dailySeries.map((d) => ({ ...d, date: toMMDD(d.date) })) ?? []
    // 比較グラフ用データ（日付インデックスで正規化）
    const compareChartData = (() => {
        if (!current || !compare) return []
        const len = Math.max(current.dailySeries.length, compare.dailySeries.length)
        return Array.from({ length: len }, (_, i) => ({
            day: `${i + 1}日目`,
            dau_a: current.dailySeries[i]?.dau ?? null,
            dau_b: compare.dailySeries[i]?.dau ?? null,
            mau_a: current.dailySeries[i]?.mau ?? null,
            mau_b: compare.dailySeries[i]?.mau ?? null,
        }))
    })()

    return (
        <PageShell
            pageId="userStickiness"
            requireProduct
            status={{ loading: report.loading, error: report.error, source: 'ga4', onRetry: report.run }}
            controls={
                <div className={ui.card}>
                    <div className={styles.periodRow}>
                        {compareMode && <span className={styles.periodLabel} style={{ color: PERIOD_A, borderColor: PERIOD_A }}>期間A</span>}
                        <PeriodSelect state={periodState} />
                    </div>
                    {compareMode && (
                        <div className={styles.periodRow}>
                            <span className={styles.periodLabel} style={{ color: PERIOD_B, borderColor: PERIOD_B }}>期間B</span>
                            <DateInput className={styles.compareDate} value={compareStart} max={compareEnd || undefined} onChange={(e) => setCompareStart(e.target.value)} required />
                            <span className={ui.note}>〜</span>
                            <DateInput className={styles.compareDate} value={compareEnd} min={compareStart || undefined} onChange={(e) => setCompareEnd(e.target.value)} required />
                            {!compareOk && <span className={ui.note}>開始日 ≦ 終了日 になるように指定してください</span>}
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={toggleCompare}
                        className={compareMode ? cx(styles.compareToggle, styles.compareToggleActive) : styles.compareToggle}
                    >
                        {compareMode ? '期間比較をオフ' : '期間比較'}
                    </button>
                </div>
            }
        >
            {current && (
                <>
                    {!compare ? (
                        <div className={ui.summaryRow}>
                            <div className={ui.summaryCard}>
                                <p className={ui.summaryLabel}>平均DAU<InfoTooltip text="Daily Active Users（日次アクティブユーザー）の期間平均。毎日何人が利用しているかを示す。" direction="bottom" /></p>
                                <p className={ui.summaryValue}>{current.avgDAU.toLocaleString()}</p>
                            </div>
                            <div className={ui.summaryCard}>
                                <p className={ui.summaryLabel}>MAU（期間ユニーク）<InfoTooltip text="Monthly Active Users。対象期間内にサイトを訪れたユニークユーザーの総数。" direction="bottom" /></p>
                                <p className={ui.summaryValue}>{current.totalMAU.toLocaleString()}</p>
                            </div>
                            <div className={ui.summaryCard}>
                                <p className={ui.summaryLabel}>DAU/MAU スティッキネス<InfoTooltip text="平均DAU ÷ MAU。ユーザーが月の何割の日数でサービスを使うかを示す。20%以上が高エンゲージメントの目安。" direction="bottom" /></p>
                                <p className={cx(ui.summaryValue, styles.highlight)}>{fmtPct(current.stickinessDAUMAU)}</p>
                            </div>
                            <div className={ui.summaryCard}>
                                <p className={ui.summaryLabel}>平均セッション/ユーザー<InfoTooltip text="1ユーザーあたりの平均セッション数（sessions ÷ activeUsers）。訪問頻度の高さを示す。" direction="bottom" /></p>
                                <p className={ui.summaryValue}>{current.avgSessionsPerUser}</p>
                            </div>
                        </div>
                    ) : (
                        <div className={styles.compareSummaryGrid}>
                            {[
                                { label: '平均DAU', tooltip: 'Daily Active Users（日次アクティブユーザー）の期間平均。', a: current.avgDAU, b: compare.avgDAU, fmt: (n: number) => n.toLocaleString(), isHighlight: false },
                                { label: 'MAU（期間ユニーク）', tooltip: '対象期間内のユニークユーザー総数（Monthly Active Users）。', a: current.totalMAU, b: compare.totalMAU, fmt: (n: number) => n.toLocaleString(), isHighlight: false },
                                { label: 'DAU/MAU スティッキネス', tooltip: '平均DAU ÷ MAU。月の何割の日数でサービスを使うかを示す。20%以上が高エンゲージメントの目安。', a: current.stickinessDAUMAU, b: compare.stickinessDAUMAU, fmt: fmtPct, isHighlight: true },
                                { label: '平均セッション/ユーザー', tooltip: '1ユーザーあたりの平均セッション数（sessions ÷ activeUsers）。', a: current.avgSessionsPerUser, b: compare.avgSessionsPerUser, fmt: String, isHighlight: false },
                            ].map(({ label, tooltip, a, b, fmt, isHighlight }) => {
                                const d = delta(a, b, fmt)
                                return (
                                    <div key={label} className={ui.cardTight}>
                                        <p className={ui.summaryLabel}>{label}{tooltip && <InfoTooltip text={tooltip} direction="bottom" />}</p>
                                        <div className={styles.compareCardRow}>
                                            <div>
                                                <span className={styles.comparePeriodBadge} style={{ color: PERIOD_A, borderColor: PERIOD_A }}>期間A</span>
                                                <p className={cx(styles.compareValue, isHighlight && styles.highlight)}>{fmt(a)}</p>
                                            </div>
                                            <div>
                                                <span className={styles.comparePeriodBadge} style={{ color: PERIOD_B, borderColor: PERIOD_B }}>期間B</span>
                                                <p className={cx(styles.compareValue, styles.compareValueB)}>{fmt(b)}</p>
                                            </div>
                                            {d && (
                                                <div className={styles.deltaCol}>
                                                    <span className={d.up ? styles.deltaUp : styles.deltaDown}>{d.text}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>{compare ? 'DAU 期間比較（相対日数）' : 'DAU / WAU / MAU 推移'}</h2>
                        <div className={styles.chartWrap}>
                            <ResponsiveContainer width="100%" height="100%">
                                {!compare ? (
                                    <LineChart data={chartData} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
                                        <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} interval="preserveStartEnd" />
                                        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v: number) => v.toLocaleString()} />
                                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: number, name: string) => [value.toLocaleString(), name.toUpperCase()]} />
                                        <Legend formatter={(value: string) => value.toUpperCase()} wrapperStyle={{ color: 'var(--text-muted)', fontSize: 12 }} />
                                        <Line type="monotone" dataKey="dau" stroke={CHART_COLORS.blue} strokeWidth={2} dot={false} name="dau" />
                                        <Line type="monotone" dataKey="wau" stroke={CHART_COLORS.green} strokeWidth={2} dot={false} name="wau" />
                                        <Line type="monotone" dataKey="mau" stroke={CHART_COLORS.orange} strokeWidth={2} dot={false} name="mau" />
                                    </LineChart>
                                ) : (
                                    <LineChart data={compareChartData} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
                                        <XAxis dataKey="day" tick={AXIS_TICK} tickLine={false} interval="preserveStartEnd" />
                                        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v: number) => v.toLocaleString()} />
                                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: number, name: string) => [value?.toLocaleString() ?? '-', name]} />
                                        <Legend wrapperStyle={{ color: 'var(--text-muted)', fontSize: 12 }} />
                                        <Line connectNulls type="monotone" dataKey="dau_a" stroke={PERIOD_A} strokeWidth={2} dot={false} name={`DAU（期間A: ${range?.startDate}〜${range?.endDate}）`} />
                                        <Line connectNulls type="monotone" dataKey="dau_b" stroke={PERIOD_B} strokeWidth={2} strokeDasharray="5 4" dot={false} name={`DAU（期間B: ${compareStart}〜${compareEnd}）`} />
                                    </LineChart>
                                )}
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {compare && (
                        <div className={ui.card}>
                            <h2 className={ui.sectionTitle}>MAU 推移比較（相対日数）</h2>
                            <div className={styles.chartWrap}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={compareChartData} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
                                        <XAxis dataKey="day" tick={AXIS_TICK} tickLine={false} interval="preserveStartEnd" />
                                        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v: number) => v.toLocaleString()} />
                                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: number, name: string) => [value?.toLocaleString() ?? '-', name]} />
                                        <Legend wrapperStyle={{ color: 'var(--text-muted)', fontSize: 12 }} />
                                        <Line connectNulls type="monotone" dataKey="mau_a" stroke={PERIOD_A} strokeWidth={2} dot={false} name="MAU（期間A）" />
                                        <Line connectNulls type="monotone" dataKey="mau_b" stroke={PERIOD_B} strokeWidth={2} strokeDasharray="5 4" dot={false} name="MAU（期間B）" />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    <div className={cx(ui.card, styles.infoBox)}>
                        <h3>スティッキネス（DAU/MAU）とは</h3>
                        {engagement && !compare && (
                            <p className={styles.engagement} style={{ color: engagement.color }}>
                                現在の評価: {engagement.text}（{fmtPct(current.stickinessDAUMAU)}）
                            </p>
                        )}
                        <ul>
                            <li><strong>20%以上</strong> — 高エンゲージメント: 月間ユーザーの5人に1人が毎日訪問しており、プロダクトへの依存度が高い</li>
                            <li><strong>10〜20%</strong> — 中程度のエンゲージメント: 一定の定期利用があるが、さらなる習慣化の余地がある</li>
                            <li><strong>10%以下</strong> — 低エンゲージメント: 月間ユーザーの多くが散発的な訪問に留まっており、リテンション施策の強化が必要</li>
                        </ul>
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>AI分析</h2>
                        <div className={ui.controls}>
                            <button type="button" onClick={handleGeminiAnalysis} disabled={geminiLoading} className={ui.btnPrimary}>
                                {geminiLoading ? <span className={ui.inlineLoading}><AISpinner /> 分析中...</span> : 'AIで分析'}
                            </button>
                        </div>
                        {geminiError && <Alert tone="error">{geminiError}</Alert>}
                        {geminiResult && (
                            <div className={ui.aiResult}>
                                {geminiResult.split('\n').map((line, i) => {
                                    const bold = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                    return line.trim() ? <p key={i} dangerouslySetInnerHTML={{ __html: bold }} /> : null
                                })}
                            </div>
                        )}
                    </div>
                </>
            )}
        </PageShell>
    )
}
