'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts'
import type { TrendChartProps } from './types'
import styles from './TrendChart.module.css'

export default function TrendChart({ reportName, weeklyResults, monthlyTotal, monthlyData }: TrendChartProps) {
    const isDarkMode = true

    if (!weeklyResults || weeklyResults.length === 0) {
        return (
            <div className={styles.emptyState}>
                データがありません
            </div>
        )
    }

    const weeklyChartData = weeklyResults.map((result) => ({
        period: result.period,
        pv: result.dataA.pv,
        cv: result.dataA.cv,
        cvr: result.dataA.cvr * 100,
    }))

    const monthlyChartData = monthlyData?.map((data) => ({
        period: `${data.month}（月次）`,
        pv: data.pv,
        cv: data.cv,
        cvr: data.cvr * 100,
    })) || []

    const roundToNiceNumber = (value: number, roundUp: boolean = false): number => {
        if (value === 0) return 0
        const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(value))))
        const normalized = value / magnitude
        let nice: number
        if (roundUp) {
            if (normalized <= 1) nice = 1
            else if (normalized <= 2) nice = 2
            else if (normalized <= 5) nice = 5
            else nice = 10
        } else {
            if (normalized <= 1) nice = 1
            else if (normalized <= 2) nice = 2
            else if (normalized <= 5) nice = 5
            else nice = 10
        }
        return nice * magnitude
    }

    const calculateDomain = (data: number[], minValue: number = 0) => {
        if (!data || data.length === 0) {
            return [0, 100]
        }
        const validData = data.filter(d => !isNaN(d) && isFinite(d))
        if (validData.length === 0) {
            return [0, 100]
        }
        const max = Math.max(...validData)
        const min = Math.min(...validData, minValue)
        if (min === max) {
            const niceMax = roundToNiceNumber(max + 10, true)
            return [Math.max(0, min - 10), niceMax]
        }
        const range = max - min
        const padding = range * 0.1
        const rawMin = Math.max(0, min - padding)
        const rawMax = max + padding
        const niceMin = roundToNiceNumber(rawMin, false)
        const niceMax = roundToNiceNumber(rawMax, true)
        return [niceMin, niceMax]
    }

    const generateTicks = (min: number, max: number, count: number = 12): number[] => {
        if (min === max || isNaN(min) || isNaN(max) || !isFinite(min) || !isFinite(max)) {
            return []
        }
        const range = max - min
        if (range === 0) return []
        if (count < 2) return [min, max]

        const step = range / (count - 1)
        const ticks: number[] = []
        for (let i = 0; i < count; i++) {
            const value = min + step * i
            ticks.push(Math.round(value * 100) / 100)
        }
        return ticks
    }

    const weeklyPvDomainRaw = calculateDomain(weeklyChartData.map(d => d.pv))
    const weeklyCvDomainRaw = calculateDomain(weeklyChartData.map(d => d.cv))
    const weeklyCvrDomainRaw = calculateDomain(weeklyChartData.map(d => d.cvr), 0)
    
    const weeklyPvTicks = generateTicks(weeklyPvDomainRaw[0], weeklyPvDomainRaw[1], 12)
    const weeklyCvTicks = generateTicks(weeklyCvDomainRaw[0], weeklyCvDomainRaw[1], 12)
    const weeklyCvrTicks = generateTicks(weeklyCvrDomainRaw[0], weeklyCvrDomainRaw[1], 12)

    const weeklyPvDomain = weeklyPvTicks.length > 0 
        ? [weeklyPvTicks[0], weeklyPvTicks[weeklyPvTicks.length - 1]]
        : weeklyPvDomainRaw
    const weeklyCvDomain = weeklyCvTicks.length > 0 
        ? [weeklyCvTicks[0], weeklyCvTicks[weeklyCvTicks.length - 1]]
        : weeklyCvDomainRaw
    const weeklyCvrDomain = weeklyCvrTicks.length > 0 
        ? [weeklyCvrTicks[0], weeklyCvrTicks[weeklyCvrTicks.length - 1]]
        : weeklyCvrDomainRaw

    const monthlyPvDomain = monthlyChartData.length > 0 ? calculateDomain(monthlyChartData.map(d => d.pv)) : [0, 100]
    const monthlyCvDomain = monthlyChartData.length > 0 ? calculateDomain(monthlyChartData.map(d => d.cv)) : [0, 100]
    const monthlyCvrDomain = monthlyChartData.length > 0 ? calculateDomain(monthlyChartData.map(d => d.cvr), 0) : [0, 10]

    const textColor = isDarkMode ? '#9ca3af' : '#374151'
    const gridColor = isDarkMode ? '#374151' : '#e5e7eb'
    const lineColors = {
        pv: '#3b82f6',
        cv: '#16a34a',
        cvr: '#d97706',
        pvMonthly: '#3b82f6',
        cvMonthly: '#16a34a',
        cvrMonthly: '#d97706',
    }

    return (
        <div className={styles.container}>
            <h3 className={styles.reportName}>{reportName}</h3>
            <div className={styles.charts}>
                <div className={styles.chartSection}>
                    <h4 className={styles.sectionTitle}>週次推移</h4>

                    <div className={styles.chart}>
                        <h5 className={styles.chartTitle}>PV推移（週次）</h5>
                        <ResponsiveContainer width="100%" height={480}>
                            <LineChart data={weeklyChartData} margin={{ top: 20, right: 30, left: 80, bottom: 120 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                <XAxis
                                    dataKey="period"
                                    tick={{ fill: textColor, fontSize: 12 }}
                                    angle={-45}
                                    textAnchor="end"
                                    height={100}
                                    interval={0}
                                />
                                <YAxis 
                                    domain={weeklyPvDomain}
                                    width={100}
                                    ticks={weeklyPvTicks.length > 0 ? weeklyPvTicks : undefined}
                                    allowDecimals={false}
                                    allowDataOverflow={false}
                                    tick={(props: any) => {
                                        const { x, y, payload } = props
                                        const value = payload.value
                                        if (weeklyPvTicks.length > 0 && !weeklyPvTicks.includes(value)) {
                                            return <g />
                                        }
                                        return (
                                            <text x={x} y={y} fill={textColor} fontSize={12} textAnchor="end">
                                                {Math.round(value).toLocaleString()}
                                            </text>
                                        )
                                    }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
                                        border: `1px solid ${gridColor}`,
                                        color: textColor,
                                    }}
                                    formatter={(value: number) => value.toLocaleString()}
                                />
                                <Legend verticalAlign="top" align="center" wrapperStyle={{ color: textColor, paddingBottom: '10px' }} />
                                <Line
                                    type="monotone"
                                    dataKey="pv"
                                    stroke={lineColors.pv}
                                    strokeWidth={2}
                                    dot={{ fill: lineColors.pv, r: 4 }}
                                    name="PV"
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    <div className={styles.chart}>
                        <h5 className={styles.chartTitle}>CV推移（週次）</h5>
                        <ResponsiveContainer width="100%" height={480}>
                            <LineChart data={weeklyChartData} margin={{ top: 20, right: 30, left: 80, bottom: 120 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                <XAxis
                                    dataKey="period"
                                    tick={{ fill: textColor, fontSize: 12 }}
                                    angle={-45}
                                    textAnchor="end"
                                    height={100}
                                    interval={0}
                                />
                                <YAxis 
                                    domain={weeklyCvDomain}
                                    width={100}
                                    ticks={weeklyCvTicks.length > 0 ? weeklyCvTicks : undefined}
                                    allowDecimals={false}
                                    allowDataOverflow={false}
                                    tick={(props: any) => {
                                        const { x, y, payload } = props
                                        const value = payload.value
                                        if (weeklyCvTicks.length > 0 && !weeklyCvTicks.includes(value)) {
                                            return <g />
                                        }
                                        return (
                                            <text x={x} y={y} fill={textColor} fontSize={12} textAnchor="end">
                                                {Math.round(value).toLocaleString()}
                                            </text>
                                        )
                                    }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
                                        border: `1px solid ${gridColor}`,
                                        color: textColor,
                                    }}
                                    formatter={(value: number) => value.toLocaleString()}
                                />
                                <Legend verticalAlign="top" align="center" wrapperStyle={{ color: textColor, paddingBottom: '10px' }} />
                                <Line
                                    type="monotone"
                                    dataKey="cv"
                                    stroke={lineColors.cv}
                                    strokeWidth={2}
                                    dot={{ fill: lineColors.cv, r: 4 }}
                                    name="CV"
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    <div className={styles.chart}>
                        <h5 className={styles.chartTitle}>CVR推移（週次）</h5>
                        <ResponsiveContainer width="100%" height={480}>
                            <LineChart data={weeklyChartData} margin={{ top: 40, right: 30, left: 80, bottom: 100 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                <XAxis
                                    dataKey="period"
                                    tick={{ fill: textColor, fontSize: 12 }}
                                    angle={-45}
                                    textAnchor="end"
                                    height={100}
                                    interval={0}
                                />
                                <YAxis 
                                    domain={weeklyCvrDomain}
                                    width={100}
                                    ticks={weeklyCvrTicks.length > 0 ? weeklyCvrTicks : undefined}
                                    allowDecimals={true}
                                    allowDataOverflow={false}
                                    tick={(props: any) => {
                                        const { x, y, payload } = props
                                        const value = payload.value
                                        if (weeklyCvrTicks.length > 0) {
                                            const isIncluded = weeklyCvrTicks.some((tick: number) => Math.abs(tick - value) < 0.01)
                                            if (!isIncluded) {
                                                return <g />
                                            }
                                        }
                                        return (
                                            <text x={x} y={y} fill={textColor} fontSize={12} textAnchor="end">
                                                {value.toFixed(2)}%
                                            </text>
                                        )
                                    }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
                                        border: `1px solid ${gridColor}`,
                                        color: textColor,
                                    }}
                                    formatter={(value: number) => `${value.toFixed(2)}%`}
                                />
                                <Legend verticalAlign="top" align="center" wrapperStyle={{ color: textColor, paddingBottom: '10px' }} />
                                <Line
                                    type="monotone"
                                    dataKey="cvr"
                                    stroke={lineColors.cvr}
                                    strokeWidth={2}
                                    dot={{ fill: lineColors.cvr, r: 4 }}
                                    name="CVR (%)"
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {monthlyData && monthlyData.length > 0 && (
                    <div className={styles.chartSection}>
                        <h4 className={styles.sectionTitle}>月次推移</h4>
                        
                        <div className={styles.chart}>
                            <h5 className={styles.chartTitle}>PV推移（月次）</h5>
                            <ResponsiveContainer width="100%" height={480}>
                                <LineChart data={monthlyChartData} margin={{ top: 20, right: 30, left: 80, bottom: 80 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                    <XAxis
                                        dataKey="period"
                                        tick={{ fill: textColor, fontSize: 12 }}
                                        angle={-45}
                                        textAnchor="end"
                                        height={80}
                                    />
                                    <YAxis 
                                        domain={monthlyPvDomain}
                                        width={100}
                                        tickCount={12}
                                        allowDecimals={false}
                                        tick={{ fill: textColor, fontSize: 12 }}
                                        tickFormatter={(value: number) => Math.round(value).toLocaleString()}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
                                            border: `1px solid ${gridColor}`,
                                            color: textColor,
                                        }}
                                        formatter={(value: number) => value.toLocaleString()}
                                    />
                                    <Legend verticalAlign="top" align="center" wrapperStyle={{ color: textColor, paddingBottom: '10px' }} />
                                    <Line
                                        type="monotone"
                                        dataKey="pv"
                                        stroke={lineColors.pvMonthly}
                                        strokeWidth={3}
                                        dot={{ fill: lineColors.pvMonthly, r: 6 }}
                                        name="PV"
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>

                        <div className={styles.chart}>
                            <h5 className={styles.chartTitle}>CV推移（月次）</h5>
                            <ResponsiveContainer width="100%" height={480}>
                                <LineChart data={monthlyChartData} margin={{ top: 20, right: 30, left: 80, bottom: 80 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                    <XAxis
                                        dataKey="period"
                                        tick={{ fill: textColor, fontSize: 12 }}
                                        angle={-45}
                                        textAnchor="end"
                                        height={80}
                                    />
                                    <YAxis 
                                        domain={monthlyCvDomain}
                                        width={100}
                                        tickCount={12}
                                        allowDecimals={false}
                                        tick={{ fill: textColor, fontSize: 12 }}
                                        tickFormatter={(value: number) => Math.round(value).toLocaleString()}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
                                            border: `1px solid ${gridColor}`,
                                            color: textColor,
                                        }}
                                        formatter={(value: number) => value.toLocaleString()}
                                    />
                                    <Legend verticalAlign="top" align="center" wrapperStyle={{ color: textColor, paddingBottom: '10px' }} />
                                    <Line
                                        type="monotone"
                                        dataKey="cv"
                                        stroke={lineColors.cvMonthly}
                                        strokeWidth={3}
                                        dot={{ fill: lineColors.cvMonthly, r: 6 }}
                                        name="CV"
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>

                        <div className={styles.chart}>
                            <h5 className={styles.chartTitle}>CVR推移（月次）</h5>
                            <ResponsiveContainer width="100%" height={480}>
                                <LineChart data={monthlyChartData} margin={{ top: 40, right: 30, left: 80, bottom: 60 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                    <XAxis
                                        dataKey="period"
                                        tick={{ fill: textColor, fontSize: 12 }}
                                        angle={-45}
                                        textAnchor="end"
                                        height={80}
                                    />
                                    <YAxis 
                                        domain={monthlyCvrDomain}
                                        width={100}
                                        tickCount={12}
                                        allowDecimals={true}
                                        tick={{ fill: textColor, fontSize: 12 }}
                                        tickFormatter={(value: number) => `${value.toFixed(2)}%`}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
                                            border: `1px solid ${gridColor}`,
                                            color: textColor,
                                        }}
                                        formatter={(value: number) => `${value.toFixed(2)}%`}
                                    />
                                    <Legend verticalAlign="top" align="center" wrapperStyle={{ color: textColor, paddingBottom: '10px' }} />
                                    <Line
                                        type="monotone"
                                        dataKey="cvr"
                                        stroke={lineColors.cvrMonthly}
                                        strokeWidth={3}
                                        dot={{ fill: lineColors.cvrMonthly, r: 6 }}
                                        name="CVR (%)"
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}
            </div>

            <div className={styles.summary}>
                <h4 className={styles.summaryTitle}>月合計</h4>
                <div className={styles.summaryGrid}>
                    <div className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>PV:</span>
                        <span className={styles.summaryValue}>{monthlyTotal.pv.toLocaleString()}</span>
                    </div>
                    <div className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>CV:</span>
                        <span className={styles.summaryValue}>{monthlyTotal.cv.toLocaleString()}</span>
                    </div>
                    <div className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>CVR:</span>
                        <span className={styles.summaryValue}>{(monthlyTotal.cvr * 100).toFixed(2)}%</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
