'use client'

import { useState, useEffect } from 'react'
import AISpinner from '@/components/AISpinner/AISpinner'
import styles from './AbTestCompletionModal.module.css'

export interface AbTestCompletionModalProps {
    isOpen: boolean
    onClose: () => void
    onSubmit: (winnerVariant: string | null, victoryFactors: string, defeatFactors: string) => void | Promise<void>
    testName?: string
    /** 自動判定（CVR1位）の勝者。勝者セレクトの初期値になる */
    winnerVariant?: string | null
    /** 選択肢に出すバリアントキー（例: ['A','B','C']）。未指定時は A/B にフォールバック */
    availableVariants?: string[]
    initialVictoryFactors?: string
    initialDefeatFactors?: string
}

const isWinVariant = (v: string | null | undefined) => v != null && ['B', 'C', 'D'].includes(v)
const NO_WINNER = '' // 「判定なし」を表す値

export default function AbTestCompletionModal({
    isOpen,
    onClose,
    onSubmit,
    testName,
    winnerVariant = null,
    availableVariants,
    initialVictoryFactors = '',
    initialDefeatFactors = '',
}: AbTestCompletionModalProps) {
    const variantOptions = availableVariants && availableVariants.length > 0 ? availableVariants : ['A', 'B']
    const [selectedWinner, setSelectedWinner] = useState<string>(winnerVariant ?? NO_WINNER)
    const [victoryFactors, setVictoryFactors] = useState(initialVictoryFactors)
    const [defeatFactors, setDefeatFactors] = useState(initialDefeatFactors)
    const [submitting, setSubmitting] = useState(false)
    // チャレンジャー(B/C/D)が勝った場合は負け要因欄を隠す（従来挙動を選択結果ベースで踏襲）
    const showDefeatFactors = !isWinVariant(selectedWinner)
    const autoWinner = winnerVariant ?? null

    useEffect(() => {
        if (isOpen) {
            setSelectedWinner(winnerVariant ?? NO_WINNER)
            setVictoryFactors(initialVictoryFactors)
            setDefeatFactors(initialDefeatFactors)
        }
    }, [isOpen, winnerVariant, initialVictoryFactors, initialDefeatFactors])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setSubmitting(true)
        try {
            await onSubmit(
                selectedWinner === NO_WINNER ? null : selectedWinner,
                victoryFactors.trim(),
                showDefeatFactors ? defeatFactors.trim() : '',
            )
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
                        <label className={styles.label}>勝者バリアント</label>
                        <div className={styles.winnerOptions} role="radiogroup" aria-label="勝者バリアント">
                            {variantOptions.map((v) => (
                                <button
                                    key={v}
                                    type="button"
                                    role="radio"
                                    aria-checked={selectedWinner === v}
                                    className={`${styles.winnerOption} ${selectedWinner === v ? styles.winnerOptionActive : ''}`}
                                    onClick={() => setSelectedWinner(v)}
                                >
                                    {v}
                                    {autoWinner === v && <span className={styles.autoTag}>推奨</span>}
                                </button>
                            ))}
                            <button
                                type="button"
                                role="radio"
                                aria-checked={selectedWinner === NO_WINNER}
                                className={`${styles.winnerOption} ${selectedWinner === NO_WINNER ? styles.winnerOptionActive : ''}`}
                                onClick={() => setSelectedWinner(NO_WINNER)}
                            >
                                判定なし
                            </button>
                        </div>
                        <p className={styles.hint}>
                            数値だけでは測れない要素も踏まえ、実際に採用する勝者を選べます
                            {autoWinner && `（CVR1位は ${autoWinner}）`}
                        </p>
                    </div>
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
