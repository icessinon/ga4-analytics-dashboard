'use client'

import { useCallback, useEffect, useState } from 'react'
import BackLink from '@/components/BackLink'
import RelatedPages from '@/components/RelatedPages/RelatedPages'
import { parseJsonResponse } from '@/lib/utils/fetch'
import styles from './UserFlowPage.module.css'

interface FlowGroup {
    key: 'applied' | 'signup' | 'browsed' | 'other'
    sessions: number
    avgDetails: number
    medDetails: number
    searchRatePct: number
    medDurMin: number
    medCvMin: number | null
    dist: { d0: number; d1: number; d2_3: number; d4_9: number; d10p: number }
}

interface NextAction { action: string; count: number }

interface UserFlowResponse {
    days: number
    startDate: string
    endDate: string
    clamped: boolean
    groups: FlowGroup[]
    nextActions: NextAction[]
    scannedMb: number
}

const PERIOD_OPTIONS = [
    { value: 7, label: '過去7日' },
    { value: 14, label: '過去14日' },
    { value: 28, label: '過去28日' },
]

const GROUP_LABELS: Record<FlowGroup['key'], string> = {
    applied: '応募あり',
    signup: '会員登録あり（応募なし）',
    browsed: '非CV（求人閲覧あり）',
    other: '非CV（求人閲覧なし）',
}

const ACTION_LABELS: Record<string, string> = {
    detail: '別の求人詳細を見る',
    exit: '離脱（セッション終了）',
    search: '検索ページへ',
    list: '一覧・絞り込みへ戻る',
    entry_form: '応募フォームへ進む',
    featured: '特集求人（featured）へ',
    signup: '会員登録へ',
    mypage: 'マイページ・お気に入りへ',
    journal: 'コラムへ',
    top: 'トップへ',
    other_page: 'その他のページへ',
}

const DIST_BUCKETS = [
    { key: 'd0', label: '0件' },
    { key: 'd1', label: '1件' },
    { key: 'd2_3', label: '2〜3件' },
    { key: 'd4_9', label: '4〜9件' },
    { key: 'd10p', label: '10件以上' },
] as const

