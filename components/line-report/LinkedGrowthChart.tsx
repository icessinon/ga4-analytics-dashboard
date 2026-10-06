'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import styles from './LinkedGrowthChart.module.css'

export interface DeliveryPoint {
    /** 'YYYYMMDD' */
    date: string
    /** その時点のLINE連携者の累計 */
    linked: number
}

type Granularity = 'total' | 'delivery' | 'month'

/** recharts は色を属性で受け取るので、CSS変数を実値に解決してから渡す */
const FALLBACK = {
    green: '#06c755',
    greenDim: '#0a5c2e',
    text: '#9ca3af',
    grid: '#374151',
    surface: '#1f2937',
}

function useChartColors() {
    const [colors, setColors] = useState(FALLBACK)
    useEffect(() => {
        const read = () => {
            const s = getComputedStyle(document.documentElement)
            const pick = (name: string, fb: string) => s.getPropertyValue(name).trim() || fb
            setColors({
                green: pick('--line-green', FALLBACK.green),
                greenDim: pick('--line-green-dim', FALLBACK.greenDim),
                text: pick('--text-muted', FALLBACK.text),
                grid: pick('--border-subtle', FALLBACK.grid),
                surface: pick('--bg-surface', FALLBACK.surface),
            })
        }
        read()
        // テーマは data-theme の差し替えで切り替わる
        const mo = new MutationObserver(read)
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
        return () => mo.disconnect()
    }, [])
    return colors
}

/** 直近の変化を読めるようにする上限。全期間を描くと点が潰れて施策前後が見えない */
const MAX_DELIVERY_POINTS = 26
const MAX_MONTH_POINTS = 13
/** 累計は長期の傾きを見るものなので多めに残す */
const MAX_TOTAL_POINTS = 52

