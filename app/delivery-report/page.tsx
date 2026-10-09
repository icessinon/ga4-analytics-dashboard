'use client'

import { useMemo, useState } from 'react'
import PageShell from '@/components/PageShell'
import FilterBar, { FilterField } from '@/components/FilterBar'
import Alert from '@/components/Alert'
import { ui, cx } from '@/components/ui'
import { useReport } from '@/hooks/useReport'
import {
    CHANNEL_HAS_OPEN, CHANNEL_LABEL, INTERNAL_MAIL_DOMAIN, SCOPE_HINT, SCOPE_LABEL,
    SOURCE_FILTER_LABEL, SOURCE_LABEL,
    type DeliveryScope, type SourceFilter,
} from '@/lib/constants/delivery'
import type { CampaignRow, DeliveryReportResponse, SubjectRow } from '@/lib/services/delivery/deliveryReportTypes'
import styles from './DeliveryReportPage.module.css'

const PERIODS = [
    { value: 7, label: '過去7日' },
    { value: 14, label: '過去14日' },
    { value: 30, label: '過去30日' },
    { value: 90, label: '過去90日' },
]

type Tab = 'channel' | 'campaign' | 'subject' | 'ga4'
const TABS: { id: Tab; label: string }[] = [
    { id: 'channel', label: 'チャネル比較' },
    { id: 'campaign', label: '施策別' },
    { id: 'subject', label: '件名別' },
    { id: 'ga4', label: 'GA4 着地' },
]

type CampaignSort = 'tried' | 'openRate' | 'clickRate'

