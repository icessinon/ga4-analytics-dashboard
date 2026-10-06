'use client'

import { useMemo, useState } from 'react'
import PageShell from '@/components/PageShell'
import FilterBar, { FilterField } from '@/components/FilterBar'
import PeriodSelect from '@/components/PeriodSelect'
import { ui, cx } from '@/components/ui'
import { useProduct } from '@/lib/contexts/ProductContext'
import { usePeriodRange } from '@/hooks/usePeriodRange'
import { useReport } from '@/hooks/useReport'
import { GA4_FILTER_OPERATORS } from '@/lib/constants/ga4Dimensions'
import type { AdHocQueryResponse, AdHocRow } from '@/lib/services/analytics/adHocTypes'
import styles from './DataPage.module.css'

interface QueryDraft {
    metrics: string
    dimensions: string
    filterDimension: string
    filterOperator: string
    filterExpression: string
    limit: number
}

const DEFAULT_QUERY: QueryDraft = {
    metrics: 'eventCount,totalUsers',
    dimensions: 'customEvent:click_label,customEvent:view_label',
    filterDimension: 'pagePath',
    filterOperator: 'CONTAINS',
    filterExpression: '',
    limit: 10000,
}

const VIEW_LABEL = 'customEvent:view_label'
const CLICK_LABEL = 'customEvent:click_label'
type ViewMode = 'all' | 'view' | 'click'

const splitNames = (s: string) => s.split(',').map((v) => v.trim()).filter(Boolean).map((name) => ({ name }))

function hasLabel(value: string | undefined): boolean {
    return !!value && value !== '(not set)' && value !== 'null' && value !== 'undefined'
}

