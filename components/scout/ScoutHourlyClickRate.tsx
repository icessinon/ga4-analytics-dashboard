'use client'

import styles from './ScoutFunnel.module.css'

interface HourlyRow {
    hour: number
    sent: number
    viewed: number
    topCompanyName: string | null
}

export default function ScoutHourlyClickRate({ hourly }: { hourly: HourlyRow[] }) {
    const rows = hourly.filter((h) => h.sent > 0)
    if (rows.length === 0) return <p className={styles.hourNote}>この期間に送達がありません。</p>
    const maxSent = Math.max(1, ...rows.map((h) => h.sent))
    const maxCtr = Math.max(0.01, ...rows.map((h) => h.viewed / h.sent))

    return (
        <div>
            <p className={styles.hourNote}>
                送信時刻（JST）別の送信数とクリック率（＝スカウトページ閲覧率）。
                クリック率はその時間に送った求人・対象と交絡するため、時間単独の効果ではない点に注意。深夜帯の送信は体験上避けるのが無難。
            </p>
            <div className={`${styles.hourRow} ${styles.head}`}>
                <span className={styles.hourTime}>時刻</span>
                <span>送信数</span>
                <span className={styles.hourCtr}>件</span>
                <span>クリック率</span>
                <span className={styles.hourCtr}>%</span>
            </div>
            {rows.map((h) => {
                const ctr = h.viewed / h.sent
                return (
                    <div key={h.hour} className={styles.hourRow}>
                        <span className={styles.hourTime}>{h.hour}時</span>
                        <span className={styles.hourTrack}>
                            <i className={styles.sentFill} style={{ width: `${(h.sent / maxSent) * 100}%` }} />
                        </span>
                        <span className={styles.hourCtr}>{h.sent.toLocaleString()}</span>
                        <span className={styles.hourTrack}>
                            <i className={styles.hourFill} style={{ width: `${(ctr / maxCtr) * 100}%` }} />
                        </span>
                        <span className={styles.hourCtr}>{(ctr * 100).toFixed(1)}%</span>
                    </div>
                )
            })}
        </div>
    )
}
