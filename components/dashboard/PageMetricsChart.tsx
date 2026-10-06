'use client'

import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'
import Loader from '@/components/Loader'
import type { ChartMetric, SeriesDataPoint } from '@/app/dashboard/types'
import { formatTimestampForAxis } from '@/app/dashboard/utils'
import styles from './PageMetricsChart.module.css'

const CHART_LABELS: Record<ChartMetric, string> = {
    pv: 'PV',
    cv: 'CV',
    cvr: 'CVR',
    sessions: 'セッション',
    newUserRate: '新規訪問率',
    bounceRate: '直帰率',
    bounceCount: '直帰数',
    averageSessionDuration: '平均滞在時間',
    engagementRate: 'エンゲージメント率',
    exitRate: '離脱率',
}

const CHART_STROKES: Record<ChartMetric, string> = {
    pv: '#3b82f6',
    cv: '#16a34a',
    cvr: '#9333ea',
    sessions: '#ea580c',
    newUserRate: '#0891b2',
    bounceRate: '#ef4444',
    bounceCount: '#ea580c',
    averageSessionDuration: '#0891b2',
    engagementRate: '#16a34a',
    exitRate: '#db2777',
}

const PERCENT_METRICS: ChartMetric[] = [
    'cvr',
    'newUserRate',
    'bounceRate',
    'engagementRate',
    'exitRate',
]

export interface PageMetricsChartProps {
    chartData: SeriesDataPoint[]
    chartMetric: ChartMetric
    granularity: 'daily' | 'weekly' | 'monthly'
    isLoading: boolean
}

export default function PageMetricsChart({
    chartData,
    chartMetric,
    granularity,
    isLoading,
}: PageMetricsChartProps) {
    const hasData =
        chartData.length > 0 &&
        chartData.some((d) => typeof (d as unknown as Record<string, unknown>)[chartMetric] === 'number')

    const isPercent = PERCENT_METRICS.includes(chartMetric)
    const isDuration = chartMetric === 'averageSessionDuration'

    const yAxisFormatter = (v: number) => {
        if (isDuration) {
            return `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`
        }
        if (isPercent) return `${v.toFixed(1)}%`
        return v.toLocaleString()
    }

    const tooltipFormatter = (value: number) => {
        if (isDuration) {
            const m = Math.floor(Number(value) / 60)
            const s = Math.floor(Number(value) % 60)
            return [m + ':' + String(s).padStart(2, '0'), CHART_LABELS[chartMetric]]
        }
        if (isPercent) {
            return [Number(value).toFixed(2) + '%', CHART_LABELS[chartMetric]]
        }
        return [Number(value).toLocaleString(), CHART_LABELS[chartMetric]]
    }

    const tooltipContentStyle =
        typeof document !== 'undefined' && document.documentElement.classList?.contains('dark')
            ? { background: '#1f2937', border: '1px solid #374151' }
            : undefined

    if (isLoading) {
        return (
            <div className={styles.chartLoader}>
                <Loader />
            </div>
        )
    }

    if (!hasData) {
        return <p className={styles.chartEmpty}>データがありません</p>
    }

    return (
        <div className={styles.chartWrap}>
            <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData} margin={{ top: 12, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" className={styles.chartGrid} />
                    <XAxis
                        dataKey="t"
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        tick={{ fontSize: 11 }}
                        tickFormatter={(t: number) => formatTimestampForAxis(t, granularity)}
                    />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={yAxisFormatter} />
                    <Tooltip
                        contentStyle={tooltipContentStyle}
                        formatter={(value: number) => tooltipFormatter(value)}
                        labelFormatter={(_, payload) =>
                            payload[0]?.payload?.label ??
                            (payload[0]?.payload?.t != null
                                ? formatTimestampForAxis(payload[0].payload.t, granularity)
                                : '')
                        }
                    />
                    <Line
                        type="monotone"
                        dataKey={chartMetric}
                        name={CHART_LABELS[chartMetric]}
                        stroke={CHART_STROKES[chartMetric]}
                        strokeWidth={2}
                        dot={false}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}
