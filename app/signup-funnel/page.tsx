'use client'

import { useCallback, useEffect, useState } from 'react'
import { useProduct } from '@/lib/contexts/ProductContext'
import BackLink from '@/components/BackLink'
import RelatedPages from '@/components/RelatedPages/RelatedPages'
import { parseJsonResponse } from '@/lib/utils/fetch'
import styles from './SignupFunnelPage.module.css'

interface QuestionRow {
    name: string
    view: number
    click: number
    variants: number
}

interface SignupFunnelResponse {
    startDate: string
    endDate: string
    forms: Array<{ key: string; label: string }>
    form: string
    formLabel: string
    origin: number | null
    questions: QuestionRow[]
    unassignedClicks: number
}

// 今月・前月はクライアントで具体日付に変換する
function monthRange(offset: 0 | -1): { startDate: string; endDate: string } {
    const now = new Date()
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const last = offset === 0 ? now : new Date(now.getFullYear(), now.getMonth(), 0)
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { startDate: fmt(first), endDate: offset === 0 ? 'yesterday' : fmt(last) }
}

const PERIOD_OPTIONS = [
    { value: '7daysAgo', label: '過去7日' },
    { value: '14daysAgo', label: '過去14日' },
    { value: '30daysAgo', label: '過去30日' },
    { value: '90daysAgo', label: '過去90日' },
    { value: 'thisMonth', label: '今月' },
    { value: 'lastMonth', label: '前月' },
]

function periodToRange(period: string): { startDate: string; endDate: string } {
    if (period === 'thisMonth') return monthRange(0)
    if (period === 'lastMonth') return monthRange(-1)
    return { startDate: period, endDate: 'yesterday' }
}

function pct(n: number, base: number): string {
    return base > 0 ? `${((n / base) * 100).toFixed(0)}%` : '－'
}

function dropClass(rate: number): string {
    if (rate >= 0.15) return styles.dropHigh
    if (rate >= 0.1) return styles.dropMid
    return styles.dropLow
}

