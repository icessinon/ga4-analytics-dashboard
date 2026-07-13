'use client'

import { useState, useEffect } from 'react'
import AISpinner from '@/components/AISpinner/AISpinner'
import styles from './AbTestCompletionModal.module.css'

export interface AbTestCompletionModalProps {
    isOpen: boolean
    onClose: () => void
    onSubmit: (victoryFactors: string, defeatFactors: string) => void | Promise<void>
    testName?: string
    winnerVariant?: string | null
    initialVictoryFactors?: string
    initialDefeatFactors?: string
}

const isWinVariant = (v: string | null | undefined) => v != null && ['B', 'C', 'D'].includes(v)

export default function AbTestCompletionModal({
    isOpen,
    onClose,
    onSubmit,
    testName,
    winnerVariant = null,
    initialVictoryFactors = '',
    initialDefeatFactors = '',
}: AbTestCompletionModalProps) {
    const [victoryFactors, setVictoryFactors] = useState(initialVictoryFactors)
    const [defeatFactors, setDefeatFactors] = useState(initialDefeatFactors)
    const [submitting, setSubmitting] = useState(false)
    const showDefeatFactors = !isWinVariant(winnerVariant)

    useEffect(() => {
        if (isOpen) {
            setVictoryFactors(initialVictoryFactors)
            setDefeatFactors(initialDefeatFactors)
        }
    }, [isOpen, initialVictoryFactors, initialDefeatFactors])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setSubmitting(true)
        try {
            await onSubmit(victoryFactors.trim(), showDefeatFactors ? defeatFactors.trim() : '')
            onClose()
        } finally {
            setSubmitting(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="completion-modal-title">
            <div className={styles.modal}>
                <h2 id="completion-modal-title" className={styles.title}>
                    完了時のメモ
                    {testName && <span className={styles.testName}>{testName}</span>}
                </h2>
                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.field}>
                        <label htmlFor="victory-factors" className={styles.label}>
                            勝利要因（任意）
                        </label>
                        <textarea
                            id="victory-factors"
                            className={styles.textarea}
                            rows={3}
                            value={victoryFactors}
                            onChange={(e) => setVictoryFactors(e.target.value)}
                            placeholder="勝った要因をメモ..."
                        />
                    </div>
                    {showDefeatFactors && (
                        <div className={styles.field}>
                            <label htmlFor="defeat-factors" className={styles.label}>
                                負け要因（任意）
                            </label>
                            <textarea
                                id="defeat-factors"
                                className={styles.textarea}
                                rows={3}
                                value={defeatFactors}
                                onChange={(e) => setDefeatFactors(e.target.value)}
                                placeholder="負けた要因をメモ..."
                            />
                        </div>
                    )}
                    {submitting && (
                        <p className={styles.generatingNote}>
                            <AISpinner /> ファネル集計とAI最終レポートを生成しています（1分ほどかかることがあります）...
                        </p>
                    )}
                    <div className={styles.actions}>
                        <button
                            type="button"
                            className={styles.cancelButton}
                            onClick={onClose}
                            disabled={submitting}
                        >
                            キャンセル
                        </button>
                        <button type="submit" className={styles.submitButton} disabled={submitting}>
                            {submitting ? <span className={styles.submitInner}><AISpinner /> 完了処理中...</span> : '完了する'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
