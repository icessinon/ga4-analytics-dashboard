import type { ReactNode } from 'react'
import { ui, cx } from '@/components/ui'

export type AlertTone = 'error' | 'warn' | 'info' | 'success'

export interface AlertProps {
    tone: AlertTone
    /** 見出し。エラーでは本文だけで十分なことが多いので省略可 */
    title?: ReactNode
    children: ReactNode
    /** 右側に置くボタン・リンク（再試行など） */
    action?: ReactNode
    className?: string
}

const TONE_CLASS: Record<AlertTone, string> = {
    error: ui.alertError,
    warn: ui.alertWarn,
    info: ui.alertInfo,
    success: ui.alertSuccess,
}

/** 通知。.error / .notice / .infoBox / .warningBox など 14 種に分かれていた表示を 1 つに */
export default function Alert({ tone, title, children, action, className }: AlertProps) {
    return (
        <div role={tone === 'error' ? 'alert' : 'status'} className={cx(ui.alert, TONE_CLASS[tone], className)}>
            <div className={ui.alertBody}>
                {title && <div className={ui.alertTitle}>{title}</div>}
                {children}
            </div>
            {action}
        </div>
    )
}
