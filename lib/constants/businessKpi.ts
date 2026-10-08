/** 事業KPI（応募・会員登録）の指標と流入分類の定義。ダッシュボードと詳細ページが共有する */

import { CHART_COLORS } from './chartColors'
import type { BusinessKpiMonth, JobAdSource } from '@/lib/services/kpi/businessKpiTypes'

export type BusinessKpiMetric =
    | 'appsTotal' | 'appsJobAd' | 'appsAgent' | 'appsHelloWork'
    | 'reg' | 'regPlain' | 'regApplySignup' | 'regLine'
    | 'sends' | 'appsPerJob'

export interface BusinessKpiMetricDef {
    key: BusinessKpiMetric
    label: string
    color: string
    /** 小数で出す指標（求人あたり月間応募）。既定は整数 */
    decimals?: number
    hint?: string
}

/** ダッシュボードのタイルに出す 5 指標。並び順＝表示順 */
export const DASHBOARD_METRICS: readonly BusinessKpiMetric[] = ['appsTotal', 'appsJobAd', 'appsAgent', 'appsHelloWork', 'reg']

export const BUSINESS_KPI_METRICS: Record<BusinessKpiMetric, BusinessKpiMetricDef> = {
    appsTotal:      { key: 'appsTotal',      label: '応募合計',           color: CHART_COLORS.blue,   hint: '求人広告・人材紹介・ハローワークの合計' },
    appsJobAd:      { key: 'appsJobAd',      label: '応募（求人広告）',    color: CHART_COLORS.violet, hint: '流入分類を出しているのはこの種別だけ' },
    appsAgent:      { key: 'appsAgent',      label: '応募（人材紹介）',    color: CHART_COLORS.amber },
    appsHelloWork:  { key: 'appsHelloWork',  label: '応募（ハローワーク）', color: CHART_COLORS.orange },
    reg:            { key: 'reg',            label: '会員登録',           color: CHART_COLORS.green,  hint: '単独登録と応募同時登録の合計' },
    regPlain:       { key: 'regPlain',       label: '会員登録（単独）',    color: CHART_COLORS.cyan,   hint: '応募と同時でない登録' },
    regApplySignup: { key: 'regApplySignup', label: '会員登録（応募同時）', color: CHART_COLORS.pink },
    regLine:        { key: 'regLine',        label: 'LINE連携した登録',    color: CHART_COLORS.cyan },
    sends:          { key: 'sends',          label: 'スカウト送信',        color: CHART_COLORS.red },
    appsPerJob:     { key: 'appsPerJob',     label: '求人あたり月間応募',   color: CHART_COLORS.cyan, decimals: 3, hint: '公開中の求人広告数が分母。分母は現在値なので過去月は目安' },
}

export function metricValue(m: BusinessKpiMonth, key: BusinessKpiMetric): number | null {
    if (key === 'appsPerJob') return m.appsPerJob
    return m[key]
}

/** 求人広告の流入分類。並び順＝積み上げバーの順 */
export const JOB_AD_SOURCES: ReadonlyArray<{ key: JobAdSource; label: string; color: string }> = [
    { key: 'product',      label: 'プロダクト経由',    color: CHART_COLORS.blue },
    { key: 'apply_signup', label: '応募同時登録',      color: CHART_COLORS.green },
    { key: 'line',         label: 'LINE公式',          color: CHART_COLORS.cyan },
    { key: 'hrs',          label: '人材紹介側の配信',   color: CHART_COLORS.amber },
    { key: 'scout',        label: 'スカウト',          color: CHART_COLORS.violet },
    { key: 'others',       label: 'その他（広告）',     color: CHART_COLORS.pink },
]

/**
 * 当月の実績を同じペースで進めたときの月末着地。
 * **途中の月をそのまま前月の満額と比べると必ず大きなマイナスに見える**ので、
 * 途中の月は実績ではなく着地見込みで前月比を出す。
 */
export function paceOf(v: number | null, m: Pick<BusinessKpiMonth, 'daysElapsed' | 'daysInMonth'>): number | null {
    if (v == null) return null
    if (m.daysElapsed <= 0 || m.daysElapsed >= m.daysInMonth) return v
    return (v / m.daysElapsed) * m.daysInMonth
}

export const isPartial = (m: Pick<BusinessKpiMonth, 'daysElapsed' | 'daysInMonth'>) => m.daysElapsed < m.daysInMonth

export function formatKpi(v: number | null, def: BusinessKpiMetricDef): string {
    if (v == null) return '—'
    return def.decimals ? v.toFixed(def.decimals) : Math.round(v).toLocaleString()
}