export default function DataPage() {
    const { currentProduct } = useProduct()
    const propertyId = currentProduct?.ga4PropertyId ?? ''
    // 旧実装の既定は今月（1日〜今日）
    const periodState = usePeriodRange('thisMonth')
    const { range } = periodState
    // テキスト項目は 1 文字ごとに叩かないよう、「条件を適用」で applied に反映してから取得する。期間は即時
    const [draft, setDraft] = useState<QueryDraft>(DEFAULT_QUERY)
    const [applied, setApplied] = useState<QueryDraft>(DEFAULT_QUERY)
    const [viewMode, setViewMode] = useState<ViewMode>('all')
    const [tableSearch, setTableSearch] = useState('')

    const body = useMemo(() => {
        const expression = applied.filterExpression.trim()
        return {
            propertyId,
            startDate: range?.startDate,
            endDate: range?.endDate,
            metrics: splitNames(applied.metrics),
            dimensions: splitNames(applied.dimensions),
            limit: applied.limit,
            ...(expression && { filter: { dimension: applied.filterDimension, operator: applied.filterOperator, expression } }),
        }
    }, [propertyId, range, applied])

    const report = useReport<AdHocQueryResponse>('/api/analytics/data', {
        body,
        enabled: !!propertyId && !!range,
        keepPreviousData: true,
    })
    const data = report.data?.data ?? null

    const allColumns = useMemo(
        () => [...(data?.dimensionHeaders ?? []), ...(data?.metricHeaders ?? [])].map((h) => h.name),
        [data],
    )
    const hasLabelColumns = allColumns.includes(VIEW_LABEL) || allColumns.includes(CLICK_LABEL)
    // ラベル列の無いクエリでは View / Click 切替は意味を持たないので「すべて」として扱う
    const mode: ViewMode = hasLabelColumns ? viewMode : 'all'
    const displayColumns = mode === 'view' ? allColumns.filter((c) => c !== CLICK_LABEL)
        : mode === 'click' ? allColumns.filter((c) => c !== VIEW_LABEL)
        : allColumns

    const filteredRows = useMemo(() => {
        let rows: AdHocRow[] = data?.rows ?? []
        if (mode === 'view') rows = rows.filter((r) => hasLabel(r[VIEW_LABEL]))
        else if (mode === 'click') rows = rows.filter((r) => hasLabel(r[CLICK_LABEL]))
        const q = tableSearch.trim().toLowerCase()
        if (q) rows = rows.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(q)))
        return rows
    }, [data, mode, tableSearch])

    const update = <K extends keyof QueryDraft>(key: K, value: QueryDraft[K]) => setDraft((d) => ({ ...d, [key]: value }))

    return (
        <PageShell
            pageId="data"
            requireProduct
            width="wide"
            status={{ loading: report.loading, error: report.error, source: 'ga4', onRetry: report.run }}
            keepChildrenWhileLoading
            controls={
                <div className={ui.card}>
                    <FilterBar onSubmit={() => { setApplied(draft); setTableSearch('') }} submitLabel="条件を適用" submitting={report.loading} disabled={!range}>
                        <FilterField label="期間" hint="期間の変更は即時に反映">
                            <PeriodSelect state={periodState} />
                        </FilterField>
                        <FilterField label="メトリクス（カンマ区切り）">
                            <input type="text" className={cx(ui.input, styles.wideInput)} value={draft.metrics} onChange={(e) => update('metrics', e.target.value)} placeholder="eventCount,totalUsers" required />
                        </FilterField>
                        <FilterField label="ディメンション（カンマ区切り）">
                            <input type="text" className={cx(ui.input, styles.wideInput)} value={draft.dimensions} onChange={(e) => update('dimensions', e.target.value)} placeholder="customEvent:click_label,customEvent:view_label" required />
                        </FilterField>
                        <FilterField label="フィルタ" hint="式が空ならフィルタなし。カンマ区切りで OR">
                            <input type="text" className={cx(ui.input, styles.dimInput)} value={draft.filterDimension} onChange={(e) => update('filterDimension', e.target.value)} placeholder="pagePath" aria-label="フィルタ ディメンション" />
                            <select className={ui.select} value={draft.filterOperator} onChange={(e) => update('filterOperator', e.target.value)} aria-label="フィルタ 演算子">
                                {GA4_FILTER_OPERATORS.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
                            </select>
                            <input type="text" className={cx(ui.input, styles.exprInput)} value={draft.filterExpression} onChange={(e) => update('filterExpression', e.target.value)} placeholder="/members/signup" aria-label="フィルタ 式" />
                        </FilterField>
                        <FilterField label="上限件数">
                            <input type="number" className={cx(ui.input, styles.limitInput)} value={draft.limit} min={1} max={100000} onChange={(e) => update('limit', parseInt(e.target.value, 10) || 1)} />
                        </FilterField>
                    </FilterBar>
                </div>
            }
        >
            {data && (
                <div className={ui.card}>
                    <div className={styles.dataHeader}>
                        <h2 className={ui.sectionTitle}>データ一覧</h2>
                        <div className={styles.dataHeaderRight}>
                            {hasLabelColumns && (
                                <div className={styles.viewModeTabs} role="tablist">
                                    {([['all', 'すべて'], ['view', 'Viewのみ'], ['click', 'Clickのみ']] as const).map(([mode, label]) => (
                                        <button key={mode} type="button" role="tab" aria-selected={viewMode === mode}
                                            className={cx(styles.viewModeButton, viewMode === mode && styles.viewModeButtonActive)}
                                            onClick={() => setViewMode(mode)}>
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <input type="search" className={cx(ui.input, styles.searchInput)} value={tableSearch} onChange={(e) => setTableSearch(e.target.value)} placeholder="値で絞り込み" aria-label="値で絞り込み" />
                            <span className={ui.note}>表示: {filteredRows.length.toLocaleString()} / 全 {(data.rowCount || 0).toLocaleString()} 件</span>
                        </div>
                    </div>
                    <div className={ui.tableWrap}>
                        <table className={ui.dataTable}>
                            <thead>
                                <tr>{displayColumns.map((c) => <th key={c}>{c}</th>)}</tr>
                            </thead>
                            <tbody>
                                {filteredRows.length > 0 ? filteredRows.map((row, i) => (
                                    <tr key={i}>
                                        {displayColumns.map((c) => <td key={c} className={cx(styles.cell, data.metricHeaders.some((h) => h.name === c) && ui.num)}>{row[c] || '-'}</td>)}
                                    </tr>
                                )) : (
                                    <tr><td colSpan={displayColumns.length || 1} className={ui.empty}>データがありません</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </PageShell>
    )
}
