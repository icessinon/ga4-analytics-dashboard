'use client'

import styles from './ScoutFunnel.module.css'

interface Summary {
    requested: number
    sent: number
    viewedUsers: number
    viewedSessions?: number
    viewedScoutIds: number
    formReachedUsers?: number
    appliedUsers: number
}

function pct(num: number, den: number): string {
    return den > 0 ? `${((num / den) * 100).toFixed(1)}%` : '－'
}

// バー幅（直前段からの通過率）。上限100%でクランプ。
function barWidth(num: number, den: number): string {
    if (den <= 0) return '0%'
    return `${Math.min(100, (num / den) * 100)}%`
}

export default function ScoutFunnelStages({ summary }: { summary: Summary }) {
    const { requested, sent, viewedUsers, viewedSessions, formReachedUsers, appliedUsers } = summary
    const form = formReachedUsers ?? 0

    return (
        <div className={styles.funnel}>
            {/* ① 送信リクエスト */}
            <div className={styles.stage}>
                <div className={styles.label}>① 送信リクエスト</div>
                <div className={styles.figure}><span className={styles.n}>{requested.toLocaleString()}</span></div>
                <div className={styles.desc}>ScoutHistories の期間内 attempt 数</div>
                <div className={styles.bar}><i style={{ width: '100%' }} /></div>
            </div>

            <div className={`${styles.step} ${styles.good}`}>
                <span className={styles.arrow}>↓</span>送達率 <span className={styles.pct}>{pct(sent, requested)}</span>
            </div>

            {/* ② 送達 */}
            <div className={styles.stage}>
                <div className={styles.label}>② SMS送達</div>
                <div className={styles.figure}><span className={styles.n}>{sent.toLocaleString()}</span><span className={styles.u}>通</span></div>
                <div className={styles.desc}>事業者の受付ベース。実着信は未計測</div>
                <div className={styles.bar}><i style={{ width: barWidth(sent, requested) }} /></div>
            </div>

            <div className={`${styles.step} ${styles.drop}`}>
                <span className={styles.arrow}>↓</span>クリック率 <span className={styles.pct}>{pct(viewedUsers, sent)}</span>
                <span>← 崖①（最大の漏れ）</span>
            </div>

            {/* ③ LP到達＝クリック */}
            <div className={`${styles.stage} ${styles.cliff}`}>
                <div className={styles.label}>③ LP到達<span className={styles.eq}>= SMSリンククリック</span></div>
                <div className={styles.figure}>
                    <span className={`${styles.n} ${styles.critn}`}>{viewedUsers.toLocaleString()}</span><span className={styles.u}>人</span>
                    {typeof viewedSessions === 'number' && <span className={styles.u}> / {viewedSessions.toLocaleString()}セッション</span>}
                </div>
                <div className={styles.desc}>スカウトページ表示（流入の大半が sms・モバイル）</div>
                <div className={styles.bar}><i className={styles.critbar} style={{ width: barWidth(viewedUsers, sent) }} /></div>
            </div>

            <div className={`${styles.step} ${styles.drop}`}>
                <span className={styles.arrow}>↓</span>フォーム到達率 <span className={styles.pct}>{pct(form, viewedUsers)}</span>
                <span>← 崖②</span>
            </div>

            {/* ④ 応募フォーム到達 */}
            <div className={`${styles.stage} ${styles.cliff}`}>
                <div className={styles.label}>④ 応募フォーム到達</div>
                <div className={styles.figure}><span className={`${styles.n} ${styles.critn}`}>{form.toLocaleString()}</span><span className={styles.u}>人</span></div>
                <div className={styles.desc}>CTA を押して /entry/ フォームを表示（scoutId付き）</div>
                <div className={styles.bar}><i className={styles.critbar} style={{ width: barWidth(form, viewedUsers) }} /></div>
            </div>

            <div className={`${styles.step} ${styles.warn}`}>
                <span className={styles.arrow}>↓</span>応募完了率 <span className={styles.pct}>{pct(appliedUsers, form)}</span>
            </div>

            {/* ⑤ 応募完了 */}
            <div className={styles.stage}>
                <div className={styles.label}>⑤ 応募完了</div>
                <div className={styles.figure}><span className={styles.n}>{appliedUsers.toLocaleString()}</span><span className={styles.u}>人</span></div>
                <div className={styles.desc}>フォームの送信ボタンクリック（EF__*__Btn__）</div>
                <div className={styles.bar}><i className={styles.warnbar} style={{ width: barWidth(appliedUsers, form) }} /></div>
            </div>
        </div>
    )
}
