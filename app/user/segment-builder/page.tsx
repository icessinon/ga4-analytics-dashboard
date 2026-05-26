'use client'

import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useProduct } from '@/lib/contexts/ProductContext'
import DateInput from '@/components/DateInput'
import BackLink from '@/components/BackLink'
import Loader from '@/components/Loader'
import InfoTooltip from '@/components/InfoTooltip/InfoTooltip'
import styles from './SegmentBuilderPage.module.css'

interface Condition {
    id: string
    dimension: string
    operator: 'EXACT' | 'CONTAINS' | 'BEGINS_WITH' | 'NOT_EQUAL'
    value: string
}

interface TotalStats {
    activeUsers: number
    sessions: number
    pageViews: number
    eventCount: number
    avgSessionDuration: number
    engagementRate: number
    bounceRate: number
    newUsers: number
}

interface BreakdownRow {
    name: string
    activeUsers: number
    sessions: number
    pageViews: number
    engagementRate: number
}

interface TrendRow {
    date: string
    activeUsers: number
    sessions: number
}

const DIMENSION_OPTIONS = [
    { value: 'deviceCategory', label: 'デバイス' },
    { value: 'operatingSystem', label: 'OS' },
    { value: 'browser', label: 'ブラウザ' },
    { value: 'country', label: '国' },
    { value: 'languageCode', label: '言語コード (ja / en-us / zh-cn…)' },
    { value: 'sessionSource', label: '流入元 (Source)' },
    { value: 'sessionMedium', label: '流入経路 (Medium)' },
    { value: 'sessionCampaign', label: 'キャンペーン' },
    { value: 'pagePath', label: 'ページパス' },
    { value: 'pageTitle', label: 'ページタイトル' },
    { value: 'customEvent:click_label', label: 'クリックラベル' },
]

const OPERATOR_OPTIONS = [
    { value: 'EXACT', label: '完全一致' },
    { value: 'NOT_EQUAL', label: '一致しない' },
    { value: 'CONTAINS', label: '含む' },
    { value: 'BEGINS_WITH', label: '前方一致' },
]

const PRESET_CONDITIONS: Array<{ label: string; conditions: Omit<Condition, 'id'>[] }> = [
    {
        label: 'スマホ × オーガニック',
        conditions: [
            { dimension: 'deviceCategory', operator: 'EXACT', value: 'mobile' },
            { dimension: 'sessionMedium', operator: 'EXACT', value: 'organic' },
        ],
    },
    {
        label: 'PCユーザー',
        conditions: [{ dimension: 'deviceCategory', operator: 'EXACT', value: 'desktop' }],
    },
    {
        label: '求人詳細閲覧',
        conditions: [{ dimension: 'pagePath', operator: 'CONTAINS', value: '/job/' }],
    },
    {
        label: 'エントリーフォーム到達',
        conditions: [{ dimension: 'pagePath', operator: 'CONTAINS', value: '/entry' }],
    },
    {
        label: '日本在住 外国語ユーザー',
        conditions: [
            { dimension: 'country', operator: 'EXACT', value: 'Japan' },
            { dimension: 'languageCode', operator: 'NOT_EQUAL', value: 'ja' },
        ],
    },
]

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = Math.round(seconds % 60)
    return `${m}分${s}秒`
}

function getDefaultRange() {
    const today = new Date()
    const past = new Date(today)
    past.setDate(today.getDate() - 30)
    const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { startDate: fmt(past), endDate: fmt(today) }
}

let conditionIdCounter = 0
const newConditionId = () => `c-${++conditionIdCounter}`