function daysBetween(newer: string, older: string): number {
    const toIso = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`
    return Math.round((Date.parse(toIso(newer)) - Date.parse(toIso(older))) / 86400000)
}

/**
 * LINE連携者の増え方。累計は尺度が違うので同じ軸に重ねず、サマリーカード側に任せている。
 *
 * 配信は週1→週2と間隔が変わっているため、配信ごとの表示は増分そのものではなく
 * 1日あたりに割った値を使う（そうしないと間隔の長い回が多く見える）。
 */
export default function LinkedGrowthChart({ deliveries }: { deliveries: DeliveryPoint[] }) {
    const [granularity, setGranularity] = useState<Granularity>('total')
    const C = useChartColors()

    // 受け取りは新しい順。推移は古い→新しいで見る
    const asc = useMemo(
        () => [...deliveries].sort((a, b) => a.date.localeCompare(b.date)),
        [deliveries]
    )

    const totals = useMemo(
        () =>
            asc
                .map((d) => ({ label: `${d.date.slice(4, 6)}/${d.date.slice(6, 8)}`, linked: d.linked }))
                .slice(-MAX_TOTAL_POINTS),
        [asc]
    )

    const perDelivery = useMemo(
        () =>
            asc
                .slice(1)
                .map((d, i) => {
                    const prev = asc[i]
                    const days = daysBetween(d.date, prev.date)
                    const delta = d.linked - prev.linked
                    return {
                        label: `${d.date.slice(4, 6)}/${d.date.slice(6, 8)}`,
                        perDay: days > 0 ? Number((delta / days).toFixed(1)) : 0,
                        delta,
                        days,
                    }
                })
                .slice(-MAX_DELIVERY_POINTS),
        [asc]
    )

    // 月次は「その月の最後の値 − 前月の最後の値」。月内の配信回数に左右されない純増
    const perMonth = useMemo(() => {
        const lastOfMonth = new Map<string, number>()
        for (const d of asc) lastOfMonth.set(d.date.slice(0, 6), d.linked)
        const months = [...lastOfMonth.keys()].sort()
        // 最新の配信が属する月はまだ締まっていない
        const openMonth = asc.length > 0 ? asc[asc.length - 1].date.slice(0, 6) : ''
        return months
            .slice(1)
            .map((m, i) => ({
                label: `${m.slice(0, 4)}/${m.slice(4, 6)}`,
                delta: (lastOfMonth.get(m) ?? 0) - (lastOfMonth.get(months[i]) ?? 0),
                inProgress: m === openMonth,
            }))
            .slice(-MAX_MONTH_POINTS)
    }, [asc])

    const isTotal = granularity === 'total'
    const isDelivery = granularity === 'delivery'
    const hasData = isTotal ? totals.length > 0 : isDelivery ? perDelivery.length > 0 : perMonth.length > 0

    const tooltipStyle = { backgroundColor: C.surface, border: `1px solid ${C.grid}`, color: 'var(--text-primary)' }
    // recharts は項目行の色を系列色（Cell 指定の Bar では未定義＝黒）にするので、本文色を明示する
    const tooltipItemStyle = { color: 'var(--text-strong)', fontWeight: 600 }
    const tooltipLabelStyle = { color: 'var(--text-muted)', marginBottom: 4 }
    const axis = { stroke: C.text, tick: { fill: C.text, fontSize: 12 } }

    const TABS: { key: Granularity; label: string }[] = [
        { key: 'total', label: '累計（連携者数）' },
        { key: 'delivery', label: '配信ごと（1日あたり）' },
        { key: 'month', label: '月次（純増）' },
    ]

    return (
        <div>
            <div className={styles.toggleRow}>
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        className={granularity === t.key ? styles.toggleActive : styles.toggle}
                        onClick={() => setGranularity(t.key)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {!hasData ? (
                <p className={styles.empty}>推移を出せるだけの配信データがありません</p>
            ) : (
                <ResponsiveContainer width="100%" height={260}>
                    {isTotal ? (
                        <LineChart data={totals} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                            <XAxis dataKey="label" {...axis} />
                            {/* 累計は6千台から動く。autoだと0側に引っ張られて傾きが潰れるのでデータ範囲に張り付ける */}
                            <YAxis
                                {...axis}
                                width={52}
                                domain={[
                                    (dataMin: number) => Math.floor((dataMin - (dataMin * 0.01)) / 100) * 100,
                                    (dataMax: number) => Math.ceil((dataMax + (dataMax * 0.01)) / 100) * 100,
                                ]}
                                tickFormatter={(v: number) => v.toLocaleString()}
                            />
                            <Tooltip
                                contentStyle={tooltipStyle}
                                itemStyle={tooltipItemStyle}
                                labelStyle={tooltipLabelStyle}
                                formatter={(value: number) => [`${value.toLocaleString()} 人`, 'LINE連携者（累計）']}
                            />
                            <Line
                                type="monotone"
                                dataKey="linked"
                                stroke={C.green}
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 5 }}
                                name="LINE連携者（累計）"
                            />
                        </LineChart>
                    ) : isDelivery ? (
                        <LineChart data={perDelivery} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                            <XAxis dataKey="label" {...axis} />
                            <YAxis {...axis} width={44} />
                            <Tooltip
                                contentStyle={tooltipStyle}
                                itemStyle={tooltipItemStyle}
                                labelStyle={tooltipLabelStyle}
                                formatter={(value: number, _n, item) => [
                                    `${value} 人/日（${item.payload.days}日で +${item.payload.delta}）`,
                                    '増加ペース',
                                ]}
                            />
                            <Line
                                type="monotone"
                                dataKey="perDay"
                                stroke={C.green}
                                strokeWidth={2}
                                dot={{ fill: C.green, r: 3 }}
                                activeDot={{ r: 5 }}
                                name="増加ペース"
                            />
                        </LineChart>
                    ) : (
                        <BarChart data={perMonth} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                            <XAxis dataKey="label" {...axis} />
                            <YAxis {...axis} width={44} />
                            <Tooltip
                                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                                contentStyle={tooltipStyle}
                                itemStyle={tooltipItemStyle}
                                labelStyle={tooltipLabelStyle}
                                formatter={(value: number, _n, item) => [
                                    `+${value.toLocaleString()} 人${item.payload.inProgress ? '（集計途中）' : ''}`,
                                    '月間純増',
                                ]}
                            />
                            <Bar dataKey="delta" radius={[4, 4, 0, 0]} name="月間純増">
                                {perMonth.map((m) => (
                                    <Cell key={m.label} fill={m.inProgress ? C.greenDim : C.green} />
                                ))}
                            </Bar>
                        </BarChart>
                    )}
                </ResponsiveContainer>
            )}

            <p className={styles.note}>
                {isTotal
                    ? `※ 配信時点のLINE連携者の累計です（直近${MAX_TOTAL_POINTS}回）。傾きが急なほど増えが速い。変化を読めるよう縦軸は0起点にしていません。`
                    : isDelivery
                        ? `※ 配信間隔が週1→週2と変わっているため、増分そのものではなく1日あたりに割った値で並べています（直近${MAX_DELIVERY_POINTS}回）。`
                        : `※ 各月の最後の配信時点の累計同士の差です。月内の配信回数には左右されません（直近${MAX_MONTH_POINTS}ヶ月）。暗い棒は集計途中の月です。`}
                <br />
                ※ 連携者数は累計のため、上の期間選択とは独立して長期の推移を出しています。
            </p>
        </div>
    )
}
