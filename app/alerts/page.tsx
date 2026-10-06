'use client'

import { useState } from 'react'
import PageShell from '@/components/PageShell'
import Alert from '@/components/Alert'
import { ui, cx } from '@/components/ui'
import { useReport } from '@/hooks/useReport'
import { fetchJson } from '@/lib/utils/fetch'
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
    { key: 'pageSegments', label: 'ページカテゴリ別の急増・急落（求人詳細・検索/一覧・TOP・コラム・各フォーム）' },
    { key: 'cvChannelSegments', label: 'CV種別×チャネル別の急増・急落（例: 会員登録CV×Organic Search）' },
]
const ALL_METRIC_KEYS = METRIC_OPTIONS.map((m) => m.key)

function ConfigCard({ initial }: { initial: AlertConfigRow }) {
    const [config, setConfig] = useState(initial)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null)
    const activeMetrics = config.metrics ?? ALL_METRIC_KEYS

    const update = (patch: Partial<AlertConfigRow>) => setConfig((c) => ({ ...c, ...patch }))
    const toggleMetric = (key: string) => {
        const next = activeMetrics.includes(key) ? activeMetrics.filter((m) => m !== key) : [...activeMetrics, key]
        update({ metrics: next })
    }

    async function save() {
        setSaving(true)
        setMessage(null)
        try {
            await fetchJson('/api/alerts/config', {
                method: 'PUT',
                body: JSON.stringify({
                    productId: config.productId,
                    enabled: config.enabled,
                    dropThreshold: config.dropThreshold,
                    minSessions: config.minSessions,
                    minCv: config.minCv,
                    metrics: config.metrics,
                }),
            })
            setMessage({ text: '保存しました', isError: false })
        } catch (e) {
            setMessage({ text: e instanceof Error ? e.message : '保存に失敗しました', isError: true })
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className={ui.card}>
            <div className={styles.cardHeader}>
                <h2 className={ui.sectionTitle}>{config.productName}</h2>
                <label className={styles.toggle}>
                    <input type="checkbox" checked={config.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
                    アラートを有効にする
                </label>
            </div>

            <div className={styles.fieldRow}>
                <label className={styles.field}>
                    <span className={styles.fieldLabel}>下落しきい値（%）</span>
                    <input
                        type="number" min={1} max={99} step={1} className={cx(ui.input, styles.numberInput)}
                        value={Math.round(config.dropThreshold * 100)}
                        onChange={(e) => { const v = Number(e.target.value); if (v >= 1 && v <= 99) update({ dropThreshold: v / 100 }) }}
                    />
                    <span className={styles.fieldHint}>この%以上下落したら通知（デフォルト 30）</span>
                </label>
                <label className={styles.field}>
                    <span className={styles.fieldLabel}>最小セッション数</span>
                    <input
                        type="number" min={0} step={10} className={cx(ui.input, styles.numberInput)}
                        value={config.minSessions}
                        onChange={(e) => update({ minSessions: Math.max(0, Number(e.target.value) || 0) })}
                    />
                    <span className={styles.fieldHint}>ベースラインがこの値未満なら判定しない</span>
                </label>
                <label className={styles.field}>
                    <span className={styles.fieldLabel}>最小CV数</span>
                    <input
                        type="number" min={0} step={1} className={cx(ui.input, styles.numberInput)}
                        value={config.minCv}
                        onChange={(e) => update({ minCv: Math.max(0, Number(e.target.value) || 0) })}
                    />
                    <span className={styles.fieldHint}>ベースラインがこの値未満なら判定しない</span>
                </label>
            </div>

            <div className={styles.metricsSection}>
                <span className={styles.fieldLabel}>監視対象指標</span>
                <div className={styles.metricList}>
                    {METRIC_OPTIONS.map((m) => (
                        <label key={m.key} className={styles.metricItem}>
                            <input type="checkbox" checked={activeMetrics.includes(m.key)} onChange={() => toggleMetric(m.key)} />
                            {m.label}
                        </label>
                    ))}
                </div>
                {activeMetrics.length === 0 && <span className={styles.fieldHint}>監視対象を 1 つ以上選んでください</span>}
            </div>

            <div className={styles.cardFooter}>
                {message && <span className={message.isError ? styles.errorText : styles.successText}>{message.text}</span>}
                <button type="button" className={ui.btnPrimary} onClick={save} disabled={saving || activeMetrics.length === 0}>
                    {saving ? '保存中...' : '保存'}
                </button>
            </div>
        </div>
    )
}

export default function AlertSettingsPage() {
    const report = useReport<{ configs: AlertConfigRow[] }>('/api/alerts/config')
    const configs = report.data?.configs ?? []

    return (
        <PageShell pageId="alerts" status={{ loading: report.loading, error: report.error, source: 'db', onRetry: report.run }}>
            <Alert tone="info" title="判定の仕組み">
                毎日 09:30 JST に前日の指標を過去 8 週の同一曜日の中央値と比較し、しきい値以上下落した場合に Slack に通知します。
                セグメント監視（ページカテゴリ別・CV×チャネル別）は下落に加えて急増（+50% 以上、環境変数 CV_SPIKE_ALERT_THRESHOLD で変更可）も通知します。
                % しきい値に加えて統計ガード（中央値からポアソン 3σ 以上の乖離）を必須にしているため、件数が小さい指標・セグメントの日次ゆらぎでは発火しません。
            </Alert>

            {report.data && configs.length === 0 && (
                <p className={ui.empty}>GA4 プロパティが設定されたプロダクトがありません。</p>
            )}
            {configs.map((config) => <ConfigCard key={config.productId} initial={config} />)}
        </PageShell>
    )
}
