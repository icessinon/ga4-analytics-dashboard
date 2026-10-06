'use client'

import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useProduct } from '@/contexts/ProductContext'
import InfoTooltip from '@/components/InfoTooltip'
import PageShell from '@/components/PageShell'
import FilterBar, { FilterField } from '@/components/FilterBar'
import PeriodSelect from '@/components/PeriodSelect'
import { ui, cx } from '@/components/ui'
import { usePeriodRange } from '@/hooks/usePeriodRange'
import { useReport } from '@/hooks/useReport'
import { CHART_COLORS } from '@/lib/constants/chartColors'
import type { SegmentBuilderResponse, SegmentOperator, SegmentTrendRow } from '@/lib/services/user/segmentBuilderTypes'
import styles from './SegmentBuilderPage.module.css'

interface Condition {
    id: string
    dimension: string
    operator: SegmentOperator
    value: string
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

const OPERATOR_OPTIONS: Array<{ value: SegmentOperator; label: string }> = [
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
    { label: 'PCユーザー', conditions: [{ dimension: 'deviceCategory', operator: 'EXACT', value: 'desktop' }] },
    { label: '求人詳細閲覧', conditions: [{ dimension: 'pagePath', operator: 'CONTAINS', value: '/job/' }] },
    { label: 'エントリーフォーム到達', conditions: [{ dimension: 'pagePath', operator: 'CONTAINS', value: '/entry' }] },
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

let conditionIdCounter = 0
const newConditionId = () => `c-${++conditionIdCounter}`

const AXIS_TICK = { fontSize: 11, fill: 'var(--text-muted)' }

export default function SegmentBuilderPage() {
    const { currentProduct } = useProduct()
    const periodState = usePeriodRange('30daysAgo')
    const { range } = periodState
    const [conditions, setConditions] = useState<Condition[]>([])

    // GA4 を最大 9 回叩くので手動実行のまま
    const report = useReport<SegmentBuilderResponse>('/api/user/segment-builder', {
        body: {
            propertyId: currentProduct?.ga4PropertyId,
            conditions: conditions.filter((c) => c.value.trim()).map(({ dimension, operator, value }) => ({ dimension, operator, value })),
            startDate: range?.startDate,
            endDate: range?.endDate,
        },
        manual: true,
    })
    const total = report.data?.total ?? null
    const siteTotalUsers = report.data?.siteTotalUsers ?? null
    const breakdowns = report.data?.breakdowns ?? null
    const trend = report.data?.trend ?? null

    const addCondition = () => {
        setConditions((prev) => [...prev, { id: newConditionId(), dimension: 'deviceCategory', operator: 'EXACT', value: '' }])
    }
    const removeCondition = (id: string) => setConditions((prev) => prev.filter((c) => c.id !== id))
    const updateCondition = (id: string, field: keyof Condition, value: string) => {
        setConditions((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)))
    }
    const applyPreset = (preset: typeof PRESET_CONDITIONS[0]) => {
        setConditions(preset.conditions.map((c) => ({ ...c, id: newConditionId() })))
    }

    const maxUsers = total?.activeUsers ?? 0

    return (
        <PageShell
            pageId="userSegmentBuilder"
            requireProduct
            status={{ loading: report.loading, error: report.error, source: 'ga4', onRetry: report.run }}
            controls={
                <div className={ui.card}>
                    <div className={styles.sectionHeader}>
                        <h2 className={ui.sectionTitle} style={{ marginBottom: 0 }}>セグメント条件</h2>
                        <div className={styles.presets}>
                            <span className={styles.presetsLabel}>プリセット：</span>
                            {PRESET_CONDITIONS.map((p) => (
                                <button key={p.label} type="button" onClick={() => applyPreset(p)} className={styles.presetBtn}>
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className={styles.conditionList}>
                        {conditions.length === 0 && (
                            <p className={styles.conditionEmpty}>条件なし（全ユーザーが対象）— 「条件を追加」で絞り込めます</p>
                        )}
                        {conditions.map((c, idx) => (
                            <div key={c.id} className={styles.conditionRow}>
                                {idx > 0 && <span className={styles.andBadge}>AND</span>}
                                <select
                                    value={c.dimension}
                                    onChange={(e) => updateCondition(c.id, 'dimension', e.target.value)}
                                    className={cx(ui.select, styles.conditionSelect)}
                                    aria-label="ディメンション"
                                >
                                    {DIMENSION_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                                <select
                                    value={c.operator}
                                    onChange={(e) => updateCondition(c.id, 'operator', e.target.value)}
                                    className={cx(ui.select, styles.conditionSelectSmall)}
                                    aria-label="演算子"
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
                                <button type="button" onClick={() => removeCondition(c.id)} className={styles.removeBtn} title="削除" aria-label="条件を削除">
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>

                    <FilterBar onSubmit={() => report.run()} submitLabel="セグメントを分析" submitting={report.loading} disabled={!currentProduct || !range}>
                        <FilterField label="期間">
                            <PeriodSelect state={periodState} />
                        </FilterField>
                        <button type="button" onClick={addCondition} className={ui.btnGhost}>+ 条件を追加</button>
                    </FilterBar>
                </div>
            }
        >
            {total && (
                <>
                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>セグメント集計</h2>
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
                        <div className={ui.summaryRow}>
                            <div className={ui.summaryCard}>
                                <p className={ui.summaryLabel}>ユーザー数<InfoTooltip text="条件に一致したアクティブユーザー数（GA4: activeUsers）。" /></p>
                                <p className={ui.summaryValue}>{total.activeUsers.toLocaleString()}</p>
                                {siteTotalUsers !== null && siteTotalUsers > 0 && (
                                    <p className={ui.summaryHint}>全体の {((total.activeUsers / siteTotalUsers) * 100).toFixed(1)}%</p>
                                )}
                            </div>
                            <div className={ui.summaryCard}>
                                <p className={ui.summaryLabel}>新規ユーザー<InfoTooltip text="対象期間内に初めてサイトを訪問したユーザー数。括弧内はユーザー数に占める割合。" /></p>
                                <p className={ui.summaryValue}>{total.newUsers.toLocaleString()}</p>
                                <p className={ui.summaryHint}>{total.activeUsers > 0 ? `${((total.newUsers / total.activeUsers) * 100).toFixed(1)}%` : '-'}</p>
                            </div>
                            <div className={ui.summaryCard}>
                                <p className={ui.summaryLabel}>セッション数</p>
                                <p className={ui.summaryValue}>{total.sessions.toLocaleString()}</p>
                            </div>
                            <div className={ui.summaryCard}>
                                <p className={ui.summaryLabel}>PV数</p>
                                <p className={ui.summaryValue}>{total.pageViews.toLocaleString()}</p>
                            </div>
                            <div className={ui.summaryCard}>
                                <p className={ui.summaryLabel}>PV/セッション<InfoTooltip text="1セッションあたりの平均ページビュー数（pageViews ÷ sessions）。コンテンツの回遊度を示す指標。" /></p>
                                <p className={ui.summaryValue}>{total.sessions > 0 ? (total.pageViews / total.sessions).toFixed(1) : '-'}</p>
                            </div>
                            <div className={ui.summaryCard}>
                                <p className={ui.summaryLabel}>平均滞在時間<InfoTooltip text="1セッションあたりの平均滞在時間（GA4: averageSessionDuration）。最後のページの時間は含まれない。" /></p>
                                <p className={ui.summaryValue}>{formatDuration(total.avgSessionDuration)}</p>
                            </div>
                            <div className={ui.summaryCard}>
                                <p className={ui.summaryLabel}>エンゲージメント率<InfoTooltip text="エンゲージドセッション ÷ 全セッション。10秒以上滞在 or 2PV以上 or CV発生したセッションを「エンゲージド」とみなす。" /></p>
                                <p className={ui.summaryValue}>{(total.engagementRate * 100).toFixed(1)}%</p>
                            </div>
                            <div className={ui.summaryCard}>
                                <p className={ui.summaryLabel}>直帰率<InfoTooltip text="1ページのみ閲覧してサイトを離れたセッションの割合。GA4の直帰率＝エンゲージメントしなかったセッション ÷ 全セッション。" /></p>
                                <p className={ui.summaryValue}>{(total.bounceRate * 100).toFixed(1)}%</p>
                            </div>
                        </div>
                    </div>

                    {breakdowns && (
                        <div className={ui.card}>
                            <h2 className={ui.sectionTitle}>内訳</h2>
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
                                                                <div className={styles.breakdownBarFill} style={{ width: `${maxUsers > 0 ? (row.activeUsers / maxUsers) * 100 : 0}%` }} />
                                                            </div>
                                                        </div>
                                                        <span className={styles.breakdownUsers}>{row.activeUsers.toLocaleString()}人</span>
                                                        <span className={styles.breakdownEngagement}>EG {(row.engagementRate * 100).toFixed(0)}%</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {trend && trend.length > 0 && (
                        <div className={ui.card}>
                            <h2 className={ui.sectionTitle}>日別推移</h2>
                            <div className={styles.trendChartWrapper}>
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                                        <XAxis
                                            dataKey="date"
                                            tick={AXIS_TICK}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(v: string) => { const p = v.split('-'); return `${parseInt(p[1])}/${parseInt(p[2])}` }}
                                            interval={Math.max(0, Math.floor(trend.length / 8) - 1)}
                                        />
                                        <YAxis
                                            tick={AXIS_TICK}
                                            tickLine={false}
                                            axisLine={false}
                                            width={44}
                                            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                                            content={({ active, payload }) => {
                                                if (!active || !payload?.length) return null
                                                const d = payload[0]?.payload as SegmentTrendRow
                                                return (
                                                    <div className={styles.trendTooltip}>
                                                        <p className={styles.trendTooltipDate}>{d.date}</p>
                                                        <p className={styles.trendTooltipRow}><span>ユーザー</span><span className={styles.trendTooltipVal}>{d.activeUsers.toLocaleString()}人</span></p>
                                                        <p className={styles.trendTooltipRow}><span>セッション</span><span>{d.sessions.toLocaleString()}</span></p>
                                                    </div>
                                                )
                                            }}
                                        />
                                        <Bar dataKey="activeUsers" fill={CHART_COLORS.violet} radius={[3, 3, 0, 0]} maxBarSize={20} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}
                </>
            )}
        </PageShell>
    )
}
