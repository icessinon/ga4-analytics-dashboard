'use client'

import { useState } from 'react'
import PageShell from '@/components/PageShell'
import PeriodSelect from '@/components/PeriodSelect'
import { ui, cx } from '@/components/ui'
import { usePeriodRange } from '@/hooks/usePeriodRange'
import { useReport } from '@/hooks/useReport'
import { type PeriodOption } from '@/lib/utils/period'
import type { SeoReportResponse } from '@/lib/services/seo/seoReportTypes'
import styles from './SeoReportPage.module.css'

const PERIOD_OPTIONS: PeriodOption[] = [
    { value: '28daysAgo', label: '過去28日' },
    { value: '56daysAgo', label: '過去8週' },
    { value: '90daysAgo', label: '過去90日' },
]

function diffPct(now: number, prev: number): string {
    if (prev <= 0) return '－'
    const d = ((now - prev) / prev) * 100
    return `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`
}

function posDiff(now: number | null, prev: number | null): string {
    if (now == null || prev == null) return '－'
    const d = now - prev
    // 順位は小さいほど良い
    return `${d <= 0 ? '' : '+'}${d.toFixed(1)}`
}

export default function SeoReportPage() {
    const periodState = usePeriodRange('28daysAgo')
    const { range } = periodState
    const [pathInput, setPathInput] = useState('')
    const [pathFilter, setPathFilter] = useState('')

    // Search Console 固定（propertyId 不要）。期間・パスフィルタを変えると即再取得
    const report = useReport<SeoReportResponse>('/api/seo-report', {
        body: { startDate: range?.startDate, endDate: range?.endDate, pathFilter },
        enabled: !!range,
    })
    const data = report.data
    const maxClicks = data ? Math.max(1, ...data.daily.map((d) => d.clicks)) : 1

    return (
        <PageShell
            pageId="seoReport"
            status={{ loading: report.loading, error: report.error, source: 'gsc', onRetry: report.run }}
            controls={
                <>
                    <PeriodSelect state={periodState} options={PERIOD_OPTIONS} resolved={data?.range ?? null} />
                    <input
                        type="text"
                        className={styles.pathInput}
                        value={pathInput}
                        onChange={(e) => setPathInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) setPathFilter(pathInput) }}
                        placeholder="パスで絞り込み（正規表現可）: /(driver)/media_.* など"
                        aria-label="パスフィルタ"
                    />
                    <button type="button" className={ui.btn} onClick={() => setPathFilter(pathInput)}>適用</button>
                    {pathFilter && <button type="button" className={ui.btnGhost} onClick={() => { setPathInput(''); setPathFilter('') }}>解除</button>}
                    {data && (
                        <span className={ui.note}>
                            （前期間比較・GSCは2〜3日遅れ）
                            {data.pathFilter && <strong>／ フィルタ適用中: {data.pathFilter}</strong>}
                        </span>
                    )}
                </>
            }
        >
            {data && (
                <>
                    <div className={ui.summaryRow}>
                        <div className={ui.summaryCard}>
                            <span className={ui.summaryLabel}>クリック</span>
                            <span className={ui.summaryValue}>{data.total.clicks.toLocaleString()}</span>
                            <span className={ui.summaryHint}>前期間比 {diffPct(data.total.clicks, data.total.prevClicks)}</span>
                        </div>
                        <div className={ui.summaryCard}>
                            <span className={ui.summaryLabel}>表示回数</span>
                            <span className={ui.summaryValue}>{data.total.impressions.toLocaleString()}</span>
                            <span className={ui.summaryHint}>前期間比 {diffPct(data.total.impressions, data.total.prevImpressions)}</span>
                        </div>
                        <div className={ui.summaryCard}>
                            <span className={ui.summaryLabel}>CTR</span>
                            <span className={ui.summaryValue}>{data.total.ctr != null ? `${(data.total.ctr * 100).toFixed(1)}%` : '－'}</span>
                            <span className={ui.summaryHint}>クリック ÷ 表示回数</span>
                        </div>
                        <div className={ui.summaryCard}>
                            <span className={ui.summaryLabel}>平均掲載順位</span>
                            <span className={ui.summaryValue}>{data.total.position != null ? data.total.position.toFixed(1) : '－'}</span>
                            <span className={ui.summaryHint}>前期間比 {posDiff(data.total.position, data.total.prevPosition)}（マイナスが改善）</span>
                        </div>
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>ページカテゴリ別（前期間比つき）</h2>
                        <div className={ui.tableWrap}>
                            <table className={ui.dataTable}>
                                <thead>
                                    <tr>
                                        <th>カテゴリ</th>
                                        <th className={ui.num}>クリック</th>
                                        <th className={ui.num}>前期間比</th>
                                        <th className={ui.num}>表示回数</th>
                                        <th className={ui.num}>前期間比</th>
                                        <th className={ui.num}>CTR</th>
                                        <th className={ui.num}>平均順位</th>
                                        <th className={ui.num}>順位変化</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.categories.map((c) => (
                                        <tr key={c.key}>
                                            <td>{c.label}</td>
                                            <td className={cx(ui.num, ui.strong)}>{c.clicks.toLocaleString()}</td>
                                            <td className={ui.num}>{diffPct(c.clicks, c.prevClicks)}</td>
                                            <td className={ui.num}>{c.impressions.toLocaleString()}</td>
                                            <td className={ui.num}>{diffPct(c.impressions, c.prevImpressions)}</td>
                                            <td className={ui.num}>{c.ctr != null ? `${(c.ctr * 100).toFixed(1)}%` : '－'}</td>
                                            <td className={ui.num}>{c.position != null ? c.position.toFixed(1) : '－'}</td>
                                            <td className={ui.num}>{posDiff(c.position, c.prevPosition)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className={ui.tableNote}>
                            ※ 順位変化はマイナスが改善（例: -0.5 = 平均0.5位上昇）。<br />
                            ※ 施策のSEO影響判定: 施策を当てたカテゴリだけが悪化し、他カテゴリが横ばいなら施策影響の疑い。全カテゴリ一斉に動いたらアルゴリズム更新・季節要因。<br />
                            ※ SEOの反映はクロール→再評価で2〜6週間かかるため、リリース直後の数日で判断しないこと。
                        </p>
                    </div>

                    {data.searchAppearance.length > 0 && (
                        <div className={ui.card}>
                            <h2 className={ui.sectionTitle}>検索タイプ別（しごと検索枠のトレンド）</h2>
                            <div className={ui.tableWrap}>
                                <table className={ui.dataTable}>
                                    <thead>
                                        <tr>
                                            <th>タイプ</th>
                                            <th className={ui.num}>クリック</th>
                                            <th className={ui.num}>前期間比</th>
                                            <th className={ui.num}>表示回数</th>
                                            <th className={ui.num}>前期間比</th>
                                            <th className={ui.num}>全体クリックに占める割合</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.searchAppearance.map((a) => (
                                            <tr key={a.type}>
                                                <td>{a.label}</td>
                                                <td className={cx(ui.num, ui.strong)}>{a.clicks.toLocaleString()}</td>
                                                <td className={ui.num}>{diffPct(a.clicks, a.prevClicks)}</td>
                                                <td className={ui.num}>{a.impressions.toLocaleString()}</td>
                                                <td className={ui.num}>{diffPct(a.impressions, a.prevImpressions)}</td>
                                                <td className={ui.num}>{data.total.clicks > 0 ? `${((a.clicks / data.total.clicks) * 100).toFixed(1)}%` : '－'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className={ui.tableNote}>
                                ※ JOB_LISTING/JOB_DETAILS = Googleしごと検索の求人リッチリザルト（JobPosting構造化データ依存）。
                                この枠がクリックの約3割を占めるため、急減時は構造化データのエラー・ポリシー違反を疑うこと。パスフィルタは適用されません（GSC API仕様）。
                            </p>
                        </div>
                    )}

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>上位ページ（URL別・前期間比つき）</h2>
                        <div className={ui.tableWrap}>
                            <table className={ui.dataTable}>
                                <thead>
                                    <tr>
                                        <th>パス</th>
                                        <th className={ui.num}>クリック</th>
                                        <th className={ui.num}>前期間</th>
                                        <th className={ui.num}>変化</th>
                                        <th className={ui.num}>表示回数</th>
                                        <th className={ui.num}>平均順位</th>
                                        <th className={ui.num}>順位変化</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.topPages.map((p) => (
                                        <tr key={p.path}>
                                            <td className={styles.pathCell} title={p.path}>{p.path}</td>
                                            <td className={cx(ui.num, ui.strong)}>{p.clicks.toLocaleString()}</td>
                                            <td className={ui.num}>{p.prevClicks.toLocaleString()}</td>
                                            <td className={ui.num}>{diffPct(p.clicks, p.prevClicks)}</td>
                                            <td className={ui.num}>{p.impressions.toLocaleString()}</td>
                                            <td className={ui.num}>{p.position != null ? p.position.toFixed(1) : '－'}</td>
                                            <td className={ui.num}>{posDiff(p.position, p.prevPosition)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className={ui.tableNote}>
                            ※ 当期クリック上位20URL。パスフィルタを使うと特定の施策対象URL群（例: ABテスト対象の職種詳細だけ）に絞って
                            サマリー・日別・クエリ・この表すべてが再集計されます。
                        </p>
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>日別推移（クリック / 平均順位・新しい順）</h2>
                        <div className={ui.tableWrap}>
                            <table className={ui.dataTable}>
                                <thead>
                                    <tr>
                                        <th>日付</th>
                                        <th className={ui.num}>クリック</th>
                                        <th style={{ width: '40%' }}></th>
                                        <th className={ui.num}>表示回数</th>
                                        <th className={ui.num}>平均順位</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...data.daily].reverse().map((d) => (
                                        <tr key={d.date}>
                                            <td>{d.date}</td>
                                            <td className={ui.num}>{d.clicks.toLocaleString()}</td>
                                            <td><span className={styles.bar} style={{ width: `${(d.clicks / maxClicks) * 100}%` }} /></td>
                                            <td className={ui.num}>{d.impressions.toLocaleString()}</td>
                                            <td className={ui.num}>{d.position != null ? d.position.toFixed(1) : '－'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>上位検索クエリ</h2>
                        <div className={ui.tableWrap}>
                            <table className={ui.dataTable}>
                                <thead>
                                    <tr>
                                        <th>クエリ</th>
                                        <th className={ui.num}>クリック</th>
                                        <th className={ui.num}>表示回数</th>
                                        <th className={ui.num}>平均順位</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.topQueries.map((q) => (
                                        <tr key={q.query}>
                                            <td>{q.query}</td>
                                            <td className={cx(ui.num, ui.strong)}>{q.clicks.toLocaleString()}</td>
                                            <td className={ui.num}>{q.impressions.toLocaleString()}</td>
                                            <td className={ui.num}>{q.position != null ? q.position.toFixed(1) : '－'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </PageShell>
    )
}