export default function SegmentBuilderPage() {
    const { currentProduct } = useProduct()
    const { startDate: defaultStart, endDate: defaultEnd } = getDefaultRange()

    const [conditions, setConditions] = useState<Condition[]>([])
    const [startDate, setStartDate] = useState(defaultStart)
    const [endDate, setEndDate] = useState(defaultEnd)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [total, setTotal] = useState<TotalStats | null>(null)
    const [siteTotalUsers, setSiteTotalUsers] = useState<number | null>(null)
    const [breakdowns, setBreakdowns] = useState<Record<string, BreakdownRow[]> | null>(null)
    const [trend, setTrend] = useState<TrendRow[] | null>(null)

    const addCondition = () => {
        setConditions((prev) => [
            ...prev,
            { id: newConditionId(), dimension: 'deviceCategory', operator: 'EXACT', value: '' },
        ])
    }

    const removeCondition = (id: string) => {
        setConditions((prev) => prev.filter((c) => c.id !== id))
    }

    const updateCondition = (id: string, field: keyof Condition, value: string) => {
        setConditions((prev) =>
            prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
        )
    }

    const applyPreset = (preset: typeof PRESET_CONDITIONS[0]) => {
        setConditions(preset.conditions.map((c) => ({ ...c, id: newConditionId() })))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!currentProduct) return
        setLoading(true)
        setError(null)
        setTotal(null)
        setSiteTotalUsers(null)
        setBreakdowns(null)
        setTrend(null)

        try {
            const res = await fetch('/api/user/segment-builder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    propertyId: currentProduct.ga4PropertyId,
                    conditions: conditions.filter((c) => c.value.trim()),
                    startDate,
                    endDate,
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.message || data.error || '取得に失敗しました')

            setTotal(data.total)
            setSiteTotalUsers(data.siteTotalUsers ?? null)
            setBreakdowns(data.breakdowns)
            setTrend(data.trend)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'エラーが発生しました')
        } finally {
            setLoading(false)
        }
    }

    if (!currentProduct) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h1 className={styles.title}>ユーザーリスト抽出</h1>
                    <BackLink href="/user">ユーザー分析に戻る</BackLink>
                </div>
                <div className={styles.warningBox}>
                    プロダクトを選択してください。右上のドロップダウンから選択できます。
                </div>
            </div>
        )
    }

    const maxUsers = total?.activeUsers ?? 0

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>ユーザーリスト抽出</h1>
                    <p className={styles.subtitle}>
                        条件を組み合わせてセグメントを定義し、ユーザー数と行動傾向を確認します
                    </p>
                </div>
                <BackLink href="/user">ユーザー分析に戻る</BackLink>
            </div>

            {/* 条件ビルダー */}
            <div className={styles.section}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>セグメント条件</h2>
                    <div className={styles.presets}>
                        <span className={styles.presetsLabel}>プリセット：</span>
                        {PRESET_CONDITIONS.map((p) => (
                            <button
                                key={p.label}
                                type="button"
                                onClick={() => applyPreset(p)}
                                className={styles.presetBtn}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>

                <form onSubmit={handleSubmit}>
                    {/* 期間 */}
                    <div className={styles.dateRow}>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>開始日</label>
                            <DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)} className={styles.formInput} />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>終了日</label>
                            <DateInput value={endDate} onChange={(e) => setEndDate(e.target.value)} className={styles.formInput} />
                        </div>
                    </div>

                    {/* AND条件リスト */}
                    <div className={styles.conditionList}>
                        {conditions.length === 0 && (
                            <p className={styles.conditionEmpty}>
                                条件なし（全ユーザーが対象）— 「条件を追加」で絞り込めます
                            </p>
                        )}
                        {conditions.map((c, idx) => (
                            <div key={c.id} className={styles.conditionRow}>
                                {idx > 0 && <span className={styles.andBadge}>AND</span>}
                                <select
                                    value={c.dimension}
                                    onChange={(e) => updateCondition(c.id, 'dimension', e.target.value)}
                                    className={styles.conditionSelect}
                                >
                                    {DIMENSION_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                                <select
                                    value={c.operator}
                                    onChange={(e) => updateCondition(c.id, 'operator', e.target.value as Condition['operator'])}
                                    className={styles.conditionSelectSmall}
                                >
                                    {OPERATOR_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                                <input
                                    type="text"
                                    value={c.value}
                                    onChange={(e) => updateCondition(c.id, 'value', e.target.value)}
                                    placeholder="値を入力（例: mobile, organic, /job/...）"
                                    className={styles.conditionInput}
                                />
                                <button
                                    type="button"
                                    onClick={() => removeCondition(c.id)}
                                    className={styles.removeBtn}
                                    title="削除"
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className={styles.formActions}>
                        <button type="button" onClick={addCondition} className={styles.addBtn}>
                            + 条件を追加
                        </button>
                        <button type="submit" disabled={loading} className="executionButton">
                            {loading ? '取得中...' : 'セグメントを分析'}
                        </button>
                    </div>
                </form>
            </div>

            {error && (
                <div className={styles.errorBox}>
                    <p className={styles.errorTitle}>エラー</p>
                    <p>{error}</p>
                </div>
            )}

            {loading && (
                <div className={styles.loaderContainer}>
                    <Loader />
                    <span>セグメントデータを取得中...</span>
                </div>
            )}

            {total && !loading && (
                <>
                    {/* サマリーカード */}
                    <div className={styles.section}>
                        <h2 className={styles.sectionTitle}>セグメント集計</h2>
                        {siteTotalUsers !== null && siteTotalUsers > 0 && (
                            <div className={styles.coverageBar}>
                                <div className={styles.coverageBarTrack}>
                                    <div
                                        className={styles.coverageBarFill}
                                        style={{ width: `${Math.min(100, (total.activeUsers / siteTotalUsers) * 100).toFixed(1)}%` }}
                                    />
                                </div>
                                <span className={styles.coverageLabel}>
                                    全体の <strong>{((total.activeUsers / siteTotalUsers) * 100).toFixed(1)}%</strong>
                                    &nbsp;（全ユーザー {siteTotalUsers.toLocaleString()} 人中 {total.activeUsers.toLocaleString()} 人）
                                    <InfoTooltip text="条件なし（全ユーザー）クエリとの比較。セグメントのアクティブユーザー ÷ サイト全体のアクティブユーザーで算出。" direction="bottom" />
                                </span>
                            </div>
                        )}
                        <div className={styles.summaryGrid}>
                            <div className={styles.summaryCard}>
                                <p className={styles.summaryLabel}>ユーザー数<InfoTooltip text="条件に一致したアクティブユーザー数（GA4: activeUsers）。" /></p>
                                <p className={styles.summaryValue}>{total.activeUsers.toLocaleString()}</p>
                                {siteTotalUsers !== null && siteTotalUsers > 0 && (
                                    <p className={styles.summaryMeta}>
                                        全体の {((total.activeUsers / siteTotalUsers) * 100).toFixed(1)}%
                                    </p>
                                )}
                            </div>
                            <div className={styles.summaryCard}>
                                <p className={styles.summaryLabel}>新規ユーザー<InfoTooltip text="対象期間内に初めてサイトを訪問したユーザー数。括弧内はユーザー数に占める割合。" /></p>
                                <p className={styles.summaryValue}>{total.newUsers.toLocaleString()}</p>
                                <p className={styles.summaryMeta}>
                                    {total.activeUsers > 0 ? `${((total.newUsers / total.activeUsers) * 100).toFixed(1)}%` : '-'}
                                </p>
                            </div>
                            <div className={styles.summaryCard}>
                                <p className={styles.summaryLabel}>セッション数</p>
                                <p className={styles.summaryValue}>{total.sessions.toLocaleString()}</p>
                            </div>
                            <div className={styles.summaryCard}>
                                <p className={styles.summaryLabel}>PV数</p>
                                <p className={styles.summaryValue}>{total.pageViews.toLocaleString()}</p>
                            </div>
                            <div className={styles.summaryCard}>
                                <p className={styles.summaryLabel}>PV/セッション<InfoTooltip text="1セッションあたりの平均ページビュー数（pageViews ÷ sessions）。コンテンツの回遊度を示す指標。" /></p>
                                <p className={styles.summaryValue}>
                                    {total.sessions > 0 ? (total.pageViews / total.sessions).toFixed(1) : '-'}
                                </p>
                            </div>
                            <div className={styles.summaryCard}>
                                <p className={styles.summaryLabel}>平均滞在時間<InfoTooltip text="1セッションあたりの平均滞在時間（GA4: averageSessionDuration）。最後のページの時間は含まれない。" /></p>
                                <p className={styles.summaryValue}>{formatDuration(total.avgSessionDuration)}</p>
                            </div>
                            <div className={styles.summaryCard}>
                                <p className={styles.summaryLabel}>エンゲージメント率<InfoTooltip text="エンゲージドセッション ÷ 全セッション。10秒以上滞在 or 2PV以上 or CV発生したセッションを「エンゲージド」とみなす。" /></p>
                                <p className={styles.summaryValue}>{(total.engagementRate * 100).toFixed(1)}%</p>
                            </div>
                            <div className={styles.summaryCard}>
                                <p className={styles.summaryLabel}>直帰率<InfoTooltip text="1ページのみ閲覧してサイトを離れたセッションの割合。GA4の直帰率＝エンゲージメントしなかったセッション ÷ 全セッション。" /></p>
                                <p className={styles.summaryValue}>{(total.bounceRate * 100).toFixed(1)}%</p>
                            </div>
                        </div>
                    </div>

                    {/* ブレイクダウン */}
                    {breakdowns && (
                        <div className={styles.section}>
                            <h2 className={styles.sectionTitle}>内訳</h2>
                            <div className={styles.breakdownGrid}>
                                {Object.entries(breakdowns).map(([label, rows]) => (
                                    <div key={label} className={styles.breakdownCard}>
                                        <p className={styles.breakdownTitle}>{label}別</p>
                                        {rows.length === 0 ? (
                                            <p className={styles.breakdownEmpty}>データなし</p>
                                        ) : (
                                            <div className={styles.breakdownList}>
                                                {rows.map((row) => (
                                                    <div key={row.name} className={styles.breakdownRow}>
                                                        <div className={styles.breakdownNameCol}>
                                                            <span className={styles.breakdownName}>{row.name}</span>
                                                            <div className={styles.breakdownBar}>
                                                                <div
                                                                    className={styles.breakdownBarFill}
                                                                    style={{ width: `${maxUsers > 0 ? (row.activeUsers / maxUsers) * 100 : 0}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                        <span className={styles.breakdownUsers}>
                                                            {row.activeUsers.toLocaleString()}人
                                                        </span>
                                                        <span className={styles.breakdownEngagement}>
                                                            EG {(row.engagementRate * 100).toFixed(0)}%
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 日別トレンド */}
                    {trend && trend.length > 0 && (
                        <div className={styles.section}>
                            <h2 className={styles.sectionTitle}>日別推移</h2>
                            <div className={styles.trendChartWrapper}>
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                        <XAxis
                                            dataKey="date"
                                            tick={{ fontSize: 11, fill: '#6b7280' }}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(v: string) => {
                                                const p = v.split('-')
                                                return `${parseInt(p[1])}/${parseInt(p[2])}`
                                            }}
                                            interval={Math.max(0, Math.floor(trend.length / 8) - 1)}
                                        />
                                        <YAxis
                                            tick={{ fontSize: 11, fill: '#6b7280' }}
                                            tickLine={false}
                                            axisLine={false}
                                            width={44}
                                            tickFormatter={(v: number) =>
                                                v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                                            }
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(99,102,241,0.1)' }}
                                            content={({ active, payload }) => {
                                                if (!active || !payload?.length) return null
                                                const d = payload[0]?.payload as TrendRow
                                                return (
                                                    <div className={styles.trendTooltip}>
                                                        <p className={styles.trendTooltipDate}>{d.date}</p>
                                                        <p className={styles.trendTooltipRow}>
                                                            <span>ユーザー</span>
                                                            <span className={styles.trendTooltipVal}>{d.activeUsers.toLocaleString()}人</span>
                                                        </p>
                                                        <p className={styles.trendTooltipRow}>
                                                            <span>セッション</span>
                                                            <span>{d.sessions.toLocaleString()}</span>
                                                        </p>
                                                    </div>
                                                )
                                            }}
                                        />
                                        <Bar dataKey="activeUsers" fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={20} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
