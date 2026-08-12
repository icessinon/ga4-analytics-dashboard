'use client'

import { useCallback, useEffect, useState } from 'react'
import BackLink from '@/components/BackLink'
import RelatedPages from '@/components/RelatedPages/RelatedPages'
import { parseJsonResponse } from '@/lib/utils/fetch'
import styles from './SeoReportPage.module.css'

interface TotalStat {
    clicks: number
    impressions: number
    ctr: number | null
    position: number | null
    prevClicks: number
    prevImpressions: number
    prevPosition: number | null
}

interface CategoryStat extends TotalStat {
    key: string
    label: string
}

interface DailyRow { date: string; clicks: number; impressions: number; position: number | null }
interface QueryRow { query: string; clicks: number; impressions: number; position: number | null }
interface PageRow { path: string; clicks: number; impressions: number; position: number | null; prevClicks: number; prevPosition: number | null }

interface SeoReportResponse {
    range: { startDate: string; endDate: string }
    prevRange: { startDate: string; endDate: string }
    pathFilter: string | null
    topPages: PageRow[]
    total: TotalStat
    daily: DailyRow[]
    categories: CategoryStat[]
    topQueries: QueryRow[]
}

const PERIOD_OPTIONS = [
    { value: 28, label: '過去28日' },
    { value: 56, label: '過去8週' },
    { value: 90, label: '過去90日' },
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
    const [days, setDays] = useState(28)
    const [pathInput, setPathInput] = useState('')
    const [pathFilter, setPathFilter] = useState('')
    const [data, setData] = useState<SeoReportResponse | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/seo-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ days, pathFilter }),
            })
            const json = await parseJsonResponse<SeoReportResponse & { error?: string }>(res)
            if (!res.ok) throw new Error(json.error || '取得に失敗しました')
            setData(json)
        } catch (e) {
            setError(e instanceof Error ? e.message : '取得に失敗しました')
            setData(null)
        } finally {
            setLoading(false)
        }
    }, [days, pathFilter])

    useEffect(() => { load() }, [load])

    const maxClicks = data ? Math.max(1, ...data.daily.map((d) => d.clicks)) : 1

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>SEOモニタ（Search Console）</h1>
                    <p className={styles.subtitle}>
                        x-work.jp の掲載順位・表示回数・CTR・クリックをページカテゴリ別に常時監視します。
                        施策（モザイク・モーダル・FV変更等）のSEO影響は「対象カテゴリ vs 非対象カテゴリ」の前後比較で判定します。
                    </p>
                </div>
                <BackLink href="/">ダッシュボード</BackLink>
            </div>

            <RelatedPages pages={[{ href: '/cv-types', label: '求人種別CV分析' }, { href: '/cv-value', label: 'CV単価・お金まわり' }, { href: '/trend', label: 'トレンド' }]} />

            <div className={styles.controls}>
                <select className={styles.select} value={days} onChange={(e) => setDays(Number(e.target.value))}>
                    {PERIOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input
                    type="text"
                    className={styles.select}
                    style={{ minWidth: '20rem' }}
                    value={pathInput}
                    onChange={(e) => setPathInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setPathFilter(pathInput) }}
                    placeholder="パスで絞り込み（正規表現可）: /(driver)/media_.* など"
                    aria-label="パスフィルタ"
                />
                <button type="button" className={styles.select} onClick={() => setPathFilter(pathInput)}>適用</button>
                {pathFilter && <button type="button" className={styles.select} onClick={() => { setPathInput(''); setPathFilter('') }}>解除</button>}
                {data && (
                    <span className={styles.periodNote}>
                        集計期間: {data.range.startDate} 〜 {data.range.endDate}（前期間比較・GSCは2〜3日遅れ）
                        {data.pathFilter && <strong>／ フィルタ適用中: {data.pathFilter}</strong>}
                    </span>
                )}
            </div>

            {loading && <p className={styles.loading}>Search Consoleから取得中...</p>}
            {error && <div className={styles.error}>{error}</div>}

            {data && !loading && (
                <>
                    <div className={styles.summaryRow}>
                        <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>クリック</span>
                            <span className={styles.summaryValue}>{data.total.clicks.toLocaleString()}</span>
                            <span className={styles.summaryHint}>前期間比 {diffPct(data.total.clicks, data.total.prevClicks)}</span>
                        </div>
                        <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>表示回数</span>
                            <span className={styles.summaryValue}>{data.total.impressions.toLocaleString()}</span>
                            <span className={styles.summaryHint}>前期間比 {diffPct(data.total.impressions, data.total.prevImpressions)}</span>
                        </div>
                        <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>CTR</span>
                            <span className={styles.summaryValue}>{data.total.ctr != null ? `${(data.total.ctr * 100).toFixed(1)}%` : '－'}</span>
                            <span className={styles.summaryHint}>クリック ÷ 表示回数</span>
                        </div>
                        <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>平均掲載順位</span>
                            <span className={styles.summaryValue}>{data.total.position != null ? data.total.position.toFixed(1) : '－'}</span>
                            <span className={styles.summaryHint}>前期間比 {posDiff(data.total.position, data.total.prevPosition)}（マイナスが改善）</span>
                        </div>
                    </div>

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>ページカテゴリ別（前期間比つき）</h2>
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>カテゴリ</th>
                                        <th className={styles.num}>クリック</th>
                                        <th className={styles.num}>前期間比</th>
                                        <th className={styles.num}>表示回数</th>
                                        <th className={styles.num}>前期間比</th>
                                        <th className={styles.num}>CTR</th>
                                        <th className={styles.num}>平均順位</th>
                                        <th className={styles.num}>順位変化</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.categories.map((c) => (
                                        <tr key={c.key}>
                                            <td>{c.label}</td>
                                            <td className={`${styles.num} ${styles.strong}`}>{c.clicks.toLocaleString()}</td>
                                            <td className={styles.num}>{diffPct(c.clicks, c.prevClicks)}</td>
                                            <td className={styles.num}>{c.impressions.toLocaleString()}</td>
                                            <td className={styles.num}>{diffPct(c.impressions, c.prevImpressions)}</td>
                                            <td className={styles.num}>{c.ctr != null ? `${(c.ctr * 100).toFixed(1)}%` : '－'}</td>
                                            <td className={styles.num}>{c.position != null ? c.position.toFixed(1) : '－'}</td>
                                            <td className={styles.num}>{posDiff(c.position, c.prevPosition)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className={styles.tableNote}>
                            ※ 順位変化はマイナスが改善（例: -0.5 = 平均0.5位上昇）。<br />
                            ※ 施策のSEO影響判定: 施策を当てたカテゴリだけが悪化し、他カテゴリが横ばいなら施策影響の疑い。全カテゴリ一斉に動いたらアルゴリズム更新・季節要因。<br />
                            ※ SEOの反映はクロール→再評価で2〜6週間かかるため、リリース直後の数日で判断しないこと。
                        </p>
                    </div>

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>上位ページ（URL別・前期間比つき）</h2>
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>パス</th>
                                        <th className={styles.num}>クリック</th>
                                        <th className={styles.num}>前期間</th>
                                        <th className={styles.num}>変化</th>
                                        <th className={styles.num}>表示回数</th>
                                        <th className={styles.num}>平均順位</th>
                                        <th className={styles.num}>順位変化</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.topPages.map((p) => (
                                        <tr key={p.path}>
                                            <td style={{ maxWidth: '24rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.path}</td>
                                            <td className={`${styles.num} ${styles.strong}`}>{p.clicks.toLocaleString()}</td>
                                            <td className={styles.num}>{p.prevClicks.toLocaleString()}</td>
                                            <td className={styles.num}>{diffPct(p.clicks, p.prevClicks)}</td>
                                            <td className={styles.num}>{p.impressions.toLocaleString()}</td>
                                            <td className={styles.num}>{p.position != null ? p.position.toFixed(1) : '－'}</td>
                                            <td className={styles.num}>{posDiff(p.position, p.prevPosition)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className={styles.tableNote}>
                            ※ 当期クリック上位20URL。パスフィルタを使うと特定の施策対象URL群（例: ABテスト対象の職種詳細だけ）に絞って
                            サマリー・日別・クエリ・この表すべてが再集計されます。
                        </p>
                    </div>

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>日別推移（クリック / 平均順位）</h2>
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>日付</th>
                                        <th className={styles.num}>クリック</th>
                                        <th style={{ width: '40%' }}></th>
                                        <th className={styles.num}>表示回数</th>
                                        <th className={styles.num}>平均順位</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.daily.map((d) => (
                                        <tr key={d.date}>
                                            <td>{d.date}</td>
                                            <td className={styles.num}>{d.clicks.toLocaleString()}</td>
                                            <td><span className={styles.bar} style={{ width: `${(d.clicks / maxClicks) * 100}%` }} /></td>
                                            <td className={styles.num}>{d.impressions.toLocaleString()}</td>
                                            <td className={styles.num}>{d.position != null ? d.position.toFixed(1) : '－'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>上位検索クエリ</h2>
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>クエリ</th>
                                        <th className={styles.num}>クリック</th>
                                        <th className={styles.num}>表示回数</th>
                                        <th className={styles.num}>平均順位</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.topQueries.map((q) => (
                                        <tr key={q.query}>
                                            <td>{q.query}</td>
                                            <td className={`${styles.num} ${styles.strong}`}>{q.clicks.toLocaleString()}</td>
                                            <td className={styles.num}>{q.impressions.toLocaleString()}</td>
                                            <td className={styles.num}>{q.position != null ? q.position.toFixed(1) : '－'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
