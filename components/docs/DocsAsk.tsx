'use client'

import { useState } from 'react'
import AISpinner from '@/components/AISpinner/AISpinner'
import { parseJsonResponse } from '@/lib/utils/fetch'
import styles from './DocsAsk.module.css'

interface QA {
    question: string
    answer: string
}

const EXAMPLES = [
    '応募CVとLP応募CVの違いは？',
    '数字がGA4管理画面と合わないのはなぜ？',
    '求人種別はどうやって分解してる？',
]

function renderLine(line: string, i: number) {
    const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const html = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    return <p key={i} className={styles.answerLine} dangerouslySetInnerHTML={{ __html: html }} />
}

export default function DocsAsk() {
    const [question, setQuestion] = useState('')
    const [history, setHistory] = useState<QA[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function ask(q?: string) {
        const text = (q ?? question).trim()
        if (!text || loading) return
        if (q) setQuestion(q)
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/docs/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: text }),
            })
            const data = await parseJsonResponse<{ answer?: string; error?: string }>(res)
            if (!res.ok || !data.answer) throw new Error(data.error || '回答の生成に失敗しました')
            setHistory((prev) => [{ question: text, answer: data.answer as string }, ...prev])
            setQuestion('')
        } catch (e) {
            setError(e instanceof Error ? e.message : '回答の生成に失敗しました')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className={styles.card}>
            <div className={styles.inputRow}>
                <span className={styles.icon}>💬</span>
                <input
                    className={styles.input}
                    placeholder="ドキュメントについて質問する（例: 応募CVの定義は？）"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') ask() }}
                    disabled={loading}
                />
                <button className={styles.askButton} onClick={() => ask()} disabled={loading || !question.trim()}>
                    {loading ? <span className={styles.buttonInner}><AISpinner /> 回答中...</span> : '質問する'}
                </button>
            </div>
            {history.length === 0 && !loading && (
                <div className={styles.examples}>
                    {EXAMPLES.map((ex) => (
                        <button key={ex} className={styles.exampleChip} onClick={() => ask(ex)}>{ex}</button>
                    ))}
                </div>
            )}
            {error && <p className={styles.error}>{error}</p>}
            {history.map((qa, i) => (
                <div key={history.length - i} className={styles.qaItem}>
                    <p className={styles.question}>Q. {qa.question}</p>
                    <div className={styles.answer}>
                        {qa.answer.split('\n').map(renderLine)}
                    </div>
                </div>
            ))}
        </div>
    )
}
