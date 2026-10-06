'use client'

import { useState } from 'react'
import PageShell from '@/components/PageShell'
import FilterBar, { FilterField } from '@/components/FilterBar'
import Alert from '@/components/Alert'
import { ui, cx } from '@/components/ui'
import { useReport } from '@/hooks/useReport'
import { STEP_MAIL_STATUS_LABEL } from '@/lib/constants/signupStepMails'
import type { SignupStepMailsResponse } from '@/lib/services/signupStepMails/signupStepMailsTypes'
import styles from './SignupStepMailsPage.module.css'

/** DeliveryRecords の reason をそのまま出すと読めないので日本語に寄せる */
const SKIP_REASON_LABELS: Record<string, string> = {
    unsubscribed: '配信停止',
    no_address: 'メールアドレス無し',
    not_linked: '未連携',
    dev_guard: '開発環境ガード',
}

const PERIODS = [
    { value: 7, label: '過去7日' },
    { value: 30, label: '過去30日' },
    { value: 90, label: '過去90日' },
    { value: 365, label: '過去1年' },
]

const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)

export default function SignupStepMailsPage() {
    const [days, setDays] = useState(30)
    const report = useReport<SignupStepMailsResponse>('/api/signup-step-mails', { body: { days }, keepPreviousData: true })
    const data = report.data

    const maxSent = data ? Math.max(1, ...data.steps.map((s) => s.sent)) : 1
    const dailyDesc = data ? [...data.daily].sort((a, b) => b.date.localeCompare(a.date)) : []

    return (
        <PageShell
            pageId="signupStepMails"
            status={{ loading: report.loading, error: report.error, source: 'db', loadingText: '送達記録と SES イベントを突合しています...', onRetry: report.run }}
            keepChildrenWhileLoading
            controls={
                <FilterBar>
                    <FilterField label="期間" hint={data ? `${data.since} 以降の送信分` : undefined}>
                        <select className={ui.select} value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="期間">
                            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                    </FilterField>
                </FilterBar>
            }
        >
            {data && (
                <>
                    <div className={ui.summaryRow}>
                        <div className={ui.summaryCard}>
                            <span className={ui.summaryLabel}>送信数</span>
                            <span className={ui.summaryValue}>{data.totals.sent.toLocaleString()}</span>
                            <span className={ui.summaryHint}>配信成功 {data.totals.delivered.toLocaleString()} / バウンス {data.totals.bounced.toLocaleString()}</span>
                        </div>
                        <div className={ui.summaryCard}>
                            <span className={ui.summaryLabel}>開封率</span>
                            <span className={ui.summaryValue}>{pct(data.totals.openRate)}</span>
                            <span className={ui.summaryHint}>開封 {data.totals.opened.toLocaleString()} 通 ÷ 配信成功</span>
                        </div>
                        <div className={ui.summaryCard}>
                            <span className={ui.summaryLabel}>クリック率</span>
                            <span className={ui.summaryValue}>{pct(data.totals.clickRate)}</span>
                            <span className={ui.summaryHint}>クリック {data.totals.clicked.toLocaleString()} 通 ÷ 配信成功</span>
                        </div>
                        <div className={ui.summaryCard}>
                            <span className={ui.summaryLabel}>配信中の会員</span>
                            <span className={ui.summaryValue}>{(data.schedules.byStatus.active ?? 0).toLocaleString()}</span>
                            <span className={ui.summaryHint}>スケジュール全 {data.schedules.total.toLocaleString()} 件</span>
                        </div>
                    </div>

                    {/* スキップは配信基盤の異常ではなく、配信停止・アドレス無しなど送るべきでなかった人。
                        送信失敗と混ぜないよう理由つきで別に出す */}
                    {data.totals.skipped > 0 && (
                        <Alert tone="info">
                            対象外として送らなかったメールが {data.totals.skipped.toLocaleString()} 通あります（
                            {Object.entries(data.skipReasons)
                                .sort((a, b) => b[1] - a[1])
                                .map(([reason, n]) => `${SKIP_REASON_LABELS[reason] ?? reason} ${n.toLocaleString()}`)
                                .join(' / ')}
                            ）。送信失敗ではないため、送信数・開封率の分母には含めていません。
                        </Alert>
                    )}

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>ステップ別の送信数・開封率</h2>
                        <div className={styles.legend}>
                            <span className={styles.legendItem}><i className={cx(styles.legendSwatch, styles.swatchSent)} />送信</span>
                            <span className={styles.legendItem}><i className={cx(styles.legendSwatch, styles.swatchOpened)} />開封</span>
                            <span className={styles.legendItem}><i className={cx(styles.legendSwatch, styles.swatchClicked)} />クリック</span>
                        </div>
                        <div className={styles.stepList}>
                            {data.steps.map((s) => (
                                <div key={s.key} className={cx(styles.stepRow, s.sent === 0 && styles.stepRowPending)}>
                                    <div>
                                        <div className={styles.stepName}>{s.label}</div>
                                        <div className={styles.stepIntent}>登録+{s.offsetDays}日 — {s.intent}</div>
                                    </div>
                                    <div className={styles.stepBarWrap}>
                                        <div className={styles.stepBarTrack}>
                                            <div className={styles.stepBarSent} style={{ width: `${(s.sent / maxSent) * 100}%` }} />
                                            <div className={styles.stepBarOpened} style={{ width: `${(s.opened / maxSent) * 100}%` }} />
                                            <div className={styles.stepBarClicked} style={{ width: `${(s.clicked / maxSent) * 100}%` }} />
                                        </div>
                                        <div className={styles.stepNums}>
                                            <span>送信 {s.sent.toLocaleString()}</span>
                                            <span>配信成功 {s.delivered.toLocaleString()}</span>
                                            <span>開封 {s.opened.toLocaleString()}</span>
                                            <span>クリック {s.clicked.toLocaleString()}</span>
                                            {s.bounced > 0 && <span>バウンス {s.bounced.toLocaleString()}</span>}
                                            {s.skipped > 0 && <span>対象外スキップ {s.skipped.toLocaleString()}</span>}
                                            {s.failed > 0 && <span>送信失敗 {s.failed.toLocaleString()}</span>}
                                        </div>
                                    </div>
                                    {s.sent > 0 ? (
                                        <div className={styles.stepRate}>
                                            <div className={styles.stepRateValue}>{pct(s.openRate)}</div>
                                            <div className={styles.stepRateLabel}>開封率／クリック率 {pct(s.clickRate)}</div>
                                        </div>
                                    ) : (
                                        <div className={styles.stepWaiting}>
                                            未送信<br />
                                            {s.pendingUsers > 0 ? `${s.pendingUsers.toLocaleString()}人が到達待ち` : '対象者なし'}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        <p className={ui.tableNote}>
                            開封率の分母は配信成功（Delivery）。同じメールで開封イベントが複数回発生するため、メール単位で重複を除いています。
                            <strong>SESの開封計測は画像の読み込みに依存する</strong>ので、画像をブロックする環境では開封が立たず実態より低く出ます。
                            逆にAppleのメールプライバシー保護は先読みで開封を立てるため高く出ます。率の絶対水準ではなく、ステップ間の差と時系列の変化で見てください。
                        </p>
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>配信スケジュールの状態</h2>
                        <div className={ui.tableWrap}>
                            <table className={ui.dataTable}>
                                <thead><tr><th>状態</th><th className={ui.num}>会員数</th><th>意味</th></tr></thead>
                                <tbody>
                                    {Object.entries(data.schedules.byStatus).sort((a, b) => b[1] - a[1]).map(([st, n]) => (
                                        <tr key={st}>
                                            <td>{st}</td>
                                            <td className={cx(ui.num, ui.strong)}>{n.toLocaleString()}</td>
                                            <td>{STEP_MAIL_STATUS_LABEL[st] ?? '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {data.schedules.firstRegisteredAt && (
                            <p className={ui.tableNote}>
                                最初の対象者の登録は {data.schedules.firstRegisteredAt.slice(0, 10)}。
                                各ステップは登録からの経過日数で発火するため、Day30まで揃うのは登録から30日後です。
                            </p>
                        )}
                    </div>

                    {dailyDesc.length > 0 && (
                        <div className={ui.card}>
                            <h2 className={ui.sectionTitle}>日別の送信・開封</h2>
                            <div className={ui.tableWrap}>
                                <table className={ui.dataTable}>
                                    <thead>
                                        <tr>
                                            <th>送信日</th>
                                            <th className={ui.num}>送信</th>
                                            <th className={ui.num}>配信成功</th>
                                            <th className={ui.num}>開封</th>
                                            <th className={ui.num}>開封率</th>
                                            <th className={ui.num}>クリック</th>
                                            <th className={ui.num}>バウンス</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dailyDesc.map((d) => {
                                            const isToday = d.date === data.todayJst
                                            const beforeCron = isToday && new Date().getHours() < data.cronHourJst
                                            return (
                                                <tr key={d.date} className={d.sent === 0 ? styles.zeroRow : undefined}>
                                                    <td>{d.date}{isToday && <span className={styles.todayTag}>今日</span>}</td>
                                                    <td className={cx(ui.num, ui.strong)}>{d.sent.toLocaleString()}</td>
                                                    <td className={ui.num}>{d.delivered.toLocaleString()}</td>
                                                    <td className={ui.num}>{d.opened.toLocaleString()}</td>
                                                    <td className={ui.num}>{pct(d.openRate)}</td>
                                                    <td className={ui.num}>{d.clicked.toLocaleString()}</td>
                                                    <td className={ui.num}>{d.bounced.toLocaleString()}</td>
                                                    <td className={styles.zeroNote}>
                                                        {d.sent > 0 ? '' : beforeCron ? `本日${data.cronHourJst}時の配信前` : '対象者なし'}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <p className={ui.tableNote}>
                                日次の配信は<strong>12:00 JSTに1回だけ</strong>動きます。送信0の日は障害ではなく、
                                その時点で送信条件（登録からの経過日数）を満たす会員がいなかった日です。
                                送信日は登録日の翌日以降にずれるため、<strong>日別の登録数とは直接対応しません</strong>
                                （例: 9/27の送信分は9/25昼〜9/26昼の登録者）。
                            </p>
                        </div>
                    )}

                    {data.unmatchedMessages > 0 && (
                        <Alert tone="info">
                            送達記録のうち {data.unmatchedMessages} 通がSESイベントと突合できていません。
                            SESイベントのBigQuery連携は数分〜数時間の遅延があるため、直近の送信分は開封が未反映のことがあります。
                        </Alert>
                    )}
                </>
            )}
        </PageShell>
    )
}
