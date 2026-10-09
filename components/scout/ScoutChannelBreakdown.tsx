'use client'

import type { CSSProperties } from 'react'
import Link from '@/components/Link'
import { ui, cx } from '@/components/ui'
import { CHART_COLORS } from '@/lib/constants/chartColors'
import type { ScoutChannelRow } from '@/lib/services/scout/scoutFunnelTypes'
import styles from './ScoutChannelBreakdown.module.css'

/**
 * スカウト経由の応募を SMS / メールに分けて出す。
 *
 * **ファネル本体（送信→閲覧→応募）とは出典が違う。** こちらはプロダクトDB の
 * utm.medium_last で判定していて、GA4 のラベルでは分からない情報。
 * 本体の 1:1 スカウトと B-Dash の一斉配信は規模が 2 桁違うので必ず分けて出す。
 */

const SYSTEM_LABEL = {
    direct: '本体の1:1スカウト',
    bulk: '一斉配信（B-Dash）',
} as const

const SYSTEM_NOTE = {
    direct: '企業が求職者を指名して送るもの。scout_id が付く',
    bulk: 'CRM の一斉配信。utm の source が scout / crm_scout',
} as const

const CHANNEL_LABEL = { sms: 'SMS', mail: 'メール', unknown: '判別できず' } as const
const CHANNEL_COLOR = { sms: CHART_COLORS.violet, mail: CHART_COLORS.blue, unknown: CHART_COLORS.amber }

const n = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString())
const pct3 = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(3)}%`)

export interface ScoutChannelBreakdownProps {
    channels: ScoutChannelRow[]
}

export default function ScoutChannelBreakdown({ channels }: ScoutChannelBreakdownProps) {
    if (channels.length === 0) {
        return (
            <div className={ui.card}>
                <h2 className={ui.sectionTitle}>応募のチャネル内訳（SMS / メール）</h2>
                <p className={ui.sectionNote}>この期間にスカウト経由の応募はありません。</p>
            </div>
        )
    }

    const systems = (['direct', 'bulk'] as const).filter((s) => channels.some((c) => c.system === s))
    const total = channels.reduce((a, c) => a + c.applied, 0)

    return (
        <div className={ui.card}>
            <h2 className={ui.sectionTitle}>応募のチャネル内訳（SMS / メール）</h2>
            <p className={ui.sectionNote}>
                出典は<strong>プロダクトDB</strong>（utm の medium_last）で、上のファネル（GA4 のクリック基準）とは数え方が違います。
                スカウトは<strong>本体の 1:1 と一斉配信の 2 系統</strong>あり規模が 2 桁違うので分けています。
                一斉配信の送信数は B-Dash 側にしか無いため、率は <Link href="/delivery-report">配信レポート</Link> で見てください。
            </p>

            <div className={styles.grid}>
                {systems.map((sys) => {
                    const rows = channels.filter((c) => c.system === sys).sort((a, b) => b.applied - a.applied)
                    const sysTotal = rows.reduce((a, c) => a + c.applied, 0)
                    return (
                        <div key={sys} className={styles.block}>
                            <div className={styles.blockHead}>
                                <h3 className={styles.blockTitle}>{SYSTEM_LABEL[sys]}</h3>
                                <span className={styles.blockTotal}>応募 {n(sysTotal)} 件</span>
                            </div>
                            <p className={styles.blockNote}>{SYSTEM_NOTE[sys]}</p>
                            <div className={ui.tableWrap}>
                                <table className={ui.dataTable}>
                                    <thead>
                                        <tr>
                                            <th>チャネル</th>
                                            <th className={ui.num}>送信</th>
                                            <th className={ui.num}>応募</th>
                                            <th className={ui.num}>応募率</th>
                                            <th className={ui.num}>構成比</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((c) => (
                                            <tr key={c.channel}>
                                                <td>
                                                    <i className={styles.swatch} style={{ backgroundColor: CHANNEL_COLOR[c.channel] } as CSSProperties} aria-hidden />
                                                    {CHANNEL_LABEL[c.channel]}
                                                </td>
                                                <td className={ui.num}>{n(c.sent)}</td>
                                                <td className={cx(ui.num, ui.strong)}>{n(c.applied)}</td>
                                                <td className={ui.num}>{pct3(c.applyRate)}</td>
                                                <td className={ui.num}>{sysTotal > 0 ? `${Math.round((c.applied / sysTotal) * 100)}%` : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )
                })}
            </div>

            <p className={ui.tableNote}>
                スカウト経由の応募は期間合計 <strong>{n(total)}</strong> 件。
                チャネルは応募時の utm（medium_last）で判定しており、<strong>SMS とメールの両方を受け取った人は最後に踏んだ方に付きます</strong>。
                本体のスカウトメール（scout_mail）は 2026-10-06 に始まったばかりなので、メール側の数字はまだ母数が小さい点に注意してください。
            </p>
        </div>
    )
}
