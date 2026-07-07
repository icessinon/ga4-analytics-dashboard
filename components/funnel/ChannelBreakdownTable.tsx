'use client'

import type { ChannelFunnelData, FunnelStepData } from '@/app/funnel/types'
import { nodeColor } from '@/components/journey/journeyColors'
import styles from './ChannelBreakdownTable.module.css'

interface Props {
    breakdown: ChannelFunnelData[]
    overallSteps: FunnelStepData[]
}

function cvrColor(rate: number, overallRate: number): string {
    if (overallRate <= 0) return '#e5e7eb'
    if (rate >= overallRate * 1.2) return '#34d399'
    if (rate <= overallRate * 0.8) return '#f87171'
    return '#e5e7eb'
}

export default function ChannelBreakdownTable({ breakdown, overallSteps }: Props) {
    if (breakdown.length === 0 || overallSteps.length === 0) return null

    const overallCVR = overallSteps[overallSteps.length - 1]?.conversionRate ?? 0

    return (
        <div className={styles.wrap}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th className={styles.th}>チャネル</th>
                        {overallSteps.map((s, i) => (
                            <th key={i} className={styles.thNum}>{s.stepName}</th>
                        ))}
                        <th className={styles.thNum}>全体CVR</th>
                    </tr>
                </thead>
                <tbody>
                    <tr className={`${styles.row} ${styles.overallRow}`}>
                        <td className={styles.td}>全体</td>
                        {overallSteps.map((s, i) => (
                            <td key={i} className={styles.tdNum}>
                                <span className={styles.users}>{s.users.toLocaleString()}</span>
                                <span className={styles.pct}>{(s.conversionRate * 100).toFixed(1)}%</span>
                            </td>
                        ))}
                        <td className={styles.tdNum}>
                            <span className={styles.cvr}>{(overallCVR * 100).toFixed(2)}%</span>
                        </td>
                    </tr>
                    {breakdown.map((ch) => {
                        const chCVR = ch.steps[ch.steps.length - 1]?.conversionRate ?? 0
                        return (
                            <tr key={ch.channel} className={styles.row}>
                                <td className={styles.td}>
                                    <span className={styles.dot} style={{ background: nodeColor(ch.channel) }} />
                                    {ch.channel}
                                </td>
                                {ch.steps.map((s, i) => (
                                    <td key={i} className={styles.tdNum}>
                                        <span className={styles.users}>{s.users.toLocaleString()}</span>
                                        <span className={styles.pct}>{(s.conversionRate * 100).toFixed(1)}%</span>
                                    </td>
                                ))}
                                <td className={styles.tdNum}>
                                    <span className={styles.cvr} style={{ color: cvrColor(chCVR, overallCVR) }}>
                                        {(chCVR * 100).toFixed(2)}%
                                    </span>
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
            <p className={styles.note}>
                各セル：上段＝ユーザー数、下段＝そのチャネルのステップ1に対する通過率。
                全体CVRの色：<span style={{ color: '#34d399' }}>緑＝全体比+20%以上</span>／<span style={{ color: '#f87171' }}>赤＝全体比-20%以下</span>
            </p>
        </div>
    )
}
