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
 * 見込みを出すのに必要な最低日数。
 * 月初はこれを下回るので見込みを出さない。11/01 の 0 時台に 1 件入っただけで
 * 「月末 8,600 件」のような値になってしまうため。
 */
export const MIN_DAYS_FOR_PACE = 3

/** 月末見込みを出してよいか。確定月は常に true（実績をそのまま返すため） */
export function canProject(m: Pick<BusinessKpiMonth, 'elapsedRatio' | 'daysInMonth'>): boolean {
    if (m.elapsedRatio >= 1) return true
    return m.elapsedRatio * m.daysInMonth >= MIN_DAYS_FOR_PACE
}

/**
 * 当月の実績を同じペースで進めたときの月末着地。
 * **途中の月をそのまま前月の満額と比べると必ず大きなマイナスに見える**ので、
 * 途中の月は実績ではなく着地見込みで前月比を出す。
 *
 * 割り戻しは日数ではなく elapsedRatio（当日は時刻ぶんの端数）で行う。
 * 経過が MIN_DAYS_FOR_PACE 日に満たない月は null を返す（見込みを出さない）。
 */
export function paceOf(v: number | null, m: Pick<BusinessKpiMonth, 'elapsedRatio' | 'daysInMonth'>): number | null {
    if (v == null) return null
    if (m.elapsedRatio >= 1 || m.elapsedRatio <= 0) return v
    if (!canProject(m)) return null
    return v / m.elapsedRatio
}

export const isPartial = (m: Pick<BusinessKpiMonth, 'elapsedRatio'>) => m.elapsedRatio < 1

export function formatKpi(v: number | null, def: BusinessKpiMetricDef): string {
    if (v == null) return '—'
    return def.decimals ? v.toFixed(def.decimals) : Math.round(v).toLocaleString()
}