const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(2)}%`)
const n = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString())
const gb = (bytes: number) => (bytes / 1024 ** 3).toFixed(2)
/** BigQuery オンデマンドの概算（$6.25/TiB・$1=155円）。桁感が分かれば十分なので丸めて出す */
const yen = (bytes: number) => Math.max(0.01, (bytes / 1024 ** 4) * 6.25 * 155).toFixed(2)

export default function DeliveryReportPage() {
    const [days, setDays] = useState(30)
    const [scope, setScope] = useState<DeliveryScope>('xwork')
    const [tab, setTab] = useState<Tab>('channel')
    const [campaignSort, setCampaignSort] = useState<CampaignSort>('tried')
    // 本体通知基盤は 1 日十数通〜百数十通の規模なので、既定で足切りすると B-Dash しか出てこない
    const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
    const [minSent, setMinSent] = useState(0)
    // 社内ドメイン宛だけの配信（動作確認・テスト）は既定で外す
    const [excludeInternal, setExcludeInternal] = useState(true)

    // 1 回 1〜2GB スキャンするので自動取得にしない（FilterBar の実行ボタンで取りに行く）
    const report = useReport<DeliveryReportResponse>('/api/delivery-report', {
        body: { days, scope, excludeInternal },
        manual: true,
        keepPreviousData: true,
    })
    const data = report.data

    const campaigns = useMemo(() => {
        if (!data) return []
        const rows = data.campaigns.filter(
            (c) => c.tried >= minSent && (sourceFilter === 'all' || c.source === sourceFilter),
        )
        const by = (c: CampaignRow) => (campaignSort === 'tried' ? c.tried : (c[campaignSort] ?? -1))
        return [...rows].sort((a, b) => by(b) - by(a))
    }, [data, campaignSort, minSent, sourceFilter])

    const subjects = useMemo(() => {
        if (!data) return []
        return data.subjects.filter(
            (s) => s.messages >= minSent && (sourceFilter === 'all' || s.source === sourceFilter),
        )
    }, [data, minSent, sourceFilter])

    const sortHead = (key: CampaignSort, label: string) => (
        <th className={cx(ui.num, styles.sortable)} onClick={() => setCampaignSort(key)}>
            {label}{campaignSort === key && <span className={styles.sortArrow}>▼</span>}
        </th>
    )

    return (
        <PageShell
            pageId="deliveryReport"
            status={{ loading: report.loading, error: report.error, source: 'bq', loadingText: 'B-Dash・通知基盤・SES・GA4 を集計しています...', onRetry: report.run }}
            keepChildrenWhileLoading
            controls={
                <FilterBar onSubmit={report.run} submitting={report.loading} submitLabel="集計する">
                    <FilterField label="期間" hint={data ? `${data.startDate} 〜 ${data.endDate}` : undefined}>
                        <select className={ui.select} value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="期間">
                            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                    </FilterField>
                    <FilterField label="B-Dash の絞り込み" hint={SCOPE_HINT[scope]}>
                        <select className={ui.select} value={scope} onChange={(e) => setScope(e.target.value as DeliveryScope)} aria-label="対象">
                            {(Object.keys(SCOPE_LABEL) as DeliveryScope[]).map((s) => <option key={s} value={s}>{SCOPE_LABEL[s]}</option>)}
                        </select>
                    </FilterField>
                    <FilterField label="テスト配信" hint={`宛先が ${INTERNAL_MAIL_DOMAIN} だけのもの`}>
                        <select
                            className={ui.select}
                            value={excludeInternal ? 'exclude' : 'include'}
                            onChange={(e) => setExcludeInternal(e.target.value === 'exclude')}
                            aria-label="テスト配信"
                        >
                            <option value="exclude">除外する</option>
                            <option value="include">含める</option>
                        </select>
                    </FilterField>
                    <FilterField label="出典" hint="施策別・件名別の表を絞る">
                        <select className={ui.select} value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as SourceFilter)} aria-label="出典">
                            {(Object.keys(SOURCE_FILTER_LABEL) as SourceFilter[])
                                .filter((s) => s !== 'line_unit')
                                .map((s) => <option key={s} value={s}>{SOURCE_FILTER_LABEL[s]}</option>)}
                        </select>
                    </FilterField>
                    <FilterField label="最小送信数" hint="これ未満は隠す">
                        <select className={ui.select} value={minSent} onChange={(e) => setMinSent(Number(e.target.value))} aria-label="最小送信数">
                            {[0, 100, 1000, 10000].map((v) => <option key={v} value={v}>{v === 0 ? '絞らない' : v.toLocaleString()}</option>)}
                        </select>
                    </FilterField>
                </FilterBar>
            }
        >
            {!data && !report.loading && (
                <Alert tone="info">
                    出典は毎回 4 つすべて読みます（B-Dash 一斉配信 ／ 本体通知基盤 @xwork/messaging ／ SES のメールイベント ／ GA4 の着地）。
                    「B-Dash の絞り込み」は<strong>出典の切り替えではなく</strong>、B-Dash の中をクロスワークの配信だけにするかどうかの指定です。
                    1 回の集計で BigQuery を 1〜2GB スキャンします（数円）。期間を決めて「集計する」を押してください。
                </Alert>
            )}

            {data && (
                <>
                    {data.clamped && (
                        <Alert tone="warn">
                            B-Dash の配信ログは <strong>2026-09-14 以降</strong>しか日次で入っていないため、期間を {data.startDate} から集計しました。
                            それ以前は全量バックフィルの partition（1 回 15〜17GB）にしか無く、安全に引けません。
                        </Alert>
                    )}

                    {data.excludeInternal && (data.excludedInternal.sesMessages > 0 || data.excludedInternal.bdashMail > 0) && (
                        <Alert tone="info">
                            宛先が <strong>{INTERNAL_MAIL_DOMAIN}</strong> だけの配信を
                            {data.excludedInternal.sesMessages > 0 && <>本体メール <strong>{n(data.excludedInternal.sesMessages)}</strong> 通</>}
                            {data.excludedInternal.sesMessages > 0 && data.excludedInternal.bdashMail > 0 && <>・</>}
                            {data.excludedInternal.bdashMail > 0 && <>B-Dash <strong>{n(data.excludedInternal.bdashMail)}</strong> 通</>}
                            {' '}除外しました（法人アカウントの動作確認など）。
                            <strong>CC に社員が入るだけの業務メールは残しています</strong>（「求職者のご紹介」など、外部宛を含むもの）。
                        </Alert>
                    )}

                    <Alert tone="info">
                        <strong>開封率でチャネルを比べないでください。</strong>開封イベントがあるのはメールだけで、SMS と LINE には原理的に存在しません。
                        チャネル比較は<strong>クリック率と GA4 着地</strong>で行い、開封率はメール内の施策比較にだけ使ってください。
                    </Alert>

                    <ul className={ui.tabs}>
                        {TABS.map((t) => (
                            <li key={t.id}>
                                <button type="button" className={cx(ui.tab, tab === t.id && ui.tabActive)} onClick={() => setTab(t.id)}>
                                    {t.label}
                                </button>
                            </li>
                        ))}
                    </ul>

                    {tab === 'channel' && (
                        <div className={ui.card}>
                            <h2 className={ui.sectionTitle}>チャネル別</h2>
                            <div className={styles.channelGrid}>
                                {data.channels.map((c) => (
                                    <div key={c.channel} className={styles.channelCard}>
                                        <div className={styles.channelName}>
                                            <span>{CHANNEL_LABEL[c.channel]}</span>
                                            <span className={styles.channelTag}>{CHANNEL_HAS_OPEN[c.channel] ? '開封計測あり' : '開封計測なし'}</span>
                                        </div>
                                        <div className={styles.metric}>
                                            <span className={styles.metricLabel}>送信</span>
                                            <span className={cx(styles.metricValue, styles.metricStrong)}>{n(c.tried)}</span>
                                        </div>
                                        <div className={styles.metric}>
                                            <span className={styles.metricLabel}>送達</span>
                                            <span className={styles.metricValue}>{n(c.delivered)}</span>
                                        </div>
                                        <div className={styles.metric}>
                                            <span className={styles.metricLabel}>開封率</span>
                                            <span className={styles.metricValue}>
                                                {CHANNEL_HAS_OPEN[c.channel] ? pct(c.openRate) : <span className={styles.noMeasure}>計測不可</span>}
                                            </span>
                                        </div>
                                        <div className={styles.metric}>
                                            <span className={styles.metricLabel}>クリック率</span>
                                            <span className={cx(styles.metricValue, styles.metricStrong)}>{pct(c.clickRate)}</span>
                                        </div>
                                        <div className={styles.metric}>
                                            <span className={styles.metricLabel}>GA4 着地セッション</span>
                                            <span className={styles.metricValue}>{n(c.ga4Sessions)}</span>
                                        </div>
                                        <div className={styles.metric}>
                                            <span className={styles.metricLabel}>送信先の実人数</span>
                                            <span className={styles.metricValue}>{n(c.people)}</span>
                                        </div>
                                        {c.people != null && c.people > 0 && (
                                            <div className={styles.metric}>
                                                <span className={styles.metricLabel}>1 人あたり</span>
                                                <span className={styles.metricValue}>{(c.tried / c.people).toFixed(1)} 通</span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <p className={ui.tableNote}>
                                送達の定義はチャネルで違います。メールは SES の Delivery（B-Dash 分は「送信 − 失敗」で代用）、SMS は事業者が受け付けた時点（端末到達ではない）、LINE は配信成功です。
                                <strong>GA4 着地だけが 3 チャネル共通の指標</strong>なので、効果の比較はそこを軸にしてください。
                                SMS の短縮 URL リダイレクト数は bot やプリフェッチを含み実クリックの 3 倍前後に出るため、クリックには含めていません。
                            </p>

                            {data.lineUnits.length > 0 && (
                                <>
                                    <h2 className={ui.sectionTitle}>LINE おすすめ求人配信（ユニット別）</h2>
                                    <div className={ui.tableWrap}>
                                        <table className={ui.dataTable}>
                                            <thead>
                                                <tr>
                                                    <th>ユニット</th>
                                                    <th className={ui.num}>配信回数</th>
                                                    <th className={ui.num}>連携済み</th>
                                                    <th className={ui.num}>配信対象</th>
                                                    <th className={ui.num}>配信成功</th>
                                                    <th className={ui.num}>失敗</th>
                                                    <th className={ui.num}>受け取り拒否</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {data.lineUnits.map((u) => (
                                                    <tr key={u.unit}>
                                                        <td>{u.unit}</td>
                                                        <td className={ui.num}>{n(u.deliveries)}</td>
                                                        <td className={ui.num}>{n(u.linkedUsers)}</td>
                                                        <td className={ui.num}>{n(u.jobsAvailableUsers)}</td>
                                                        <td className={cx(ui.num, ui.strong)}>{n(u.successUsers)}</td>
                                                        <td className={ui.num}>{n(u.errorUsers)}</td>
                                                        <td className={ui.num}>{n(u.notToReceiveUsers)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <p className={ui.tableNote}>
                                        LINE は通知基盤（@xwork/messaging）とは別経路のおすすめ求人配信です。開封・クリックの計測はありません。
                                        スカウト LINE が通知基盤に乗ったら「施策別」タブに topic として自動で並びます。
                                    </p>
                                </>
                            )}
                        </div>
                    )}

                    {tab === 'campaign' && (
                        <div className={ui.card}>
                            <h2 className={ui.sectionTitle}>施策別（{campaigns.length} 件 / 出典: {SOURCE_FILTER_LABEL[sourceFilter]}）</h2>
                            <div className={ui.tableWrap}>
                                <table className={ui.dataTable}>
                                    <thead>
                                        <tr>
                                            <th>施策</th>
                                            <th>チャネル</th>
                                            <th>出典</th>
                                            {sortHead('tried', '送信')}
                                            <th className={ui.num}>人数</th>
                                            <th className={ui.num}>通/人</th>
                                            {sortHead('openRate', '開封率')}
                                            {sortHead('clickRate', 'クリック率')}
                                            <th className={ui.num}>クリック/開封</th>
                                            <th className={ui.num}>配信停止</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {campaigns.map((c) => (
                                            <tr key={`${c.source}-${c.channel}-${c.name}`}>
                                                <td><span className={styles.subjectCell}>{c.name}</span></td>
                                                <td>{CHANNEL_LABEL[c.channel]}</td>
                                                <td><span className={styles.sourceTag}>{SOURCE_LABEL[c.source]}</span></td>
                                                <td className={cx(ui.num, ui.strong)}>{n(c.tried)}</td>
                                                <td className={ui.num}>{n(c.people)}</td>
                                                <td className={ui.num}>{c.people ? (c.tried / c.people).toFixed(1) : '—'}</td>
                                                <td className={cx(ui.num, c.openRate != null && c.openRate < 0.05 && styles.lowOpen)}>
                                                    {CHANNEL_HAS_OPEN[c.channel] ? pct(c.openRate) : <span className={styles.noMeasure}>—</span>}
                                                </td>
                                                <td className={cx(ui.num, ui.strong)}>{pct(c.clickRate)}</td>
                                                <td className={ui.num}>{pct(c.ctorRate)}</td>
                                                <td className={ui.num}>{c.unsubscribed > 0 ? n(c.unsubscribed) : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className={ui.tableNote}>
                                見出しの「送信」「開封率」「クリック率」をクリックすると並べ替えます。
                                <strong>開封率が 5% を下回る施策は赤</strong>で出ます。配信失敗が少ないのに開封が立たない施策は、届いているのに開かれていない＝リストが死んでいる疑いがあります。
                                セグメントを「開封実績者」で切ると開封率は上がりますが、クリックは上がりません。比較は必ずクリック率で行ってください。
                            </p>
                        </div>
                    )}

                    {tab === 'subject' && (
                        <div className={ui.card}>
                            <h2 className={ui.sectionTitle}>件名別（{subjects.length} 件 / 出典: {SOURCE_FILTER_LABEL[sourceFilter]}）</h2>
                            <div className={ui.tableWrap}>
                                <table className={ui.dataTable}>
                                    <thead>
                                        <tr>
                                            <th>件名</th>
                                            <th>出典</th>
                                            <th className={ui.num}>メッセージ</th>
                                            <th className={ui.num}>送信</th>
                                            <th className={ui.num}>送達</th>
                                            <th className={ui.num}>開封</th>
                                            <th className={ui.num}>開封率</th>
                                            <th className={ui.num}>クリック</th>
                                            <th className={ui.num}>クリック率</th>
                                            <th className={ui.num}>クリック/開封</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {subjects.map((s: SubjectRow) => (
                                            <tr key={`${s.source}-${s.subject}`}>
                                                <td><span className={styles.subjectCell}>{s.subject}</span></td>
                                                <td><span className={styles.sourceTag}>{SOURCE_LABEL[s.source]}</span></td>
                                                <td className={cx(ui.num, ui.strong)}>{n(s.messages)}</td>
                                                <td className={ui.num}>{n(s.sent)}</td>
                                                <td className={ui.num}>{n(s.delivered)}</td>
                                                <td className={ui.num}>{n(s.opened)}</td>
                                                <td className={cx(ui.num, s.openRate != null && s.openRate < 0.05 && styles.lowOpen)}>{pct(s.openRate)}</td>
                                                <td className={ui.num}>{n(s.clicked)}</td>
                                                <td className={cx(ui.num, ui.strong)}>{pct(s.clickRate)}</td>
                                                <td className={ui.num}>{pct(s.ctorRate)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className={ui.tableNote}>
                                件名は<strong>メールだけ</strong>の軸です（SMS・LINE に件名はありません）。企業名・氏名・都道府県を差し込む件名は 1 行にまとめています。
                                率の分母は「メッセージ」（期間内に 1 つ以上イベントが観測された通数）です。本体メールは種別によって SES の Send イベントが飛んでおらず Delivery だけ届くものがあり、
                                送信や送達を分母にすると開封率が 100% を超えてしまうためです。
                                開封率は画像の読み込みに依存するため、画像ブロック環境では低く、Apple のメールプライバシー保護では高く出ます。
                                <strong>件名の良し悪しは開封率、本文・オファーの良し悪しはクリック/開封</strong>で見てください。
                            </p>
                        </div>
                    )}

                    {tab === 'ga4' && (
                        <div className={ui.card}>
                            <h2 className={ui.sectionTitle}>GA4 着地（utm_medium = email / sms / line）</h2>
                            <div className={ui.tableWrap}>
                                <table className={ui.dataTable}>
                                    <thead>
                                        <tr>
                                            <th>utm_source</th>
                                            <th>utm_medium</th>
                                            <th>utm_campaign（数字を N に畳んだもの）</th>
                                            <th className={ui.num}>セッション</th>
                                            <th className={ui.num}>ユーザー</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.ga4.map((g) => (
                                            <tr key={`${g.source}-${g.medium}-${g.campaignGroup}`}>
                                                <td>{g.source}</td>
                                                <td>{g.medium}</td>
                                                <td><span className={styles.subjectCell}>{g.campaignGroup}</span></td>
                                                <td className={cx(ui.num, ui.strong)}>{n(g.sessions)}</td>
                                                <td className={ui.num}>{n(g.users)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className={ui.tableNote}>
                                セッション単位に畳んでから数えているので、行を足してもチャネル合計と一致します。
                                utm_campaign は生だと数万種あるため数字を N に置き換えて束ねています。
                                国＝日本・hostname＝x-work.jp の既定フィルタ適用済み。配信からの着地が 0 のチャネルは、UTM が付いていない導線を疑ってください。
                            </p>
                        </div>
                    )}

                    <p className={styles.scopeNote}>
                        出典: B-Dash 一斉配信（{SCOPE_LABEL[data.scope]}）＋ 本体通知基盤 ＋ SES ＋ GA4 /
                        テスト配信: {data.excludeInternal ? '除外' : '含む'} / 期間: {data.startDate} 〜 {data.endDate} /
                        BigQuery スキャン {gb(data.scannedBytes)}GB（約 {yen(data.scannedBytes)} 円） /
                        取得 {new Date(data.fetchedAt).toLocaleString('ja-JP')}
                    </p>
                </>
            )}
        </PageShell>
    )
}
