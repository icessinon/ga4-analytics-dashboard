import type { ReactNode } from 'react'
import Loader from '@/components/Loader'
import Alert from '@/components/Alert'
import { ui } from '@/components/ui'
import styles from './LoadState.module.css'

/** 待ち時間の期待値が変わるので、どこから取っているかを文言に添える */
export type DataSource = 'ga4' | 'bq' | 'db' | 'gsc' | 'ai'

const SOURCE_TEXT: Record<DataSource, string> = {
    ga4: 'GA4から取得中...',
    bq: 'BigQueryで集計中...（十数秒かかります）',
    db: '本体DBから集計中...（十数秒かかります）',
    gsc: 'Search Consoleから取得中...',
    ai: 'AIが分析中...',
}

export function loadingTextFor(source?: DataSource, override?: string): string {
    if (override) return override
    return source ? SOURCE_TEXT[source] : '読み込み中...'
}

export interface LoadStateProps {
    loading?: boolean
    error?: string | null
    source?: DataSource
    /** 自由文で上書き。原則 source から生成する（文言が 20 種に分裂した反省） */
    loadingText?: string
    /** 指定時はエラー表示に「再試行」を出す */
    onRetry?: () => void
    /** データが空のときに出す文言。isEmpty が true のときだけ使う */
    empty?: ReactNode
    isEmpty?: boolean
    /** block: 大きな Loader と文言（ページ全体用）。inline: 小さなスピナーと 1 行（カード内用） */
    variant?: 'block' | 'inline'
    /** 正常時に描画する中身。省略時は状態表示だけを担う */
    children?: ReactNode
}

/**
 * 読み込み / エラー / 空 / 正常 を 1 系統で描く。
 * ページ全体の loading で children を隠す用途にも、カード内で一部だけ差し替える用途にも使う。
 */
export default function LoadState({ loading, error, source, loadingText, onRetry, empty, isEmpty, variant = 'block', children }: LoadStateProps) {
    if (loading) {
        const text = loadingTextFor(source, loadingText)
        if (variant === 'inline') {
            return (
                <div className={ui.inlineLoading} role="status" aria-live="polite">
                    <span className={styles.spinner} aria-hidden />
                    {text}
                </div>
            )
        }
        return (
            <div className={ui.loaderBlock} role="status" aria-live="polite">
                <Loader />
                <p className={ui.loaderText}>{text}</p>
            </div>
        )
    }
    if (error) {
        return (
            <Alert
                tone="error"
                action={onRetry && (
                    <button type="button" className={ui.btn} onClick={onRetry}>再試行</button>
                )}
            >
                {error}
            </Alert>
        )
    }
    if (isEmpty && empty) {
        return <p className={ui.empty}>{empty}</p>
    }
    return <>{children}</>
}
