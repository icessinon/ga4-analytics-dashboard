'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './InfoTooltip.module.css'

interface Props {
    text: string
    direction?: 'top' | 'bottom'
}

export default function InfoTooltip({ text, direction = 'top' }: Props) {
    const iconRef = useRef<HTMLElement>(null)
    const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null)
    const [mounted, setMounted] = useState(false)

    useEffect(() => { setMounted(true) }, [])

    const show = useCallback(() => {
        if (!iconRef.current) return
        const r = iconRef.current.getBoundingClientRect()
        const left = r.left + r.width / 2
        if (direction === 'bottom') {
            setPos({ top: r.bottom + 8, left })
        } else {
            setPos({ bottom: window.innerHeight - r.top + 8, left })
        }
    }, [direction])

    const hide = useCallback(() => setPos(null), [])

    return (
        <span className={styles.wrap}>
            <i
                ref={iconRef}
                className={`${styles.icon} ${pos ? styles.iconActive : ''}`}
                onMouseEnter={show}
                onMouseLeave={hide}
            >
                i
            </i>
            {mounted && pos && createPortal(
                <span
                    className={`${styles.popup} ${direction === 'bottom' ? styles.popupBottom : ''}`}
                    style={{
                        position: 'fixed',
                        top: pos.top,
                        bottom: pos.bottom,
                        left: pos.left,
                        transform: 'translateX(-50%)',
                        zIndex: 9999,
                    }}
                >
                    {text}
                </span>,
                document.body
            )}
        </span>
    )
}
