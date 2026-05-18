'use client'

import React from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, Legend } from 'recharts'
import type { ConversionRateChartProps } from './types'
import styles from './ConversionRateChart.module.css'
export default function ConversionRateChart({ data, periodLabel, targetRate, periods, comparisonData, comparisonLabel }: ConversionRateChartProps) {
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
        '#f97316', // オレンジ
    ]
    
    const chartData = data.map((step, index) => {
        const baseData: any = {
            stepName: step.stepName.length > 20 ? step.stepName.substring(0, 20) + '...' : step.stepName,
            fullStepName: step.stepName,
            customEventLabel: step.customEventLabel,
        }
        
        if (isComparison && effectivePeriods.length > 1) {
            effectivePeriods.forEach((period, periodIdx) => {
                const periodStep = period.data[index]
                const dataKey = `conversionRatePercent${periodIdx}`
                baseData[dataKey] = (periodStep?.conversionRate ?? 0) * 100
            })
        } else if (isComparison) {
            const comparisonStep = comparisonData?.[index]
            const conversionRateA = step.conversionRate ?? 0
            const conversionRateB = comparisonStep?.conversionRate ?? 0
            baseData.conversionRatePercentA = conversionRateA * 100
            baseData.conversionRatePercentB = conversionRateB * 100
            baseData.difference = (conversionRateB - conversionRateA) * 100
        } else {
            const conversionRate = step.conversionRate ?? 0
            baseData.conversionRatePercent = conversionRate * 100
        }

        return baseData
    })

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload

            return (
                <div className={styles.tooltip}>
                    <p className={styles.tooltipTitle}>
                        {data.fullStepName || data.stepName}
                    </p>
                    {data.customEventLabel && (
                        <p className={styles.tooltipEventLabel}>{data.customEventLabel}</p>
                    )}
                    <div className={styles.tooltipContent}>
                        {isComparison && effectivePeriods.length > 1 ? (
                            <>
                                {effectivePeriods.map((period, periodIdx) => {
                                    const dataKey = `conversionRatePercent${periodIdx}`
                                    const rate = data[dataKey] || 0
                                    return (
                                        <div key={periodIdx} className={periodIdx > 0 ? `${styles.periodSection} ${styles.periodSectionB}` : styles.periodSection}>
                                            <p className={`${styles.periodLabelSmall} ${periodIdx > 0 ? styles.periodLabelSmallB : ''}`} style={{ color: periodColors[periodIdx % periodColors.length] }}>
                                                {period.label}
                                            </p>
                                            <p className={styles.tooltipText}>
                                                <span className={styles.tooltipLabel}>コンバージョン率:</span>{' '}
                                                <span className={styles.tooltipValue} style={{ color: periodColors[periodIdx % periodColors.length] }}>
                                                    {rate.toFixed(2)}%
                                                </span>
                                            </p>
                                        </div>
                                    )
                                })}
                            </>
                        ) : isComparison ? (
                            <>
                                <div className={styles.periodSection}>
                                    <p className={styles.periodLabelSmall}>
                                        {periodLabel || '期間A'}
                                    </p>
                                    <p className={styles.tooltipText}>
                                        <span className={styles.tooltipLabel}>コンバージョン率:</span>{' '}
                                        <span className={styles.tooltipValue}>
                                            {data.conversionRatePercentA?.toFixed(2) || '0.00'}%
                                        </span>
                                    </p>
                                </div>
                                <div className={`${styles.periodSection} ${styles.periodSectionB}`}>
                                    <p className={`${styles.periodLabelSmall} ${styles.periodLabelSmallB}`}>
                                        {comparisonLabel || '期間B'}
                                    </p>
                                    <p className={styles.tooltipText}>
                                        <span className={styles.tooltipLabel}>コンバージョン率:</span>{' '}
                                        <span className={`${styles.tooltipValue} ${styles.tooltipValueB}`}>
                                            {data.conversionRatePercentB?.toFixed(2) || '0.00'}%
                                        </span>
                                    </p>
                                </div>
                                {data.difference !== undefined && (
                                    <div className={styles.diffSection}>
                                        <p className={styles.diffLabel}>差分</p>
                                        <p className={`${styles.diffValue} ${
                                            data.difference >= 0 ? styles.diffValuePositive : styles.diffValueNegative
                                        }`}>
                                            {data.difference >= 0 ? '+' : ''}{data.difference.toFixed(2)}pt
                                        </p>
                                        <p className={styles.diffNote}>
                                            {data.difference >= 0 ? '改善' : '悪化'}
                                        </p>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <p className={styles.tooltipText}>
                                    <span className={styles.tooltipLabel}>コンバージョン率:</span>{' '}
                                    <span className={`${styles.tooltipValue} ${styles.tooltipValueB}`}>
                                        {data.conversionRatePercent?.toFixed(2) || '0.00'}%
                                    </span>
                                </p>
                            </>
                        )}
                    </div>
                </div>
            )
        }
        return null
    }

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
                            margin={{ top: 30, right: 40, left: 20, bottom: 60 }}
                        >
                            <XAxis
                                dataKey="stepName"
                                angle={-45}
                                textAnchor="end"
                                height={80}
                                tick={{ fontSize: 12, fill: isDarkMode ? '#e5e7eb' : '#374151', fontWeight: 500 }}
                                interval={0}
                            />
                            <YAxis
                                label={{ 
                                    value: 'コンバージョン率 (%)', 
                                    angle: -90, 
                                    position: 'insideLeft', 
                                    style: { textAnchor: 'middle', fill: yAxisLabelColor, fontSize: 14, fontWeight: 600 } 
                                }}
                                domain={[0, 100]}
                                tick={{ fontSize: 12, fill: isDarkMode ? '#9ca3af' : '#6b7280' }}
                            />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(75, 85, 99, 0.25)', stroke: '#9ca3af', strokeWidth: 1 }} />
                            {effectivePeriods.map((period, idx) => {
                                const dataKey = `conversionRatePercent${idx}`
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
                            margin={{ top: 30, right: 40, left: 20, bottom: 60 }}
                        >
                            <XAxis
                                dataKey="stepName"
                                angle={-45}
                                textAnchor="end"
                                height={80}
                                tick={{ fontSize: 12, fill: isDarkMode ? '#e5e7eb' : '#374151', fontWeight: 500 }}
                                interval={0}
                            />
                            <YAxis
                                label={{ 
                                    value: 'コンバージョン率 (%)', 
                                    angle: -90, 
                                    position: 'insideLeft', 
                                    style: { textAnchor: 'middle', fill: yAxisLabelColor, fontSize: 14, fontWeight: 600 } 
                                }}
                                domain={[0, 100]}
                                tick={{ fontSize: 12, fill: isDarkMode ? '#9ca3af' : '#6b7280' }}
                            />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(75, 85, 99, 0.25)', stroke: '#9ca3af', strokeWidth: 1 }} />
                            <Bar dataKey="conversionRatePercentA" radius={[6, 6, 0, 0]} barSize={35} name={periodLabel || '期間A'} fill="#3b82f6" />
                            <Bar dataKey="conversionRatePercentB" radius={[6, 6, 0, 0]} barSize={35} name={comparisonLabel || '期間B'} fill="#10b981" />
                            <Legend />
                        </BarChart>
                    ) : (
                        <BarChart
                            data={chartData}
                            margin={{ top: 30, right: 40, left: 20, bottom: 60 }}
                        >
                            <XAxis
                                dataKey="stepName"
                                angle={-45}
                                textAnchor="end"
                                height={80}
                                tick={{ fontSize: 12, fill: isDarkMode ? '#e5e7eb' : '#374151', fontWeight: 500 }}
                                interval={0}
                            />
                            <YAxis
                                label={{ 
                                    value: 'コンバージョン率 (%)', 
                                    angle: -90, 
                                    position: 'insideLeft', 
                                    style: { textAnchor: 'middle', fill: yAxisLabelColor, fontSize: 14, fontWeight: 600 } 
                                }}
                                domain={[0, 100]}
                                tick={{ fontSize: 12, fill: isDarkMode ? '#9ca3af' : '#6b7280' }}
                            />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(75, 85, 99, 0.25)', stroke: '#9ca3af', strokeWidth: 1 }} />
                            {targetRate && (
                                <ReferenceLine
                                    y={targetRate * 100}
                                    stroke="#ef4444"
                                    strokeDasharray="3 3"
                                    strokeWidth={2}
                                    label={{ 
                                        value: `目標: ${(targetRate * 100).toFixed(1)}%`, 
                                        position: 'right', 
                                        style: { fill: '#ef4444', fontSize: 12, fontWeight: 600 } 
                                    }}
                                />
                            )}
                            <Bar dataKey="conversionRatePercent" radius={[6, 6, 0, 0]} barSize={50}>
                                {chartData.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={entry.conversionRatePercent >= (targetRate || 0) * 100 ? '#10b981' : '#3b82f6'}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    )}
                </ResponsiveContainer>
            </div>
        </div>
    )
}
