'use client'

import React from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts'
import type { FunnelChartProps } from './types'
import styles from './FunnelChart.module.css'
export default function FunnelChart({ data, periodLabel, periods, comparisonData, comparisonLabel }: FunnelChartProps) {
    const isDarkMode = true

    const effectivePeriods = periods && periods.length > 0
        ? periods
        : (comparisonData && comparisonData.length > 0 && periodLabel && comparisonLabel
                ? [
                        { label: periodLabel, data },
                        { label: comparisonLabel, data: comparisonData }
                    ]
                : [])

    if (!data || data.length === 0) {
        return (
            <div className={styles.emptyState}>
                データがありません
            </div>
        )
    }

    const isComparison = effectivePeriods.length > 1 || (comparisonData && comparisonData.length > 0)
    const yAxisLabelColor = isDarkMode ? '#e5e7eb' : '#374151'

    const periodColors = [
        '#3b82f6', // 青
        '#10b981', // 緑
        '#f59e0b', // オレンジ
        '#8b5cf6', // 紫
        '#ec4899', // ピンク
        '#06b6d4', // シアン
        '#84cc16', // ライム
        '#f97316',
    ]

    const getColor = (dropoffRate: number, index: number, isComparison: boolean, periodIndex: number = 0) => {
        if (isComparison && effectivePeriods.length > 1) {
            const baseColor = periodColors[periodIndex % periodColors.length]
            if (index === 0) return baseColor
            return baseColor
        } else if (isComparison) {
            if (periodIndex === 1) {
                if (index === 0) return '#10b981' // 緑
                if (dropoffRate < 0.1) return '#10b981'
                if (dropoffRate < 0.3) return '#84cc16'
                return '#22c55e'
            } else {
                if (index === 0) return '#3b82f6'
                if (dropoffRate < 0.1) return '#3b82f6'
                if (dropoffRate < 0.3) return '#60a5fa'
                return '#2563eb'
            }
        } else {
            if (index === 0) return '#10b981'
            if (dropoffRate < 0.1) return '#10b981'
            if (dropoffRate < 0.3) return '#f59e0b'
            return '#ef4444'
        }
    }

    const chartData = data.map((step, index) => {
        const baseData: any = {
            stepName: step.stepName.length > 20 ? step.stepName.substring(0, 20) + '...' : step.stepName,
            fullStepName: step.stepName,
            customEventLabel: step.customEventLabel,
        }
        
        if (isComparison && effectivePeriods.length > 1) {
            effectivePeriods.forEach((period, periodIdx) => {
                const periodStep = period.data[index]
                const dataKey = `users${periodIdx}`
                baseData[dataKey] = periodStep?.users || 0
            })
        } else if (isComparison) {
            baseData.usersA = step.users || 0
            const comparisonStep = comparisonData?.[index]
            if (comparisonStep) {
                baseData.usersB = comparisonStep.users || 0
            } else {
                baseData.usersB = 0
            }
        } else {
            baseData.users = step.users || 0
            baseData.color = getColor(step.dropoffRate, index, false)
        }
        
        return baseData
    })

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload
            
            return (
                <div className={styles.tooltip}>
                    <p className={styles.tooltipTitle}>{data.fullStepName || data.stepName}</p>
                    {data.customEventLabel && (
                        <p className={styles.tooltipEventLabel}>{data.customEventLabel}</p>
                    )}
                    <div className={styles.tooltipContent}>
                        {isComparison && effectivePeriods.length > 1 ? (
                            <>
                                {effectivePeriods.map((period, periodIdx) => {
                                    const dataKey = `users${periodIdx}`
                                    const users = data[dataKey] || 0
                                    return (
                                        <div key={periodIdx} className={periodIdx > 0 ? `${styles.periodSection} ${styles.periodSectionB}` : styles.periodSection}>
                                            <p className={`${styles.periodLabelSmall} ${periodIdx > 0 ? styles.periodLabelSmallB : ''}`} style={{ color: periodColors[periodIdx % periodColors.length] }}>
                                                {period.label}
                                            </p>
                                            <p className={styles.tooltipText}>
                                                <span className={styles.tooltipLabel}>ユーザー数:</span>{' '}
                                                <span className={styles.tooltipValue} style={{ color: periodColors[periodIdx % periodColors.length] }}>
                                                    {users.toLocaleString()}
                                                </span>
                                            </p>
                                        </div>
                                    )
                                })}
                            </>
                        ) : isComparison ? (
                            <>
                                <div className={styles.periodSection}>
                                    <p className={styles.periodLabelSmall}>{periodLabel || '期間A'}</p>
                                    <p className={styles.tooltipText}>
                                        <span className={styles.tooltipLabel}>ユーザー数:</span>{' '}
                                        <span className={styles.tooltipValue}>{(data.usersA || 0).toLocaleString()}</span>
                                    </p>
                                </div>
                                {data.usersB !== undefined && (
                                    <div className={`${styles.periodSection} ${styles.periodSectionB}`}>
                                        <p className={`${styles.periodLabelSmall} ${styles.periodLabelSmallB}`}>{comparisonLabel || '期間B'}</p>
                                        <p className={styles.tooltipText}>
                                            <span className={styles.tooltipLabel}>ユーザー数:</span>{' '}
                                            <span className={`${styles.tooltipValue} ${styles.tooltipValueB}`}>{(data.usersB || 0).toLocaleString()}</span>
                                        </p>
                                        {data.usersA !== undefined && data.usersB !== undefined && (
                                            <p className={styles.diffText}>
                                                <span className={styles.tooltipLabel}>差分:</span>{' '}
                                                <span className={data.usersB - data.usersA >= 0 ? styles.diffPositive : styles.diffNegative}>
                                                    {data.usersB - data.usersA >= 0 ? '+' : ''}{(data.usersB - data.usersA).toLocaleString()}
                                                </span>
                                            </p>
                                        )}
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <p className={styles.tooltipText}>
                                <span className={styles.tooltipLabel}>ユーザー数:</span>{' '}
                                <span className={styles.tooltipValue}>{(data.users || 0).toLocaleString()}</span>
                            </p>
                        </>
                        )}
                    </div>
                </div>
            )
        }
        return null
    }

    const maxStepNameLength = Math.max(...data.map((step) => step.stepName.length), 10)
    const leftMargin = Math.min(Math.max(maxStepNameLength * 8, 120), 250)

    return (
        <div className={styles.container}>
            {isComparison && effectivePeriods.length > 1 ? (
                <div className={styles.header}>
                    {effectivePeriods.map((period, idx) => (
                        <React.Fragment key={idx}>
                            {idx > 0 && <span className={styles.vs}>vs</span>}
                            <h3 className={styles.periodLabel} style={{ color: periodColors[idx % periodColors.length] }}>
                                {period.label}
                            </h3>
                        </React.Fragment>
                    ))}
                </div>
            ) : isComparison ? (
                <div className={styles.header}>
                    {periodLabel && (
                        <h3 className={`${styles.periodLabel} ${styles.periodLabelA}`}>{periodLabel}</h3>
                    )}
                    {comparisonLabel && (
                        <>
                            <span className={styles.vs}>vs</span>
                            <h3 className={`${styles.periodLabel} ${styles.periodLabelB}`}>{comparisonLabel}</h3>
                        </>
                    )}
                </div>
            ) : (
                periodLabel && (
                    <h3 className={styles.title}>{periodLabel}</h3>
                )
            )}
            <div className={styles.chartContainer}>
                <ResponsiveContainer width="100%" height={Math.max(400, data.length * 60)}>
                    {isComparison && effectivePeriods.length > 1 ? (
                        <BarChart
                            data={chartData}
                            margin={{ top: 20, right: 40, left: 20, bottom: 50 }}
                        >
                            <XAxis
                                dataKey="stepName"
                                angle={-45}
                                textAnchor="end"
                                height={80}
                                tick={{ fontSize: 13, fill: isDarkMode ? '#e5e7eb' : '#374151', fontWeight: 500 }}
                                interval={0}
                            />
                            <YAxis
                                label={{ value: 'ユーザー数', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: yAxisLabelColor, fontSize: 14, fontWeight: 600 } }}
                                tick={{ fontSize: 12, fill: isDarkMode ? '#9ca3af' : '#6b7280' }}
                            />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(75, 85, 99, 0.25)', stroke: '#9ca3af', strokeWidth: 1 }} />
                            {effectivePeriods.map((period, idx) => {
                                const dataKey = `users${idx}`
                                const color = periodColors[idx % periodColors.length]
                                return (
                                    <Bar
                                        key={idx}
                                        dataKey={dataKey}
                                        radius={[6, 6, 0, 0]}
                                        barSize={Math.max(30, 100 / effectivePeriods.length)}
                                        name={period.label}
                                        fill={color}
                                    />
                                )
                            })}
                            <Legend />
                        </BarChart>
                    ) : isComparison ? (
                        <BarChart
                            data={chartData}
                            margin={{ top: 20, right: 40, left: 20, bottom: 50 }}
                        >
                            <XAxis
                                dataKey="stepName"
                                angle={-45}
                                textAnchor="end"
                                height={80}
                                tick={{ fontSize: 13, fill: isDarkMode ? '#e5e7eb' : '#374151', fontWeight: 500 }}
                                interval={0}
                            />
                            <YAxis
                                label={{ value: 'ユーザー数', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: yAxisLabelColor, fontSize: 14, fontWeight: 600 } }}
                                tick={{ fontSize: 12, fill: isDarkMode ? '#9ca3af' : '#6b7280' }}
                            />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(75, 85, 99, 0.25)', stroke: '#9ca3af', strokeWidth: 1 }} />
                            <Bar dataKey="usersA" radius={[6, 6, 0, 0]} barSize={35} name={periodLabel || '期間A'} fill="#3b82f6" />
                            <Bar dataKey="usersB" radius={[6, 6, 0, 0]} barSize={35} name={comparisonLabel || '期間B'} fill="#10b981" />
                            <Legend />
                        </BarChart>
                    ) : (
                        <BarChart
                            data={chartData}
                            layout="vertical"
                            margin={{ top: 20, right: 40, left: leftMargin, bottom: 20 }}
                        >
                            <XAxis 
                                type="number" 
                                tick={{ fontSize: 12, fill: isDarkMode ? '#9ca3af' : '#6b7280' }}
                                label={{ value: 'ユーザー数', position: 'insideBottom', offset: -5, style: { textAnchor: 'middle', fill: yAxisLabelColor, fontSize: 14, fontWeight: 600 } }}
                            />
                            <YAxis
                                dataKey="stepName"
                                type="category"
                                width={leftMargin - 20}
                                tick={{ fontSize: 13, fill: isDarkMode ? '#e5e7eb' : '#374151', fontWeight: 500 }}
                                textAnchor="end"
                                interval={0}
                            />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(75, 85, 99, 0.25)', stroke: '#9ca3af', strokeWidth: 1 }} />
                            <Bar dataKey="users" radius={[0, 6, 6, 0]} barSize={40}>
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Bar>
                        </BarChart>
                    )}
                </ResponsiveContainer>
            </div>
        </div>
    )
}
