'use client'

import { useState } from 'react'
import { useProduct } from '@/lib/contexts/ProductContext'
import BackLink from '@/components/BackLink'
import RelatedPages from '@/components/RelatedPages/RelatedPages'
import { parseJsonResponse } from '@/lib/utils/fetch'
import styles from './PageFlowPage.module.css'

interface FlowRow {
    page: string
    users: number
}

interface PrevRow {
    page: string
    users: number
    pv: number
    sourcePv: number | null
    transitionRate: number | null
}

interface PageFlowResponse {
    pagePath: string
    targetUsers: number
    prevPages: PrevRow[]
    prevNoReferrer: number
    nextPages: FlowRow[]
    startDate: string
    endDate: string
}

const PERIOD_OPTIONS = [
    { value: '7daysAgo', label: '過去7日' },
    { value: '14daysAgo', label: '過去14日' },
    { value: '30daysAgo', label: '過去30日' },
    { value: '90daysAgo', label: '過去90日' },
]

const EXAMPLES = ['/lp-thanks', '/members/signup', '/entry/thanks', '/driver']

function PrevTable({ title, rows, totalPv, emptyText }: { title: string; rows: PrevRow[]; totalPv: number; emptyText: string }) {
    const max = Math.max(1, ...rows.map((r) => r.pv))
    return (
        <div className={styles.flowCard}>
            <h2 className={styles.flowTitle}>{title}</h2>
            {rows.length === 0 ? (
                <p className={styles.emptyText}>{emptyText}</p>
            ) : (
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>経路（直前ページ）</th>
                            <th className={styles.num}>到達PV</th>
                            <th className={styles.barCol}></th>
                            <th className={styles.num}>構成比</th>
                            <th className={styles.num}>経路の表示PV</th>
                            <th className={styles.num}>遷移率</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.page}>
                                <td className={styles.pathCell}>{r.page}</td>
                                <td className={styles.num}>{r.pv.toLocaleString()}</td>
                                <td className={styles.barCol}>
                                    <div className={styles.bar} style={{ width: `${(r.pv / max) * 100}%` }} />
                                </td>
                                <td className={styles.num}>{totalPv > 0 ? `${((r.pv / totalPv) * 100).toFixed(1)}%` : '－'}</td>
                                <td className={styles.num}>{r.sourcePv != null ? r.sourcePv.toLocaleString() : '－'}</td>
                                <td className={styles.num}>
                                    {r.transitionRate != null ? `${(r.transitionRate * 100).toFixed(1)}%` : '－'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            <p className={styles.tableHint}>
                遷移率 = 到達PV ÷ 経路ページの表示PV（そのページを見たうち何%が対象ページへ進んだか）。外部サイトは表示PVを取得できないため「－」。
            </p>
        </div>
    )
}

function FlowTable({ title, rows, total, emptyText }: { title: string; rows: FlowRow[]; total: number; emptyText: string }) {
    const max = Math.max(1, ...rows.map((r) => r.users))
    return (
        <div className={styles.flowCard}>
            <h2 className={styles.flowTitle}>{title}</h2>
            {rows.length === 0 ? (
                <p className={styles.emptyText}>{emptyText}</p>
            ) : (
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>ページ</th>
                            <th className={styles.num}>ユーザー</th>
                            <th className={styles.barCol}></th>
                            <th className={styles.num}>構成比</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.page}>
                                <td className={styles.pathCell}>{r.page}</td>
                                <td className={styles.num}>{r.users.toLocaleString()}</td>
                                <td className={styles.barCol}>
                                    <div className={styles.bar} style={{ width: `${(r.users / max) * 100}%` }} />
                                </td>
                                <td className={styles.num}>{total > 0 ? `${((r.users / total) * 100).toFixed(1)}%` : '－'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    )
}

export default function PageFlowPage() {
    const { currentProduct } = useProduct()
    const [pagePath, setPagePath] = useState('')
    const [period, setPeriod] = useState('30daysAgo')
    const [data, setData] = useState<PageFlowResponse | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function analyze(path?: string) {
        const target = (path ?? pagePath).trim()
        if (!currentProduct?.ga4PropertyId || !target || loading) return
        if (!target.startsWith('/')) {
            setError('ページパスは / で始めてください（例: /lp-thanks）')
            return
        }
        if (path) setPagePath(path)
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/pageflow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    propertyId: currentProduct.ga4PropertyId,
                    pagePath: target,
                    startDate: period,
                    endDate: 'yesterday',
                }),
            })
            const json = await parseJsonResponse<PageFlowResponse & { error?: string }>(res)
            if (!res.ok) throw new Error(json.error || '取得に失敗しました')
            setData(json)
        } catch (e) {
            setError(e instanceof Error ? e.message : '取得に失敗しました')
            setData(null)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>ページフロー分析</h1>
                    <p className={styles.subtitle}>
                        指定したページの「直前に見ていたページ」と「直後に見たページ」を両方向で集計します。導線の実態確認・サンクスページ後の誘導効果測定などに使えます。
                    </p>
                </div>
                <BackLink href="/">ダッシュボード</BackLink>
            </div>

            {!currentProduct && <div className={styles.notice}>プロダクトを選択してください</div>}
            {currentProduct && !currentProduct.ga4PropertyId && (
                <div className={styles.notice}>このプロダクトには GA4 プロパティが設定されていません</div>
            )}

            <RelatedPages pages={[{ href: '/journey', label: 'ユーザー経路分析' }, { href: '/exit', label: '離脱分析' }, { href: '/funnel/path', label: '経路ファネルビルダー' }, { href: '/cv-types', label: '求人種別CV分析' }]} />

            <div className={styles.controls}>
                <input
                    type="text"
                    className={styles.pathInput}
                    placeholder="ページパス（前方一致。例: /lp-thanks）"
                    value={pagePath}
                    onChange={(e) => setPagePath(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) analyze() }}
                />
                <select className={styles.select} value={period} onChange={(e) => setPeriod(e.target.value)}>
                    {PERIOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button className={styles.analyzeButton} onClick={() => analyze()} disabled={loading || !pagePath.trim()}>
                    {loading ? '集計中...' : '分析する'}
                </button>
            </div>
            <div className={styles.examples}>
                例:
                {EXAMPLES.map((ex) => (
                    <button key={ex} className={styles.exampleChip} onClick={() => analyze(ex)} disabled={loading}>
                        {ex}
                    </button>
                ))}
            </div>

            {error && <div className={styles.error}>{error}</div>}

            {data && !loading && (
                <>
                    <div className={styles.summaryCard}>
                        <span className={styles.summaryLabel}>対象: <code className={styles.pathCode}>{data.pagePath}</code>（前方一致）</span>
                        <span className={styles.summaryValue}>{data.targetUsers.toLocaleString()} ユーザー到達</span>
                        <span className={styles.summaryPeriod}>{data.startDate} 〜 {data.endDate}</span>
                    </div>

                    <PrevTable
                        title="← 経路別比較（直前ページ: 表示PV × 到達PV × 遷移率）"
                        rows={data.prevPages}
                        totalPv={data.prevPages.reduce((s, r) => s + r.pv, 0)}
                        emptyText="リファラーデータがありません"
                    />

                    <div className={styles.flowGrid}>
                        <FlowTable
                            title="直後に見たページ →"
                            rows={data.nextPages}
                            total={data.targetUsers}
                            emptyText="このページを起点とした遷移がありません"
                        />
                    </div>

                    <p className={styles.note}>
                        ※ 「直前」のうちリファラーなし（ブックマーク・アプリ・直打ち等）: {data.prevNoReferrer.toLocaleString()} ユーザー。<br />
                        ※ GA4のリファラーベースの近似集計です。同一ページ内の遷移・リロードは除外しています。<br />
                        ※ 経路はページ単位で表示されるため、/driver 〜 /others の大職種一覧14種もそれぞれ個別の行として内訳が見えます。
                    </p>
                </>
            )}
        </div>
    )
}
