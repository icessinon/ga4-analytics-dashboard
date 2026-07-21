'use client'

import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([LineChart, TooltipComponent, LegendComponent, GridComponent, CanvasRenderer])

export interface DailyPoint {
    date: string
    JobR?: number
    JobA?: number
    JobH?: number
    signup?: number
}

const SERIES: Array<{ key: keyof DailyPoint; label: string; color: string }> = [
    { key: 'JobR', label: '人材紹介', color: '#60a5fa' },
    { key: 'JobH', label: 'ハローワーク', color: '#fbbf24' },
    { key: 'JobA', label: '求人広告', color: '#f87171' },
    { key: 'signup', label: '会員登録', color: '#4ade80' },
]

export default function CvTypesTrendChart({ daily }: { daily: DailyPoint[] }) {
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!ref.current) return
        const chart = echarts.init(ref.current)
        const dates = daily.map((d) => `${parseInt(d.date.slice(4, 6), 10)}/${parseInt(d.date.slice(6, 8), 10)}`)
        chart.setOption({
            tooltip: { trigger: 'axis' },
            legend: {
                data: SERIES.map((s) => s.label),
                textStyle: { color: '#d1d5db' },
                top: 0,
            },
            grid: { left: 44, right: 16, top: 32, bottom: 28 },
            xAxis: {
                type: 'category',
                data: dates,
                axisLabel: { color: '#9ca3af' },
                axisLine: { lineStyle: { color: '#374151' } },
            },
            yAxis: {
                type: 'value',
                axisLabel: { color: '#9ca3af' },
                splitLine: { lineStyle: { color: 'rgba(55,65,81,0.5)' } },
            },
            series: SERIES.map((s) => ({
                name: s.label,
                type: 'line',
                smooth: true,
                showSymbol: false,
                data: daily.map((d) => d[s.key] ?? 0),
                lineStyle: { color: s.color, width: 2 },
                itemStyle: { color: s.color },
            })),
        })
        const onResize = () => chart.resize()
        window.addEventListener('resize', onResize)
        return () => {
            window.removeEventListener('resize', onResize)
            chart.dispose()
        }
    }, [daily])

    return <div ref={ref} style={{ width: '100%', height: 320 }} />
}
