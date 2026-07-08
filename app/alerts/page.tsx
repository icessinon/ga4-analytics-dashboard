'use client'

import { useEffect, useState } from 'react'
import BackLink from '@/components/BackLink'
import { parseJsonResponse } from '@/lib/utils/fetch'
import styles from './AlertSettings.module.css'

interface AlertConfigRow {
    productId: number
    productName: string
    enabled: boolean
    dropThreshold: number
    minSessions: number
    minCv: number
    metrics: string[] | null
}

const METRIC_OPTIONS: Array<{ key: string; label: string }> = [
    { key: 'sessions', label: 'セッション数' },
    { key: 'applyCv', label: '応募CV' },
    { key: 'lpApplyCv', label: 'LP応募CV' },
    { key: 'signupCv', label: '会員登録CV' },
    { key: 'cvr', label: '全体CVR' },
]
const ALL_METRIC_KEYS = METRIC_OPTIONS.map((m) => m.key)

export default function AlertSettingsPage() {
    const [configs, setConfigs] = useState<AlertConfigRow[]>([])
    const [loading, setLoading] = useState(true)
    const [savingId, setSavingId] = useState<number | null>(null)
    const [message, setMessage] = useState<{ productId: number; text: string; isError: boolean } | null>(null)

    useEffect(() => {
        fetch('/api/alerts/config')
            .then((res) => parseJsonResponse<{ configs: AlertConfigRow[] }>(res))
            .then((data) => setConfigs(data.configs ?? []))
            .catch(() => setConfigs([]))
            .finally(() => setLoading(false))
    }, [])

    function update(productId: number, patch: Partial<AlertConfigRow>) {
        setConfigs((prev) => prev.map((c) => (c.productId === productId ? { ...c, ...patch } : c)))
    }

    function toggleMetric(config: AlertConfigRow, key: string) {
        const current = config.metrics ?? ALL_METRIC_KEYS
        const next = current.includes(key) ? current.filter((m) => m !== key) : [...current, key]
        update(config.productId, { metrics: next })
    }

    async function save(config: AlertConfigRow) {
        setSavingId(config.productId)
        setMessage(null)
        try {
            const res = await fetch('/api/alerts/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productId: config.productId,
                    enabled: config.enabled,
                    dropThreshold: config.dropThreshold,
                    minSessions: config.minSessions,
                    minCv: config.minCv,
                    metrics: config.metrics,
                }),
            })
            const data = await parseJsonResponse<{ success?: boolean; error?: string }>(res)
            if (!res.ok) throw new Error(data.error || '保存に失敗しました')
            setMessage({ productId: config.productId, text: '保存しました', isError: false })
        } catch (e) {
            setMessage({ productId: config.productId, text: e instanceof Error ? e.message : '保存に失敗しました', isError: true })
        } finally {
            setSavingId(null)
        }
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>CV急落アラート設定</h1>
                    <p className={styles.subtitle}>
                        毎日 09:30 JST に前日の指標を過去8週の同一曜日の中央値と比較し、しきい値以上下落した場合に Slack に通知します。
                    </p>
                </div>
                <BackLink href="/">ダッシュボード</BackLink>
            </div>

            {loading && <p className={styles.loading}>読み込み中...</p>}
            {!loading && configs.length === 0 && (
                <p className={styles.loading}>GA4プロパティが設定されたプロダクトがありません。</p>
            )}

            {configs.map((config) => {
                const activeMetrics = config.metrics ?? ALL_METRIC_KEYS
                return (
                    <div key={config.productId} className={styles.card}>
                        <div className={styles.cardHeader}>
                            <h2 className={styles.productName}>{config.productName}</h2>
                            <label className={styles.enabledToggle}>
                                <input
                                    type="checkbox"
                                    checked={config.enabled}
                                    onChange={(e) => update(config.productId, { enabled: e.target.checked })}
                                />
                                アラートを有効にする
                            </label>
                        </div>

                        <div className={styles.fieldRow}>
                            <label className={styles.field}>
                                <span className={styles.fieldLabel}>下落しきい値（%）</span>
                                <input
                                    type="number" min={1} max={99} step={1}
                                    className={styles.numberInput}
                                    value={Math.round(config.dropThreshold * 100)}
                                    onChange={(e) => {
                                        const v = Number(e.target.value)
                                        if (v >= 1 && v <= 99) update(config.productId, { dropThreshold: v / 100 })
                                    }}
                                />
                                <span className={styles.fieldHint}>この%以上下落したら通知（デフォルト 30）</span>
                            </label>
                            <label className={styles.field}>
                                <span className={styles.fieldLabel}>最小セッション数</span>
                                <input
                                    type="number" min={0} step={10}
                                    className={styles.numberInput}
                                    value={config.minSessions}
                                    onChange={(e) => update(config.productId, { minSessions: Math.max(0, Number(e.target.value) || 0) })}
                                />
                                <span className={styles.fieldHint}>ベースラインがこの値未満なら判定しない</span>
                            </label>
                            <label className={styles.field}>
                                <span className={styles.fieldLabel}>最小CV数</span>
                                <input
                                    type="number" min={0} step={1}
                                    className={styles.numberInput}
                                    value={config.minCv}
                                    onChange={(e) => update(config.productId, { minCv: Math.max(0, Number(e.target.value) || 0) })}
                                />
                                <span className={styles.fieldHint}>ベースラインがこの値未満なら判定しない</span>
                            </label>
                        </div>

                        <div className={styles.metricsSection}>
                            <span className={styles.fieldLabel}>監視対象指標</span>
                            <div className={styles.metricList}>
                                {METRIC_OPTIONS.map((m) => (
                                    <label key={m.key} className={styles.metricItem}>
                                        <input
                                            type="checkbox"
                                            checked={activeMetrics.includes(m.key)}
                                            onChange={() => toggleMetric(config, m.key)}
                                        />
                                        {m.label}
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className={styles.cardFooter}>
                            {message?.productId === config.productId && (
                                <span className={message.isError ? styles.errorText : styles.successText}>{message.text}</span>
                            )}
                            <button
                                className={styles.saveButton}
                                onClick={() => save(config)}
                                disabled={savingId === config.productId || activeMetrics.length === 0}
                            >
                                {savingId === config.productId ? '保存中...' : '保存'}
                            </button>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
