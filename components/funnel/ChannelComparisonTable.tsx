'use client'

import type { PeriodData } from '@/app/funnel/types'
import { nodeColor } from '@/components/journey/journeyColors'
import styles from './ChannelBreakdownTable.module.css'

interface Props {
    periods: PeriodData[]
}

function channelCVR(period: PeriodData, channel: string): { totalUsers: number; cvr: number } | null {
    const ch = period.data.channelBreakdown?.find((c) => c.channel === channel)
    if (!ch) return null
    const cvr = ch.steps[ch.steps.length - 1]?.conversionRate ?? 0
    return { totalUsers: ch.totalUsers, cvr }
}

export default function ChannelComparisonTable({ periods }: Props) {
    const withBreakdown = periods.filter((p) => (p.data.channelBreakdown?.length ?? 0) > 0)
    if (withBreakdown.length < 2) return null

    const channelSet = new Map<string, number>()
    for (const p of withBreakdown) {
        for (const ch of p.data.channelBreakdown ?? []) {
            channelSet.set(ch.channel, (channelSet.get(ch.channel) ?? 0) + ch.totalUsers)
        }
    }
    const channels = [...channelSet.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)

    const first = withBreakdown[0]
    const last = withBreakdown[withBreakdown.length - 1]

    return (
        <div className={styles.wrap}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th className={styles.th}>チャネル</th>
                        {withBreakdown.map((p, i) => (
                            <th key={i} className={styles.thNum}>{p.label}</th>
                        ))}
                        <th className={styles.thNum}>CVR変化</th>
                    </tr>
                </thead>
                <tbody>
                    {channels.map((channel) => {
                        const firstData = channelCVR(first, channel)
                        const lastData = channelCVR(last, channel)
                        const diff = firstData && lastData ? (lastData.cvr - firstData.cvr) * 100 : null
                        return (
                            <tr key={channel} className={styles.row}>
                                <td className={styles.td}>
                                    <span className={styles.dot} style={{ background: nodeColor(channel) }} />
                                    {channel}
                                </td>
                                {withBreakdown.map((p, i) => {
                                    const d = channelCVR(p, channel)
                                    return (
                                        <td key={i} className={styles.tdNum}>
                                            {d ? (
                                                <>
                                                    <span className={styles.users}>{d.totalUsers.toLocaleString()}人</span>
                                                    <span className={styles.pct}>CVR {(d.cvr * 100).toFixed(2)}%</span>
                                                </>
                                            ) : (
                                                <span className={styles.pct}>-</span>
                                            )}
                                        </td>
                                    )
                                })}
                                <td className={styles.tdNum}>
                                    {diff != null ? (
                                        <span className={styles.cvr} style={{ color: diff >= 0 ? '#34d399' : '#f87171' }}>
                                            {diff >= 0 ? '+' : ''}{diff.toFixed(2)}pt
                                        </span>
                                    ) : (
                                        <span className={styles.pct}>-</span>
                                    )}
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
            <p className={styles.note}>
                各セル：上段＝エントリー数（ステップ1到達）、下段＝そのチャネルの全体CVR。
                CVR変化＝最初の期間から最後の期間へのCVR差分（<span style={{ color: '#34d399' }}>緑＝改善</span>／<span style={{ color: '#f87171' }}>赤＝悪化</span>）
            </p>
        </div>
    )
}
