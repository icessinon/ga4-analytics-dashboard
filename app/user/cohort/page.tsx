'use client'

import { useMemo, useState } from 'react'
import InfoTooltip from '@/components/InfoTooltip'
import PageShell from '@/components/PageShell'
import FilterBar, { FilterField } from '@/components/FilterBar'
import PeriodSelect from '@/components/PeriodSelect'
import { ui } from '@/components/ui'
import { usePeriodRange } from '@/hooks/usePeriodRange'
import { useReport } from '@/hooks/useReport'
import { CHART_SERIES } from '@/lib/constants/chartColors'
import { useProduct } from '@/lib/contexts/ProductContext'
import type { CohortResponse } from '@/lib/services/user/cohortTypes'
import styles from './CohortPage.module.css'

interface AbTestMarker {
    id: number
    name: string
    startDate: string
    endDate: string | null
    status: string
    winnerVariant: string | null
}

function markerColor(i: number) { return CHART_SERIES[i % CHART_SERIES.length] }

// テスト期間がコホート週 [weekStart, weekStart+6日] と重なるか
function overlapsWeek(test: AbTestMarker, weekStart: string): boolean {
    const ws = new Date(weekStart).getTime()
    const we = ws + 6 * 24 * 60 * 60 * 1000
    const ts = new Date(test.startDate).getTime()
    const te = test.endDate ? new Date(test.endDate).getTime() : Infinity
    return ts <= we && te >= ws
}

// "2026-05-04" → "5/4〜5/10"
function weekRangeLabel(weekStart: string): string {
    const start = new Date(weekStart)
    const end = new Date(weekStart)
    end.setDate(end.getDate() + 6)
    const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
    return `${fmt(start)}〜${fmt(end)}`
}

// 継続率に応じた背景色（緑系グラデーション）
function cellBg(rate: number, isWeek0: boolean): string {
    if (isWeek0) return 'rgba(99,102,241,0.5)'
    if (rate <= 0) return 'rgba(255,255,255,0.03)'
    const intensity = Math.min(rate, 1)
    // 0% → 暗め青, 50% → 緑, 100% → 明るい緑
    const r = Math.round(16 + (34 - 16) * intensity)
    const g = Math.round(185 * intensity)
    const b = Math.round(129 * intensity * 0.5)
    return `rgba(${r},${g},${b},${0.15 + intensity * 0.55})`
}

