'use client'

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ui } from '@/components/ui'
import {
    BUSINESS_KPI_METRICS, formatKpi, isPartial, metricValue, paceOf,
    type BusinessKpiMetric,
} from '@/lib/constants/businessKpi'
import type { BusinessKpiMonth } from '@/lib/services/kpi/businessKpiTypes'
import styles from './BusinessKpiTrendChart.module.css'

/**
 * 事業KPI の月次推移。
 *
 * 途中の月は「実績」と「このペースで進んだ場合の残り」を積み上げて出す。
 * 実績だけを他の月と並べると必ず最後の月が落ち込んで見え、毎月初に
 * 「急減した」と誤読されるため。見込み部分は薄い色にして実績と区別する。
 */

export interface BusinessKpiTrendChartProps {
    months: BusinessKpiMonth[]
    metric: BusinessKpiMetric
    /** 強調する月（ダッシュボードで選んでいる月）。省略時は最新月 */
    highlightMonth?: string
}

interface Row {
    month: string
    label: string
    actual: number | null
    /** 着地見込みのうち、まだ実績になっていない分 */
    remaining: number
    partial: boolean
    highlight: boolean
}

export default function BusinessKpiTrendChart({ months, metric, highlightMonth }: BusinessKpiTrendChartProps) {
    const def = BUSINESS_KPI_METRICS[metric]
    const rows: Row[] = months.map((m) => {
        const actual = metricValue(m, metric)
        const pace = paceOf(actual, m)
        return {
            month: m.month,
            label: `${Number(m.month.slice(5))}月`,
            actual,
            remaining: isPartial(m) && pace != null && actual != null ? Math.max(0, pace - actual) : 0,
            partial: isPartial(m),
            highlight: highlightMonth ? m.month === highlightMonth : false,
        }
    })
    const anyPartial = rows.some((r) => r.partial)

    return (
        <div className={styles.wrap}>
            <div className={styles.head}>
                <h3 className={styles.title}>{def.label}の推移</h3>
                {anyPartial && <span className={styles.note}>薄い部分＝途中の月の月末見込み（今のペースで進んだ場合）</span>}
            </div>
            <div className={styles.chart}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rows} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={48} />
                        <Tooltip
                            cursor={{ fill: 'rgba(127,127,127,0.08)' }}
                            content={({ active, payload }) => {
                                if (!active || !payload?.length) return null
                                const r = payload[0].payload as Row
                                return (
                                    <div className={styles.tooltip}>
                                        <div className={styles.tooltipMonth}>{r.month}</div>
                                        <div className={styles.tooltipRow}><span>実績</span><b>{formatKpi(r.actual, def)}</b></div>
                                        {r.partial && (
                                            <div className={styles.tooltipRow}>
                                                <span>月末見込み</span><b>{formatKpi((r.actual ?? 0) + r.remaining, def)}</b>
                                            </div>
                                        )}
                                    </div>
                                )
                            }}
                        />
                        <Bar dataKey="actual" stackId="a" radius={[0, 0, 3, 3]} isAnimationActive={false}>
                            {rows.map((r) => (
                                <Cell key={r.month} fill={def.color} fillOpacity={r.highlight || !highlightMonth ? 1 : 0.45} />
                            ))}
                        </Bar>
                        {/* 見込み部分。塗りを薄くしただけだと暗い面では「別の棒」に見えるので、破線の輪郭を足す */}
                        <Bar
                            dataKey="remaining" stackId="a" radius={[3, 3, 0, 0]}
                            fill={def.color} fillOpacity={0.22}
                            stroke={def.color} strokeOpacity={0.7} strokeDasharray="3 2"
                            isAnimationActive={false}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
            {def.hint && <p className={ui.tableNote}>{def.hint}</p>}
        </div>
    )
}