export default function SignupFunnelPage() {
    const { currentProduct } = useProduct()
    const [period, setPeriod] = useState('30daysAgo')
    const [form, setForm] = useState<string | null>(null)
    const [data, setData] = useState<SignupFunnelResponse | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        if (!currentProduct?.ga4PropertyId) return
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/signup-funnel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    propertyId: currentProduct.ga4PropertyId,
                    ...periodToRange(period),
                    form: form ?? undefined,
                }),
            })
            const json = await parseJsonResponse<SignupFunnelResponse & { error?: string }>(res)
            if (!res.ok) throw new Error(json.error || '取得に失敗しました')
            setData(json)
        } catch (e) {
            setError(e instanceof Error ? e.message : '取得に失敗しました')
            setData(null)
        } finally {
            setLoading(false)
        }
    }, [currentProduct?.ga4PropertyId, period, form])

    useEffect(() => { load() }, [load])

    // 完走率計算のベース: 起点（職種選択）があればそれ、なければ最初の質問のclick
    const base = data ? (data.origin ?? data.questions[0]?.click ?? 0) : 0
    const completed = data?.questions.length ? data.questions[data.questions.length - 1].click : 0

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>会員登録フォームファネル</h1>
                    <p className={styles.subtitle}>
                        職種選択から登録完了までの各質問の通過状況（view=画面を見た人 / click=回答して進んだ人）。
                        期間内に実際に発火したGTMラベルから質問構造を自動復元するため、ABテストのラベル変更やステップ番号の振り直しにも自動で追従します。
                    </p>
                </div>
                <BackLink href="/">ダッシュボード</BackLink>
            </div>

            {!currentProduct && <div className={styles.notice}>プロダクトを選択してください</div>}

            <RelatedPages pages={[{ href: '/cv-types', label: '求人種別CV分析（応募ファネル）' }, { href: '/occupation', label: '職種別CV分析' }, { href: '/journey', label: 'ユーザー経路分析' }]} />

            <div className={styles.controls}>
                <select className={styles.select} value={period} onChange={(e) => setPeriod(e.target.value)}>
                    {PERIOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {data && <span className={styles.periodNote}>集計期間: {data.startDate} 〜 {data.endDate}</span>}
            </div>

            {data && (
                <div className={styles.formTabs}>
                    {data.forms.map((f) => (
                        <button
                            key={f.key}
                            className={`${styles.formTab} ${f.key === data.form ? styles.formTabActive : ''}`}
                            onClick={() => setForm(f.key)}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            )}

            {loading && <p className={styles.loading}>読み込み中...</p>}
            {error && <div className={styles.error}>{error}</div>}

            {data && !loading && (
                <>
                    <div className={styles.summaryRow}>
                        {data.origin != null && (
                            <div className={styles.summaryCard}>
                                <span className={styles.summaryLabel}>職種選択（{data.formLabel}）</span>
                                <span className={styles.summaryValue}>{data.origin.toLocaleString()}</span>
                                <span className={styles.summaryHint}>フォーム選択クリック</span>
                            </div>
                        )}
                        <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>登録完了</span>
                            <span className={styles.summaryValue}>{completed.toLocaleString()}</span>
                            <span className={styles.summaryHint}>最終ステップの完了クリック</span>
                        </div>
                        <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>完走率</span>
                            <span className={styles.summaryValue}>{pct(completed, base)}</span>
                            <span className={styles.summaryHint}>{data.origin != null ? '職種選択クリック起点' : '最初の質問起点'}</span>
                        </div>
                    </div>

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>{data.formLabel} フォーム 質問別ファネル</h2>
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>質問</th>
                                        <th className={styles.num}>view</th>
                                        <th className={styles.num}>click</th>
                                        <th className={styles.num}>起点比</th>
                                        <th className={styles.barCell}>残存</th>
                                        <th className={styles.num}>このステップの離脱率</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.origin != null && (
                                        <tr className={styles.originRow}>
                                            <td>職種選択「{data.formLabel}」</td>
                                            <td className={styles.num}>－</td>
                                            <td className={styles.num}>{data.origin.toLocaleString()}</td>
                                            <td className={styles.num}>100%</td>
                                            <td className={styles.barCell}>
                                                <div className={styles.barTrack}><div className={styles.barFill} style={{ width: '100%' }} /></div>
                                            </td>
                                            <td className={styles.num}>－</td>
                                        </tr>
                                    )}
                                    {(() => {
                                        // 全変種に存在する質問だけを離脱率のチェーンに使う。
                                        // 一部変種のみの質問（短縮版で削られた質問など）は母集団が違うため参考行にする
                                        const maxVariants = Math.max(...data.questions.map((q) => q.variants), 1)
                                        let prevChain: number | null = data.origin
                                        return data.questions.map((q) => {
                                            const inChain = q.variants === maxVariants
                                            const drop = inChain && prevChain != null && prevChain > 0 ? 1 - q.click / prevChain : null
                                            if (inChain) prevChain = q.click
                                            return { q, inChain, drop }
                                        })
                                    })().map(({ q, inChain, drop }) => {
                                        return (
                                            <tr key={q.name}>
                                                <td>{q.name}{!inChain && <span className={styles.partialTag}>一部変種のみ</span>}</td>
                                                <td className={styles.num}>{q.view.toLocaleString()}</td>
                                                <td className={`${styles.num} ${styles.strong}`}>{q.click.toLocaleString()}</td>
                                                <td className={styles.num}>{pct(q.click, base)}</td>
                                                <td className={styles.barCell}>
                                                    <div className={styles.barTrack}>
                                                        <div className={styles.barFill} style={{ width: base > 0 ? `${Math.min(100, (q.click / base) * 100)}%` : '0%' }} />
                                                    </div>
                                                </td>
                                                <td className={`${styles.num} ${drop != null && drop > 0 ? dropClass(drop) : styles.dropLow}`}>
                                                    {!inChain ? '－' : drop == null ? '－' : drop <= 0 ? '（逆転）' : `▼${(drop * 100).toFixed(1)}%`}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <p className={styles.tableNote}>
                            click＝そのステップで前進操作（選択肢タップ・次へ等、「戻る」除く）をした人。通過の実数としてはclickが信頼できます。
                            viewは視認計測条件（50%表示×1秒）の取りこぼしで1〜2割少なく出ることがあり、clickより小さい場合があります。
                            「逆転」は期間境界をまたいで途中再開したユーザーの影響です。
                            質問はABテスト変種（__B-xxxx）を質問文ベースで統合しており、変種間でステップ番号がズレていても正しく合算されます。
                            「一部変種のみ」の質問（短縮版で削られた質問など）は母集団が異なるため離脱率チェーンから除外し、参考値として表示しています。
                        </p>
                    </div>
                </>
            )}
        </div>
    )
}