export default function CohortPage() {
    const { currentProduct } = useProduct()
    // 旧実装の既定は今日までの 77 日（約 11 週）。プリセットでは 90 日が最も近い
    const periodState = usePeriodRange('90daysAgo')
    const range = periodState.range
    const [periods, setPeriods] = useState(6)
    const periodsOk = Number.isInteger(periods) && periods >= 1 && periods <= 12

    const report = useReport<CohortResponse>('/api/user/cohort', {
        body: { propertyId: currentProduct?.ga4PropertyId, startDate: range?.startDate, endDate: range?.endDate, periods },
        enabled: !!currentProduct && !!range && periodsOk,
    })
    const cohorts = report.data?.cohorts ?? null
    const maxPeriods = report.data?.maxPeriods ?? periods

    // 期間中に走っていた AB テストをコホート週に印として出す（取れなくても本体には影響させない）
    const abList = useReport<{ abTests?: Array<{ id: number; name: string; startDate: string; endDate: string | null; status: string; winnerVariant?: string | null }> }>(
        `/api/ab-test?productId=${currentProduct?.id ?? ''}&limit=50`,
        { enabled: !!currentProduct },
    )
    const abTests = useMemo<AbTestMarker[]>(() => {
        if (!range || !abList.data?.abTests) return []
        const rangeStart = new Date(range.startDate).getTime()
        const rangeEnd = new Date(range.endDate).getTime()
        return abList.data.abTests
            .map((t) => ({ id: t.id, name: t.name, startDate: t.startDate, endDate: t.endDate, status: t.status, winnerVariant: t.winnerVariant ?? null }))
            .filter((t) => {
                const ts = new Date(t.startDate).getTime()
                const te = t.endDate ? new Date(t.endDate).getTime() : Infinity
                return ts <= rangeEnd && te >= rangeStart
            })
    }, [abList.data, range])

    return (
        <PageShell
            pageId="userCohort"
            requireProduct
            status={{ loading: report.loading, error: report.error, source: 'ga4', onRetry: report.run }}
            controls={
                <div className={ui.card}>
                    <FilterBar>
                        <FilterField label="期間（初回訪問）">
                            <PeriodSelect state={periodState} />
                        </FilterField>
                        <FilterField label={`追跡週数（Week 0〜${periodsOk ? periods : '?'}）`} hint={periodsOk ? undefined : '1〜12 で指定'}>
                            <input
                                type="number"
                                min={1}
                                max={12}
                                value={Number.isNaN(periods) ? '' : periods}
                                onChange={(e) => setPeriods(e.target.valueAsNumber)}
                                className={styles.periodsInput}
                            />
                        </FilterField>
                    </FilterBar>
                </div>
            }
        >
            {cohorts && (
                <div className={ui.card}>
                    <div className={styles.resultHeader}>
                        <p className={ui.sectionTitle} style={{ marginBottom: 0 }}>リテンションマトリクス（週次）<InfoTooltip text="初回訪問週（コホート）ごとに、その後の週にどれだけのユーザーが戻ってきたかを示す。Week 0 = 初回訪問週（100%固定）。" direction="bottom" /></p>
                        <p className={ui.note}>{cohorts.length} コホート</p>
                    </div>

                    <div className={styles.legend}>
                        <span>リテンション率：</span>
                        <div className={styles.legendBar}>
                            {[0, 10, 25, 50, 75, 100].map((pct) => (
                                <div key={pct} className={styles.legendItem}>
                                    <div className={styles.legendSwatch} style={{ backgroundColor: cellBg(pct / 100, false) }} />
                                    <span>{pct}%</span>
                                </div>
                            ))}
                        </div>
                        <span className={styles.legendWeek0}>／ <span className={styles.legendWeek0Swatch}>■</span> Week 0（初回訪問週）</span>
                    </div>

                    {abTests.length > 0 && (
                        <div className={styles.abBox}>
                            <span className={styles.abBoxTitle}>期間中の施策（ABテスト）：</span>
                            {abTests.map((t, ti) => (
                                <span key={t.id} className={styles.abItem}>
                                    <span className={styles.abDot} style={{ background: markerColor(ti) }} />
                                    {t.name}
                                    <span className={styles.abMeta}>
                                        （{new Date(t.startDate).toLocaleDateString('ja-JP')}〜{t.endDate ? new Date(t.endDate).toLocaleDateString('ja-JP') : '継続中'}
                                        {t.winnerVariant ? `・勝者${t.winnerVariant}` : ''}）
                                    </span>
                                </span>
                            ))}
                            <p className={styles.abMeta}>
                                ●が付いた初回訪問週のコホートは施策実施中に流入したユーザーです。施策前後のコホートでリテンション率を比較できます。
                            </p>
                        </div>
                    )}

                    {cohorts.length === 0 ? (
                        <p className={ui.empty}>データがありません。期間を広げて再試行してください。</p>
                    ) : (
                        <div className={ui.tableWrap}>
                            <table className={styles.cohortTable}>
                                <thead>
                                    <tr>
                                        <th>初回訪問週</th>
                                        {Array.from({ length: maxPeriods + 1 }, (_, i) => (
                                            <th key={i}>Week {i}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {cohorts.map((row) => (
                                        <tr key={row.cohortName}>
                                            <td className={styles.rowLabel}>
                                                <div className={styles.rowLabelInner}>
                                                    <span className={styles.rowWeekLabel}>
                                                        {weekRangeLabel(row.weekStart)}
                                                        {abTests.map((t, ti) => overlapsWeek(t, row.weekStart) && (
                                                            <span key={t.id} title={`施策実施中: ${t.name}`} className={styles.abDotInline} style={{ background: markerColor(ti) }} />
                                                        ))}
                                                    </span>
                                                    {row.weeks[0] && (
                                                        <span className={styles.rowTotalLabel}>{row.weeks[0].totalUsers.toLocaleString()} ユーザー</span>
                                                    )}
                                                </div>
                                            </td>
                                            {Array.from({ length: maxPeriods + 1 }, (_, week) => {
                                                const d = row.weeks[week]
                                                const isWeek0 = week === 0
                                                if (!d) {
                                                    return (
                                                        <td key={week} className={styles.cell} style={{ backgroundColor: 'transparent' }}>
                                                            <span className={styles.cellEmpty}>–</span>
                                                        </td>
                                                    )
                                                }
                                                return (
                                                    <td
                                                        key={week}
                                                        className={styles.cell}
                                                        style={{ backgroundColor: cellBg(d.rate, isWeek0) }}
                                                        title={`${row.label} / Week ${week}: ${d.activeUsers.toLocaleString()} ユーザー (${(d.rate * 100).toFixed(1)}%)`}
                                                    >
                                                        <div className={styles.cellInner}>
                                                            <span className={styles.cellRate}>{isWeek0 ? '100%' : `${(d.rate * 100).toFixed(1)}%`}</span>
                                                            <span className={styles.cellUsers}>{d.activeUsers.toLocaleString()}人</span>
                                                        </div>
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </PageShell>
    )
}
