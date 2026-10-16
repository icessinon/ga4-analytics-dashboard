'use client'

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART_COLORS } from '@/lib/constants/chartColors'
import type { SignupTimelineEvent } from '@/lib/constants/signupTimeline'
import styles from './TimelineTrendCharts.module.css'

/**
 * 「できごと（ABテスト・リリース）を縦線で重ねた推移」の共通チャート。
 * 会員登録（/signup-trend）と応募（/apply-trend）が同じ見た目になるように 1 つにまとめている。
 * 番号は渡された events の並び順で、画面の一覧と対応させる。
 */

const EVENT_COLOR = CHART_COLORS.orange

const mdLabel = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`

/** 縦線の上に出す丸番号 */
function eventLabel(no: number, level: number) {
    const EventBadge = (props: { viewBox?: { x?: number; y?: number } }) => {
        const x = props.viewBox?.x ?? 0
        const y = (props.viewBox?.y ?? 0) + 16 - level * 10
        return (
            <g>
                <circle cx={x} cy={y} r={8.5} fill={EVENT_COLOR} />
                <text x={x} y={y + 4} textAnchor="middle" fontSize={no > 9 ? 9.5 : 11} fontWeight={700} fill="#fff">
                    {no}
                </text>
            </g>
        )
    }
    EventBadge.displayName = `TrendEventBadge${no}`
    return EventBadge
}

/** 近い位置の番号が重ならないよう段を上げる（0〜2段） */
function stackLevels(positions: number[], minGap: number): number[] {
    const out: number[] = []
    for (let i = 0; i < positions.length; i++) {
        let level = 0
        for (let j = i - 1; j >= 0 && positions[i] - positions[j] < minGap; j--) {
            level = Math.max(level, out[j] + 1)
        }
        out.push(level % 3)
    }
    return out
}

function TooltipBox({ head, rows }: { head: string; rows: Array<[string, string]> }) {
    return (
        <div className={styles.tooltip}>
            <div className={styles.tooltipHead}>{head}</div>
            {rows.map(([k, v]) => (
                <div key={k} className={styles.tooltipRow}><span>{k}</span><b>{v}</b></div>
            ))}
        </div>
    )
}

export interface DailyPoint {
    date: string
    value: number
    /** ツールチップに出す行 */
    tooltip: Array<[string, string]>
}

export interface DailyCountChartProps {
    points: DailyPoint[]
    events: SignupTimelineEvent[]
    /** 移動平均の凡例・ツールチップにつける単位（「件/日」など） */
    unit: string
}

/** 日次の件数と7日移動平均。縦線はできごと */
export function DailyCountChart({ points, events, unit }: DailyCountChartProps) {
    const rows = points.map((p, i) => ({
        ...p,
        label: mdLabel(p.date),
        ma7: i >= 6 ? points.slice(i - 6, i + 1).reduce((a, x) => a + x.value, 0) / 7 : null,
    }))
    const index = new Map(rows.map((r, i) => [r.date, i]))
    const shown = events.map((e, i) => ({ e, no: i + 1, pos: index.get(e.date) })).filter((x) => x.pos != null)
    const levels = stackLevels(shown.map((x) => x.pos as number), 6)

    return (
        <div className={styles.chart}>
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows} margin={{ top: 28, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                    <XAxis
                        dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                        axisLine={false} tickLine={false} interval="preserveStartEnd"
                        ticks={rows.filter((r) => r.date.slice(8) === '01').map((r) => r.label)}
                    />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip
                        cursor={{ stroke: 'var(--border-strong)' }}
                        content={({ active, payload }) => {
                            if (!active || !payload?.length) return null
                            const r = payload[0].payload as (typeof rows)[number]
                            const rows2: Array<[string, string]> = [...r.tooltip]
                            if (r.ma7 != null) rows2.push(['7日移動平均', `${r.ma7.toFixed(1)}${unit}`])
                            return <TooltipBox head={r.date} rows={rows2} />
                        }}
                    />
                    {shown.map((x, i) => (
                        <ReferenceLine
                            key={x.e.date + x.no} x={mdLabel(x.e.date)} stroke={EVENT_COLOR}
                            strokeDasharray="4 4" strokeOpacity={0.75} label={eventLabel(x.no, levels[i])}
                        />
                    ))}
                    <Line type="monotone" dataKey="value" stroke={CHART_COLORS.blue} strokeWidth={1.2}
                        strokeOpacity={0.38} dot={false} isAnimationActive={false} name="日次" />
                    <Line type="monotone" dataKey="ma7" stroke={CHART_COLORS.blue} strokeWidth={2.6}
                        dot={false} connectNulls isAnimationActive={false} name="7日移動平均" />
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}

export interface RateSeries {
    key: string
    name: string
    color: string
}

export interface RatePoint {
    label: string
    start: string
    end: string
    /** 系列キー → パーセント（0〜100）。欠測は null */
    values: Record<string, number | null>
    tooltip: Array<[string, string]>
    partial: boolean
}

export interface RateTrendChartProps {
    points: RatePoint[]
    events: SignupTimelineEvent[]
    series: RateSeries[]
}

/** 率の推移（複数系列可）。縦線はできごと（その日を含むバケットの位置） */
export function RateTrendChart({ points, events, series }: RateTrendChartProps) {
    const rows = points.map((p) => ({ ...p, ...p.values }))
    const shown = events
        .map((e, i) => ({ e, no: i + 1, pos: points.findIndex((b) => e.date >= b.start && e.date <= b.end) }))
        .filter((x) => x.pos >= 0)
    const levels = stackLevels(shown.map((x) => x.pos), 1)

    return (
        <div className={styles.chart}>
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows} margin={{ top: 28, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                        axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis domain={[0, 'auto']} tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                        axisLine={false} tickLine={false} width={46} unit="%" />
                    <Tooltip
                        cursor={{ stroke: 'var(--border-strong)' }}
                        content={({ active, payload }) => {
                            if (!active || !payload?.length) return null
                            const r = payload[0].payload as (typeof rows)[number]
                            return <TooltipBox head={`${r.start} 〜 ${r.end}${r.partial ? '（期間の端）' : ''}`} rows={r.tooltip} />
                        }}
                    />
                    {shown.map((x, i) => (
                        <ReferenceLine
                            key={x.e.date + x.no} x={points[x.pos].label} stroke={EVENT_COLOR}
                            strokeDasharray="4 4" strokeOpacity={0.75} label={eventLabel(x.no, levels[i])}
                        />
                    ))}
                    {series.map((s) => (
                        <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2.4}
                            dot={{ r: 3, fill: s.color }} connectNulls isAnimationActive={false} name={s.name} />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}
