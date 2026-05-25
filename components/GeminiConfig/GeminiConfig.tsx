'use client'

import NeonCheckbox from '@/components/NeonCheckbox'
import type { GeminiConfigProps } from './types'
import styles from './GeminiConfig.module.css'

export default function GeminiConfig({
    enabled,
    onEnabledChange,
}: GeminiConfigProps) {
    return (
        <div className={styles.container}>
            <div className={styles.checkboxContainer}>
                <NeonCheckbox
                    id="ai-enabled"
                    checked={enabled}
                    onChange={onEnabledChange}
                />
                <div className={styles.checkboxContent}>
                    <label htmlFor="ai-enabled" className={styles.checkboxLabel}>
                        AI分析を有効化（API使用制限に注意）
                    </label>
                    <p className={styles.checkboxHelp}>
                        ⚠️ AI APIの使用制限があるため、必要な場合のみ有効化してください
                    </p>
                </div>
            </div>
        </div>
    )
}
