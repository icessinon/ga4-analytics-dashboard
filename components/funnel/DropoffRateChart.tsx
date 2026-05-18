'use client'

import React from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Dot, Legend } from 'recharts'
import type { FunnelStepData } from '@/app/funnel/types'
import type { DropoffRateChartProps } from './types'
import styles from './DropoffRateChart.module.css'
export default function DropoffRateChart({ data, periodLabel, periods, comparisonData, comparisonLabel }: DropoffRateChartProps) {
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
    
    let maxDropoffRate = 0
    let maxDropoffIndex = -1
    if (!isComparison) {
        data.forEach((step, index) => {
            if (index > 0 && step.dropoffRate > maxDropoffRate) {
                maxDropoffRate = step.dropoffRate
                maxDropoffIndex = index
            }
        })
    }

    const chartData = data.map((step, index) => {
        const baseData: any = {
            stepName: step.stepName.length > 20 ? step.stepName.substring(0, 20) + '...' : step.stepName,
            fullStepName: step.stepName,
            customEventLabel: step.customEventLabel,
            isMaxDropoff: index === maxDropoffIndex,
        }
        
        if (isComparison && effectivePeriods.length > 1) {
            effectivePeriods.forEach((period, periodIdx) => {
                const periodStep = period.data[index]
                const dataKey = `dropoffRatePercent${periodIdx}`
                baseData[dataKey] = (periodStep?.dropoffRate ?? 0) * 100
            })
        } else if (isComparison) {
            const comparisonStep = comparisonData?.[index]
            const dropoffRateA = step.dropoffRate ?? 0
            const dropoffRateB = comparisonStep?.dropoffRate ?? 0
            baseData.dropoffRatePercentA = dropoffRateA * 100
            baseData.dropoffRatePercentB = dropoffRateB * 100
            baseData.difference = (dropoffRateB - dropoffRateA) * 100
        } else {
            const dropoffRate = step.dropoffRate ?? 0
            baseData.dropoffRatePercent = dropoffRate * 100
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
                                    const dataKey = `dropoffRatePercent${periodIdx}`
                                    const rate = data[dataKey] || 0
                                    return (
                                        <div key={periodIdx} className={periodIdx > 0 ? `${styles.periodSection} ${styles.periodSectionB}` : styles.periodSection}>
                                            <p className={`${styles.periodLabelSmall} ${periodIdx > 0 ? styles.periodLabelSmallB : ''}`} style={{ color: periodColors[periodIdx % periodColors.length] }}>
                                                {period.label}
                                            </p>
                                            <p className={styles.tooltipText}>
                                                <span className={styles.tooltipLabel}>ドロップオフ率:</span>{' '}
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
                                        <span className={styles.tooltipLabel}>ドロップオフ率:</span>{' '}
                                        <span className={styles.tooltipValue}>
                                            {data.dropoffRatePercentA?.toFixed(2) || '0.00'}%
                                        </span>
                                    </p>
                                </div>
                                <div className={`${styles.periodSection} ${styles.periodSectionB}`}>
                                    <p className={`${styles.periodLabelSmall} ${styles.periodLabelSmallB}`}>
                                        {comparisonLabel || '期間B'}
                                    </p>
                                    <p className={styles.tooltipText}>
                                        <span className={styles.tooltipLabel}>ドロップオフ率:</span>{' '}
                                        <span className={`${styles.tooltipValue} ${styles.tooltipValueB}`}>
                                            {data.dropoffRatePercentB?.toFixed(2) || '0.00'}%
                                        </span>
                                    </p>
                                </div>
                                {data.difference !== undefined && (
                                    <div className={styles.diffSection}>
                                        <p className={styles.diffLabel}>差分</p>
                                        <p className={`${styles.diffValue} ${
                                            data.difference <= 0 ? styles.diffValuePositive : styles.diffValueNegative
                                        }`}>
                                            {data.difference <= 0 ? '↓' : '↑'} {Math.abs(data.difference).toFixed(2)}pt
                                        </p>
                                        <p className={styles.diffNote}>
                                            {data.difference <= 0 ? '改善' : '悪化'}
                                        </p>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <p className={styles.tooltipText}>
                                    <span className={styles.tooltipLabel}>ドロップオフ率:</span>{' '}
                                    <span className={`${styles.tooltipValue} ${styles.tooltipValueRed}`}>
                                        {data.dropoffRatePercent?.toFixed(2) || '0.00'}%
                                    </span>
                                </p>
                                {data.isMaxDropoff && (
                                    <p className={styles.maxDropoffWarning}>
                                        ⚠️ 最大離脱ポイント
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )
        }
        return null
    }

    const CustomDot = (props: any) => {
        const { cx, cy, payload } = props
        if (payload.isMaxDropoff) {
            return (
                <Dot
                    cx={cx}
                    cy={cy}
                    r={8}
                    fill="#ef4444"
                    stroke="#fff"
                    strokeWidth={2}
                />
            )
        }
        return <Dot cx={cx} cy={cy} r={4} fill="#3b82f6" />
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
                <ResponsiveContainer width="100%" height={400}>
                    {isComparison && effectivePeriods.length > 1 ? (
                        <LineChart
                            data={chartData}
                            margin={{ top: 30, right: 40, left: 20, bottom: 50 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.3} />
                            <XAxis
                                dataKey="stepName"
                                angle={-45}
                                textAnchor="end"
                                height={80}
                                tick={{ fontSize: 12, fill: isDarkMode ? '#e5e7eb' : '#374151', fontWeight: 500 }}
                                interval={0}
                            />
                            <YAxis
                                label={{ value: 'ドロップオフ率 (%)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: yAxisLabelColor, fontSize: 14, fontWeight: 600 } }}
                                domain={[0, 100]}
                                tick={{ fontSize: 12, fill: isDarkMode ? '#9ca3af' : '#6b7280' }}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            {effectivePeriods.map((period, idx) => {
                                const dataKey = `dropoffRatePercent${idx}`
                                const color = periodColors[idx % periodColors.length]
                                return (
                                    <Line
                                        key={idx}
                                        type="monotone"
                                        dataKey={dataKey}
                                        stroke={color}
                                        strokeWidth={3}
                                        name={period.label}
                                        dot={{ r: 4, fill: color }}
                                        activeDot={{ r: 8, fill: color, stroke: '#fff', strokeWidth: 2 }}
                                    />
                                )
                            })}
                            <Legend />
                        </LineChart>
                    ) : isComparison ? (
                        <LineChart
                            data={chartData}
                            margin={{ top: 30, right: 40, left: 20, bottom: 50 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.3} />
                            <XAxis
                                dataKey="stepName"
                                angle={-45}
                                textAnchor="end"
                                height={80}
                                tick={{ fontSize: 12, fill: isDarkMode ? '#e5e7eb' : '#374151', fontWeight: 500 }}
                                interval={0}
                            />
                            <YAxis
                                label={{ value: 'ドロップオフ率 (%)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: yAxisLabelColor, fontSize: 14, fontWeight: 600 } }}
                                domain={[0, 100]}
                                tick={{ fontSize: 12, fill: isDarkMode ? '#9ca3af' : '#6b7280' }}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Line
                                type="monotone"
                                dataKey="dropoffRatePercentA"
                                stroke="#3b82f6"
                                strokeWidth={3}
                                name={periodLabel || '期間A'}
                                dot={{ r: 4, fill: '#3b82f6' }}
                                activeDot={{ r: 8, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
                            />
                            <Line
                                type="monotone"
                                dataKey="dropoffRatePercentB"
                                stroke="#10b981"
                                strokeWidth={3}
                                name={comparisonLabel || '期間B'}
                                dot={{ r: 4, fill: '#10b981' }}
                                activeDot={{ r: 8, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                            />
                            <Legend />
                        </LineChart>
                    ) : (
                        <LineChart
                            data={chartData}
                            margin={{ top: 30, right: 40, left: 20, bottom: 50 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.3} />
                            <XAxis
                                dataKey="stepName"
                                angle={-45}
                                textAnchor="end"
                                height={80}
                                tick={{ fontSize: 12, fill: isDarkMode ? '#e5e7eb' : '#374151', fontWeight: 500 }}
                                interval={0}
                            />
                            <YAxis
                                label={{ value: 'ドロップオフ率 (%)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: yAxisLabelColor, fontSize: 14, fontWeight: 600 } }}
                                domain={[0, 100]}
                                tick={{ fontSize: 12, fill: isDarkMode ? '#9ca3af' : '#6b7280' }}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Line
                                type="monotone"
                                dataKey="dropoffRatePercent"
                                stroke="#3b82f6"
                                strokeWidth={3}
                                dot={<CustomDot />}
                                activeDot={{ r: 8, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
                            />
                        </LineChart>
                    )}
                </ResponsiveContainer>
            </div>
            {maxDropoffIndex >= 0 && (
                <div className={styles.warningBox}>
                    <p className={styles.warningText}>
                        ⚠️ 最大離脱ステップ: {data[maxDropoffIndex].stepName} ({(maxDropoffRate * 100).toFixed(2)}%)
                    </p>
                </div>
            )}
        </div>
    )
}
