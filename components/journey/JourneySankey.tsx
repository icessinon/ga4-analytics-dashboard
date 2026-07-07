'use client'

import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { SankeyChart } from 'echarts/charts'
import { TooltipComponent, GraphicComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { nodeColor, exitRateColor, exitRateLabel } from './journeyColors'

echarts.use([SankeyChart, TooltipComponent, GraphicComponent, CanvasRenderer])

export interface SankeyNode {
    id: string
    stage: number
    sessions: number
}

export interface SankeyFlow {
    from: string
    to: string
    sessions: number
}

interface Props {
    nodes: SankeyNode[]
    flows: SankeyFlow[]
    goalLabel: string
    totalGoalViews: number
    pageExitRates: Record<string, number>
    onChannelClick?: (channel: string) => void
}

// 同名ノードがステージを跨いで存在してもECharts上で衝突しないよう "stage|id" を内部名にする
function nodeKey(stage: number, id: string): string {
    return `${stage}|${id}`
}

function idOf(name: string): string {
    return name.slice(name.indexOf('|') + 1)
}

function stageOf(name: string): number {
    return parseInt(name, 10)
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export default function JourneySankey({ nodes, flows, goalLabel, totalGoalViews, pageExitRates, onChannelClick }: Props) {
    const containerRef = useRef<HTMLDivElement>(null)
    const chartRef = useRef<echarts.EChartsType | null>(null)
    const onChannelClickRef = useRef(onChannelClick)
    onChannelClickRef.current = onChannelClick

    useEffect(() => {
        if (!containerRef.current) return
        const chart = echarts.init(containerRef.current)
        chartRef.current = chart

        chart.on('click', (params) => {
            const p = params as { dataType?: string; name?: string }
            if (p.dataType === 'node' && p.name && stageOf(p.name) === 0) {
                onChannelClickRef.current?.(idOf(p.name))
            }
        })

        const observer = new ResizeObserver(() => chart.resize())
        observer.observe(containerRef.current)

        return () => {
            observer.disconnect()
            chart.dispose()
            chartRef.current = null
        }
    }, [])

    useEffect(() => {
        const chart = chartRef.current
        if (!chart) return

        const pct = (n: number) =>
            totalGoalViews > 0 ? ` (${((n / totalGoalViews) * 100).toFixed(1)}%)` : ''

        const data = nodes.map((n) => ({
            name: nodeKey(n.stage, n.id),
            depth: n.stage,
            itemStyle: { color: nodeColor(n.id), borderWidth: 0 },
            label:
                n.stage === 2
                    ? { position: 'left' as const, color: '#fbbf24', fontWeight: 700 as const }
                    : undefined,
        }))

        const links = flows
            .map((f) => {
                const toGoal = f.to === goalLabel
                return {
                    source: nodeKey(toGoal ? 1 : 0, f.from),
                    target: nodeKey(toGoal ? 2 : 1, f.to),
                    value: f.sessions,
                }
            })
            .filter((l) => l.source !== l.target)

        chart.setOption(
            {
                tooltip: {
                    trigger: 'item',
                    backgroundColor: '#1f2937',
                    borderColor: '#4b5563',
                    textStyle: { color: '#e5e7eb', fontSize: 12 },
                    formatter: (params: unknown) => {
                        const p = params as {
                            dataType?: string
                            name: string
                            value?: number
                            data?: { source?: string; target?: string }
                        }
                        const v = typeof p.value === 'number' ? p.value : 0
                        if (p.dataType === 'edge' && p.data?.source && p.data?.target) {
                            return `${escapeHtml(idOf(p.data.source))} → ${escapeHtml(idOf(p.data.target))}<br/>${v.toLocaleString()} 件${pct(v)}`
                        }
                        const id = idOf(p.name)
                        const lines = [`<b>${escapeHtml(id)}</b>`, `${v.toLocaleString()} 件${pct(v)}`]
                        if (stageOf(p.name) === 1) {
                            const er = pageExitRates[id]
                            if (er != null) {
                                lines.push(
                                    `<span style="color:${exitRateColor(er)}">離脱率: ${(er * 100).toFixed(1)}% (${exitRateLabel(er)})</span>`
                                )
                            }
                            lines.push('<span style="color:#9ca3af;font-size:11px">クリックはチャネル列のみ有効</span>')
                        }
                        if (stageOf(p.name) === 0) {
                            lines.push('<span style="color:#9ca3af;font-size:11px">クリックでこのチャネルに絞り込み</span>')
                        }
                        return lines.join('<br/>')
                    },
                },
                graphic: [
                    { type: 'text', left: 10, top: 4, style: { text: '流入チャネル', fill: '#9ca3af', fontSize: 12, fontWeight: 600 } },
                    { type: 'text', left: 'center', top: 4, style: { text: '直前ページ', fill: '#9ca3af', fontSize: 12, fontWeight: 600 } },
                    { type: 'text', right: 10, top: 4, style: { text: 'ゴール', fill: '#9ca3af', fontSize: 12, fontWeight: 600 } },
                ],
                series: [
                    {
                        type: 'sankey',
                        data,
                        links,
                        left: 12,
                        top: 30,
                        right: 150,
                        bottom: 12,
                        nodeWidth: 16,
                        nodeGap: 10,
                        nodeAlign: 'justify',
                        layoutIterations: 64,
                        draggable: true,
                        emphasis: {
                            focus: 'adjacency',
                            lineStyle: { opacity: 0.55 },
                        },
                        blur: {
                            itemStyle: { opacity: 0.15 },
                            lineStyle: { opacity: 0.04 },
                            label: { opacity: 0.2 },
                        },
                        lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.3 },
                        label: {
                            color: '#e5e7eb',
                            fontSize: 11,
                            formatter: (params: unknown) => {
                                const p = params as { name: string; value?: number }
                                const id = idOf(p.name)
                                const v = typeof p.value === 'number' ? p.value : 0
                                const short = id.length > 16 ? id.slice(0, 15) + '…' : id
                                return `${short}  ${v.toLocaleString()}`
                            },
                        },
                    },
                ],
            },
            { notMerge: true }
        )
    }, [nodes, flows, goalLabel, totalGoalViews, pageExitRates])

    return <div ref={containerRef} style={{ width: '100%', height: 560 }} />
}
