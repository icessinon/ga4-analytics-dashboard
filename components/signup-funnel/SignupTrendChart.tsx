'use client'

import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([LineChart, TooltipComponent, LegendComponent, GridComponent, CanvasRenderer])

export interface TrendSeries {
    name: string
    color: string
    data: Array<number | null>
}

interface Props {
    labels: string[]
    series: TrendSeries[]
    percent?: boolean
}

export default function SignupTrendChart({ labels, series, percent = false }: Props) {
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!ref.current) return
        const chart = echarts.init(ref.current)
        chart.setOption({
            tooltip: {
                trigger: 'axis',
                valueFormatter: (v: number | null) => (v == null ? '－' : percent ? `${v}%` : v.toLocaleString()),
            },
            legend: {
                data: series.map((s) => s.name),
                textStyle: { color: '#d1d5db' },
                top: 0,
            },
            grid: { left: 48, right: 16, top: 32, bottom: 28 },
            xAxis: {
                type: 'category',
                data: labels,
                axisLabel: { color: '#9ca3af' },
                axisLine: { lineStyle: { color: '#374151' } },
            },
            yAxis: {
                type: 'value',
                axisLabel: { color: '#9ca3af', formatter: percent ? '{value}%' : '{value}' },
                splitLine: { lineStyle: { color: 'rgba(55,65,81,0.5)' } },
                ...(percent ? { max: (v: { max: number }) => Math.min(100, Math.ceil(v.max / 10) * 10) } : {}),
            },
            series: series.map((s) => ({
                name: s.name,
                type: 'line',
                smooth: true,
                showSymbol: false,
                connectNulls: false,
                data: s.data,
                lineStyle: { color: s.color, width: 2 },
                itemStyle: { color: s.color },
            })),
        }, true)
        const onResize = () => chart.resize()
        window.addEventListener('resize', onResize)
        return () => {
            window.removeEventListener('resize', onResize)
            chart.dispose()
        }
    }, [labels, series, percent])

    return <div ref={ref} style={{ width: '100%', height: 320 }} />
}
