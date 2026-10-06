'use client'

import type { ReactNode } from 'react'
import styles from './FilterBar.module.css'

export interface FilterBarProps {
    /** 指定時は <form> になり、右端に送信ボタンを出す（分析実行ボタン型のページ） */
    onSubmit?: () => void
    submitLabel?: string
    /** 取得中はボタンを「取得中...」にして無効化 */
    submitting?: boolean
    /** プロダクト未選択など */
    disabled?: boolean
    children: ReactNode
}

/**
 * 期間・ゴール・デバイスなど複数のフィルタを 1 行に並べる受け皿。
 * 自動取得型（PeriodSelect だけ）のページには不要で、PageShell の controls に PeriodSelect を直接置く。
 */
export default function FilterBar({ onSubmit, submitLabel = '分析実行', submitting, disabled, children }: FilterBarProps) {
    if (!onSubmit) {
        return <div className={styles.bar}>{children}</div>
    }
    return (
        <form
            className={styles.bar}
            onSubmit={(e) => {
                e.preventDefault()
                onSubmit()
            }}
        >
            {children}
            {/* 「実行」の見た目は globals.css の executionButton（既存ページで使われている紫のボタン）に揃える */}
            <button type="submit" className={`executionButton ${styles.submit}`} disabled={disabled || submitting}>
                <span>{submitting ? '取得中...' : submitLabel}</span>
            </button>
        </form>
    )
}

export interface FilterFieldProps {
    label: string
    hint?: string
    children: ReactNode
}

export function FilterField({ label, hint, children }: FilterFieldProps) {
    return (
        <div className={styles.field}>
            <span className={styles.fieldLabel}>{label}</span>
            <div className={styles.fieldControl}>{children}</div>
            {hint && <span className={styles.fieldHint}>{hint}</span>}
        </div>
    )
}
