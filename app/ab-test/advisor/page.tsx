'use client'

import { useState } from 'react'
import Link from '@/components/Link'
import { useProduct } from '@/lib/contexts/ProductContext'
import BackLink from '@/components/BackLink'
import AISpinner from '@/components/AISpinner/AISpinner'
import { parseJsonResponse } from '@/lib/utils/fetch'
import styles from './AdvisorPage.module.css'

interface ReferencedTest {
    abTestId: number
    name: string
    winnerVariant: string | null
    improvementVsAPct: number | null
    startDate: string | null
    endDate: string | null
}

interface AdvisorResponse {
    answer: string
    referencedTests: ReferencedTest[]
}

const EXAMPLE = '例: 求人詳細ページの応募ボタンを画面下部に固定表示（スティッキーCTA）にして、スクロール中でも常に応募導線を見えるようにしたい。'

export default function AbTestAdvisorPage() {
    const { currentProduct } = useProduct()
    const [proposal, setProposal] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<AdvisorResponse | null>(null)

    async function handleSubmit() {
        if (!proposal.trim() || loading) return
        setLoading(true)
        setError(null)
        setResult(null)
        try {
            const res = await fetch('/api/ab-test/advisor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ proposal, productId: currentProduct?.id }),
            })
            const data = await parseJsonResponse<AdvisorResponse & { error?: string }>(res)
            if (!res.ok) throw new Error(data.error || '回答の生成に失敗しました')
            setResult(data)
        } catch (e) {
            setError(e instanceof Error ? e.message : '回答の生成に失敗しました')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>施策提案 AI壁打ち</h1>
                    <p className={styles.subtitle}>
                        施策のアイデアを入力すると、過去のABテスト実績（勝因・敗因・最終レポート）をコンテキストにAIが評価・アドバイスします
                    </p>
                </div>
                <BackLink href="/ab-test">ABテスト一覧</BackLink>
            </div>

            <div className={styles.card}>
                <label className={styles.label} htmlFor="proposal">施策提案</label>
                <textarea
                    id="proposal"
                    className={styles.textarea}
                    value={proposal}
                    onChange={(e) => setProposal(e.target.value)}
                    placeholder={EXAMPLE}
                    rows={5}
                    disabled={loading}
                />
                <div className={styles.actions}>
                    <button
                        onClick={handleSubmit}
                        disabled={loading || !proposal.trim()}
                        className={styles.button}
                    >
                        {loading ? (
                            <span className={styles.buttonInner}><AISpinner /> 過去実績を照合して回答中...</span>
                        ) : 'AIに壁打ちする'}
                    </button>
                </div>
                {error && <p className={styles.error}>{error}</p>}
            </div>

            {result && (
                <>
                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>AIからの回答</h2>
                        <div className={styles.answer}>
                            {result.answer.split('\n').map((line, i) => {
                                const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                                const bold = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                return line.trim()
                                    ? <p key={i} className={styles.answerLine} dangerouslySetInnerHTML={{ __html: bold }} />
                                    : null
                            })}
                        </div>
                    </div>

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>参照した過去のABテスト（{result.referencedTests.length}件）</h2>
                        {result.referencedTests.length === 0 ? (
                            <p className={styles.refEmpty}>過去のABテスト実績はまだありません。一般的な知見に基づく回答です。</p>
                        ) : (
                            <ul className={styles.refList}>
                                {result.referencedTests.map((t) => (
                                    <li key={t.abTestId} className={styles.refItem}>
                                        <Link href={`/ab-test/${t.abTestId}`} className={styles.refLink}>{t.name}</Link>
                                        <span className={styles.refMeta}>
                                            {t.startDate ?? '?'} 〜 {t.endDate ?? '?'}
                                            {t.winnerVariant ? ` ／ 勝者: ${t.winnerVariant}` : ' ／ 勝者判定なし'}
                                            {t.improvementVsAPct != null && (
                                                <span className={t.improvementVsAPct >= 0 ? styles.refUp : styles.refDown}>
                                                    {' '}({t.improvementVsAPct >= 0 ? '+' : ''}{t.improvementVsAPct.toFixed(1)}%)
                                                </span>
                                            )}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
