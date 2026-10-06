'use client'

import type { SwitchProps } from './types'
import styles from './Switch.module.css'

export default function Switch({
    checked,
    onChange,
    id,
    className = '',
    'aria-label': ariaLabel,
}: SwitchProps) {
    return (
        <label className={`${styles.switch} ${className}`.trim()} title={checked ? '非表示にする' : '表示する'}>
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                id={id}
                aria-label={ariaLabel ?? (checked ? '非表示' : '表示')}
            />
            <span className={styles.slider} />
        </label>
    )
}
