'use client'

import { useCallback, useEffect, useState } from 'react'
import { useProduct } from '@/lib/contexts/ProductContext'
import BackLink from '@/components/BackLink'
import RelatedPages from '@/components/RelatedPages/RelatedPages'
import CvTypesTrendChart, { type DailyPoint } from '@/components/cv-types/CvTypesTrendChart'
import { parseJsonResponse } from '@/lib/utils/fetch'
import styles from './CvTypesPage.module.css'

interface JobTypeRow {
    key: string
    label: string
    detailViews: number
    formViews: number
    completed: number
    detailToForm: number | null
    formToComplete: number | null
    overallRate: number | null
}

interface CvTypesResponse {
    jobTypes: JobTypeRow[]
    signup: { formViews: number; completed: number; formToComplete: number | null }
    daily: DailyPoint[]
    startDate: string
    endDate: string
}

const PERIOD_OPTIONS = [
    { value: '7daysAgo', label: '過去7日' },
    { value: '14daysAgo', label: '過去14日' },
    { value: '30daysAgo', label: '過去30日' },
    { value: '90daysAgo', label: '過去90日' },
]

const TYPE_COLORS: Record<string, string> = {
    JobR: '#60a5fa',
    JobH: '#fbbf24',
    JobA: '#f87171',
    signup: '#4ade80',
}

function pct(v: number | null): string {
    return v != null ? `${(v * 100).toFixed(1)}%` : '－'
}

export default function CvTypesPage() {
    const { currentProduct } = useProduct()
    const [period, setPeriod] = useState('30daysAgo')
    const [data, setData] = useState<CvTypesResponse | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        if (!currentProduct?.ga4PropertyId) return
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/cv-types', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    propertyId: currentProduct.ga4PropertyId,
                    startDate: period,
                    endDate: 'yesterday',
                }),
            })
            const json = await parseJsonResponse<CvTypesResponse & { error?: string }>(res)
            if (!res.ok) throw new Error(json.error || '取得に失敗しました')
            setData(json)
        } catch (e) {
            setError(e instanceof Error ? e.message : '取得に失敗しました')
            setData(null)
        } finally {
            setLoading(false)
        }
    }, [currentProduct?.ga4PropertyId, period])

    useEffect(() => { load() }, [load])

    const totalApply = data ? data.jobTypes.reduce((s, t) => s + t.completed, 0) : 0

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>求人種別CV分析</h1>
                    <p className={styles.subtitle}>
                        応募CVを契約種別（人材紹介 / 求人広告 / ハローワーク）に分解し、会員登録と並べて状況を確認します。種別はGTMラベル（JobR / JobA / JobH）ベースです。
                    </p>
                </div>
                <BackLink href="/">ダッシュボード</BackLink>
            </div>

            {!currentProduct && <div className={styles.notice}>プロダクトを選択してください</div>}

            <RelatedPages pages={[{ href: '/occupation', label: '職種別CV分析' }, { href: '/pageflow', label: 'ページフロー分析' }, { href: '/funnel/path', label: '経路ファネルビルダー' }]} />

            <div className={styles.controls}>
                <select className={styles.select} value={period} onChange={(e) => setPeriod(e.target.value)}>
                    {PERIOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {data && <span className={styles.periodNote}>集計期間: {data.startDate} 〜 {data.endDate}</span>}
            </div>

            {loading && <p className={styles.loading}>読み込み中...</p>}
            {error && <div className={styles.error}>{error}</div>}

            {data && !loading && (
                <>
                    <div className={styles.summaryRow}>
                        {data.jobTypes.map((t) => (
                            <div key={t.key} className={styles.summaryCard} style={{ borderTopColor: TYPE_COLORS[t.key] }}>
                                <span className={styles.summaryLabel}>{t.label}（応募完了）</span>
                                <span className={styles.summaryValue}>{t.completed.toLocaleString()}</span>
                                <span className={styles.summaryHint}>
                                    応募CV構成比 {totalApply > 0 ? `${((t.completed / totalApply) * 100).toFixed(0)}%` : '－'}
                                </span>
                            </div>
                        ))}
                        <div className={styles.summaryCard} style={{ borderTopColor: TYPE_COLORS.signup }}>
                            <span className={styles.summaryLabel}>会員登録（完了）</span>
                            <span className={styles.summaryValue}>{data.signup.completed.toLocaleString()}</span>
                            <span className={styles.summaryHint}>フォーム→完了 {pct(data.signup.formToComplete)}</span>
                        </div>
                    </div>

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>求人種別ファネル（求人詳細 → 応募フォーム → 完了）</h2>
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>種別</th>
                                        <th className={styles.num}>求人詳細閲覧</th>
                                        <th className={styles.num}>→ フォーム</th>
                                        <th className={styles.num}>→ 完了</th>
                                        <th className={styles.num}>詳細→フォーム</th>
                                        <th className={styles.num}>フォーム→完了</th>
                                        <th className={styles.num}>詳細→完了</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.jobTypes.map((t) => (
                                        <tr key={t.key}>
                                            <td>
                                                <span className={styles.typeDot} style={{ background: TYPE_COLORS[t.key] }} />
                                                {t.label}
                                            </td>
                                            <td className={styles.num}>{t.detailViews.toLocaleString()}</td>
                                            <td className={styles.num}>{t.formViews.toLocaleString()}</td>
                                            <td className={styles.num}>{t.completed.toLocaleString()}</td>
                                            <td className={styles.num}>{pct(t.detailToForm)}</td>
                                            <td className={styles.num}>{pct(t.formToComplete)}</td>
                                            <td className={`${styles.num} ${styles.strong}`}>{pct(t.overallRate)}</td>
                                        </tr>
                                    ))}
                                    <tr className={styles.signupRow}>
                                        <td>
                                            <span className={styles.typeDot} style={{ background: TYPE_COLORS.signup }} />
                                            会員登録（参考: フォーム → 完了）
                                        </td>
                                        <td className={styles.num}>－</td>
                                        <td className={styles.num}>{data.signup.formViews.toLocaleString()}</td>
                                        <td className={styles.num}>{data.signup.completed.toLocaleString()}</td>
                                        <td className={styles.num}>－</td>
                                        <td className={styles.num}>{pct(data.signup.formToComplete)}</td>
                                        <td className={styles.num}>－</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <p className={styles.tableNote}>
                            ※ 完了は応募フォームの<strong>送信ボタンクリック</strong>（クリックラベル）ベースのユーザー数です。送信ボタンは入力完了までdisabledのため
                            「クリック＝応募実行」であり、DBの実応募数と一致することを確認済み（botの影響も受けません）。<br />
                            ※ 求人詳細・フォームはビューラベル（50%×1秒表示）ベースのため、1〜2割の取りこぼしがあります。<br />
                            ※ スカウト・featured経由の応募（別フォーム、GTMラベル未実装）はこの表に含まれません。サイト内フォームからの応募のみです。<br />
                            ※ 会員登録はページベース（/members/signup → /members/signup/thanks）。求人広告応募時の自動会員化はここに含まれません。
                        </p>
                    </div>

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>完了数の日別推移</h2>
                        <CvTypesTrendChart daily={data.daily} />
                    </div>
                </>
            )}
        </div>
    )
}