export default function UserFlowPage() {
    const [days, setDays] = useState(7)
    const [data, setData] = useState<UserFlowResponse | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/user-flow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ days }),
            })
            const json = await parseJsonResponse<UserFlowResponse & { error?: string; message?: string }>(res)
            if (!res.ok) throw new Error(json.message || json.error || '取得に失敗しました')
            setData(json)
        } catch (e) {
            setError(e instanceof Error ? e.message : '取得に失敗しました')
            setData(null)
        } finally {
            setLoading(false)
        }
    }, [days])

    useEffect(() => { load() }, [load])

    const applied = data?.groups.find((g) => g.key === 'applied') ?? null
    const signup = data?.groups.find((g) => g.key === 'signup') ?? null
    const browsed = data?.groups.find((g) => g.key === 'browsed') ?? null
    const totalNext = data ? data.nextActions.reduce((s, a) => s + a.count, 0) : 0
    const maxNext = data ? Math.max(1, ...data.nextActions.map((a) => a.count)) : 1

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>CVセッション解剖（BQ）</h1>
                    <p className={styles.subtitle}>
                        BigQueryのGA4生イベント（x-work.jp）をセッション単位で集計。応募・登録した人が「何件の求人を見て・検索を使って・何分で」CVしたかと、求人詳細を見た直後の行動の実測です。
                    </p>
                </div>
                <BackLink href="/">ダッシュボード</BackLink>
            </div>

            <RelatedPages pages={[
                { href: '/journey', label: 'ユーザー経路分析' },
                { href: '/pageflow', label: 'ページフロー分析' },
                { href: '/cv-types', label: '求人種別CV分析' },
            ]} />

            <div className={styles.controls}>
                <select className={styles.select} value={days} onChange={(e) => setDays(Number(e.target.value))}>
                    {PERIOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {data && (
                    <span className={styles.periodNote}>
                        集計期間: {data.startDate} 〜 {data.endDate}（BQスキャン {data.scannedMb}MB）
                    </span>
                )}
            </div>

            {data?.clamped && (
                <div className={styles.notice}>
                    BQエクスポートの開始日（2026-08-07）より前は集計できないため、期間の先頭を 2026-08-07 に丸めています。
                </div>
            )}

            {loading && <p className={styles.loading}>読み込み中...（BigQueryを直接集計しています）</p>}
            {error && <div className={styles.error}>{error}</div>}

            {data && !loading && (
                <>
                    <div className={styles.summaryRow}>
                        <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>応募セッション</span>
                            <span className={styles.summaryValue}>{applied ? applied.sessions.toLocaleString() : '－'}</span>
                            <span className={styles.summaryHint}>
                                {applied?.medCvMin != null ? `開始から応募まで中央値 ${applied.medCvMin}分` : '－'}
                            </span>
                        </div>
                        <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>会員登録セッション（応募なし）</span>
                            <span className={styles.summaryValue}>{signup ? signup.sessions.toLocaleString() : '－'}</span>
                            <span className={styles.summaryHint}>
                                {signup?.medCvMin != null ? `開始から登録まで中央値 ${signup.medCvMin}分` : '－'}
                            </span>
                        </div>
                        <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>応募までの求人詳細閲覧（中央値）</span>
                            <span className={styles.summaryValue}>{applied ? `${applied.medDetails}件` : '－'}</span>
                            <span className={styles.summaryHint}>
                                平均 {applied?.avgDetails ?? '－'}件 / 非CV閲覧者は中央値 {browsed?.medDetails ?? '－'}件
                            </span>
                        </div>
                        <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>検索ページ利用率（応募セッション）</span>
                            <span className={styles.summaryValue}>{applied ? `${applied.searchRatePct}%` : '－'}</span>
                            <span className={styles.summaryHint}>非CV（求人閲覧あり）は {browsed?.searchRatePct ?? '－'}%</span>
                        </div>
                    </div>

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>グループ別の行動量比較</h2>
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>グループ</th>
                                        <th className={styles.num}>セッション</th>
                                        <th className={styles.num}>求人詳細閲覧（平均）</th>
                                        <th className={styles.num}>同（中央値）</th>
                                        <th className={styles.num}>検索利用率</th>
                                        <th className={styles.num}>滞在時間（中央値）</th>
                                        <th className={styles.num}>CVまで（中央値）</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.groups.map((g) => (
                                        <tr key={g.key} className={g.key === 'applied' || g.key === 'signup' ? styles.cvRow : undefined}>
                                            <td>{GROUP_LABELS[g.key]}</td>
                                            <td className={`${styles.num} ${styles.strong}`}>{g.sessions.toLocaleString()}</td>
                                            <td className={styles.num}>{g.avgDetails}件</td>
                                            <td className={styles.num}>{g.medDetails}件</td>
                                            <td className={styles.num}>{g.searchRatePct}%</td>
                                            <td className={styles.num}>{g.medDurMin}分</td>
                                            <td className={styles.num}>{g.medCvMin != null ? `${g.medCvMin}分` : '－'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className={styles.tableNote}>
                            ※ 応募 = EF__Job(R|A|H)__Btn クリック（送信ボタンは入力完了まで押せないため実応募と一致）。登録 = /members/signup/thanks 到達。検索利用 = /search・一覧・絞り込み・資格条件ページの閲覧。<br />
                            ※ 「会員登録あり」に応募同時登録（求人広告）は含まれません（応募ありに分類）。
                        </p>
                    </div>

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>求人詳細の閲覧数分布（セッションあたり）</h2>
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>グループ</th>
                                        {DIST_BUCKETS.map((b) => <th key={b.key} className={styles.num}>{b.label}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.groups.map((g) => {
                                        const total = DIST_BUCKETS.reduce((s, b) => s + g.dist[b.key], 0)
                                        return (
                                            <tr key={g.key} className={g.key === 'applied' || g.key === 'signup' ? styles.cvRow : undefined}>
                                                <td>{GROUP_LABELS[g.key]}</td>
                                                {DIST_BUCKETS.map((b) => (
                                                    <td key={b.key} className={styles.num}>
                                                        {g.dist[b.key].toLocaleString()}
                                                        <span className={styles.distPct}>{total > 0 ? `${((g.dist[b.key] / total) * 100).toFixed(0)}%` : ''}</span>
                                                    </td>
                                                ))}
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <p className={styles.tableNote}>
                            ※ 応募ありで「0件」= 一覧モーダルやfeatured・LP等、求人詳細ページを経由しない応募導線。ここが多い場合は詳細ページ以外の導線が効いています。
                        </p>
                    </div>

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>求人詳細を見た「次のアクション」</h2>
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>次のアクション</th>
                                        <th className={styles.num}>回数</th>
                                        <th className={styles.num}>割合</th>
                                        <th style={{ width: '40%' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.nextActions.map((a) => (
                                        <tr key={a.action}>
                                            <td>{ACTION_LABELS[a.action] ?? a.action}</td>
                                            <td className={`${styles.num} ${styles.strong}`}>{a.count.toLocaleString()}</td>
                                            <td className={styles.num}>{totalNext > 0 ? `${((a.count / totalNext) * 100).toFixed(1)}%` : '－'}</td>
                                            <td><span className={styles.bar} style={{ width: `${(a.count / maxNext) * 100}%` }} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className={styles.tableNote}>
                            ※ 求人詳細のpage_view直後の次ページ（同一セッション内）。「離脱」はそのpage_viewがセッション最後だったもの。<br />
                            ※ 応募フォーム = /entry/media_(id)。詳細→フォーム進出率が施策（FV改善・5件ごとCTA等）の主要KPIになります。
                        </p>
                    </div>
                </>
            )}
        </div>
    )
}
