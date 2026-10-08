'use client'

import type { ReactNode } from 'react'
import { ui, cx } from '@/components/ui'
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
            {/*
             * 送信ボタンは他のボタンと同じ大きさ・質感（ui.btnPrimary）。
             * ラベル分の空きを持つ field で包むことで、ヒントの有無でフィールドごとに高さが
             * 変わっても、他のコントロールと同じ行に揃う（以前は上下にずれていた）。
             */}
            <div className={cx(styles.field, styles.submitField)}>
                <span className={styles.fieldLabel} aria-hidden="true">&nbsp;</span>
                <button type="submit" className={ui.btnPrimary} disabled={disabled || submitting}>
                    {submitting ? '取得中...' : submitLabel}
                </button>
            </div>
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
