'use client'

import { useState } from 'react'
import Link from '@/components/Link'
import PageShell from '@/components/PageShell'
import Alert from '@/components/Alert'
import AISpinner from '@/components/AISpinner'
import { ui, cx } from '@/components/ui'
import { useProduct } from '@/contexts/ProductContext'
import { fetchJson } from '@/lib/utils/fetch'
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

/** AI 回答の 1 行を HTML 化: エスケープ → **太字** 変換 */
function renderLine(line: string, i: number) {
    const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const bold = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    return line.trim() ? <p key={i} dangerouslySetInnerHTML={{ __html: bold }} /> : null
}

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
            setResult(await fetchJson<AdvisorResponse>('/api/ab-test/advisor', {
                method: 'POST',
                body: JSON.stringify({ proposal, productId: currentProduct?.id }),
            }))
        } catch (e) {
            setError(e instanceof Error ? e.message : '回答の生成に失敗しました')
        } finally {
            setLoading(false)
        }
    }

    return (
        <PageShell pageId="abTestAdvisor">
            <div className={ui.card}>
                <h2 className={ui.sectionTitle}>施策提案</h2>
                <p className={ui.sectionNote}>施策のアイデアを入力すると、過去の AB テスト実績（勝因・敗因・最終レポート）をコンテキストに AI が評価・アドバイスします。</p>
                <textarea
                    id="proposal"
                    className={ui.textarea}
                    value={proposal}
                    onChange={(e) => setProposal(e.target.value)}
                    placeholder={EXAMPLE}
                    rows={5}
                    disabled={loading}
                    aria-label="施策提案"
                />
                <div className={ui.controls}>
                    <button type="button" onClick={handleSubmit} disabled={loading || !proposal.trim()} className={ui.btnPrimary}>
                        {loading ? <span className={ui.inlineLoading}><AISpinner /> 過去実績を照合して回答中...</span> : 'AIに壁打ちする'}
                    </button>
                </div>
                {error && <Alert tone="error">{error}</Alert>}
            </div>

            {result && (
                <>
                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>AIからの回答</h2>
                        <div className={ui.aiResult}>{result.answer.split('\n').map(renderLine)}</div>
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>参照した過去のABテスト（{result.referencedTests.length}件）</h2>
                        {result.referencedTests.length === 0 ? (
                            <p className={ui.empty}>過去のABテスト実績はまだありません。一般的な知見に基づく回答です。</p>
                        ) : (
                            <ul className={styles.refList}>
                                {result.referencedTests.map((t) => (
                                    <li key={t.abTestId} className={styles.refItem}>
                                        <Link href={`/ab-test/${t.abTestId}`} className={styles.refLink}>{t.name}</Link>
                                        <span className={ui.note}>
                                            {t.startDate ?? '?'} 〜 {t.endDate ?? '?'}
                                            {t.winnerVariant ? ` ／ 勝者: ${t.winnerVariant}` : ' ／ 勝者判定なし'}
                                            {t.improvementVsAPct != null && (
                                                <span className={cx(t.improvementVsAPct >= 0 ? styles.up : styles.down)}>
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
        </PageShell>
    )
}
