'use client'

import { useState } from 'react'
import type { CSSProperties } from 'react'
import { ui, cx } from '@/components/ui'
import Link from '@/components/Link'
import LoadState from '@/components/LoadState'
import InfoTooltip from '@/components/InfoTooltip'
import BusinessKpiTrendChart from './BusinessKpiTrendChart'
import { useReport } from '@/hooks/useReport'
import {
    BUSINESS_KPI_METRICS, DASHBOARD_METRICS, formatKpi, isPartial, metricValue, paceOf,
    type BusinessKpiMetric,
} from '@/lib/constants/businessKpi'
import type { BusinessKpiResponse } from '@/lib/services/kpi/businessKpiTypes'
import styles from './BusinessKpiSection.module.css'

/**
 * ダッシュボード最上段の事業KPI。**出典はプロダクトDB（xmile-drm.xwork）で GA4 ではない。**
 * 応募数・会員登録数の正はこちらなので、GA4 側のCV数（ページ計測）と食い違ったらこの数字を採る。
 *
 * ここは「選んだ月の応募数と会員登録」だけに絞る。流入分類・月次テーブルなど細かいものは
 * /business-kpi に置く。タイルを押すとその指標の推移グラフに切り替わる。
 *
 * 月を変えるたびに取り直さずに済むよう、24 ヶ月分をまとめて取って選択月を切り出す
 * （スキャン量は期間に依らずほぼ一定で、表示月セレクトの選択肢も 24 ヶ月のため）。
 */

export interface BusinessKpiSectionProps {
    /** ダッシュボードの「表示月」。'YYYY-MM' */
    selectedMonth: string
}

export default function BusinessKpiSection({ selectedMonth }: BusinessKpiSectionProps) {
    const [metric, setMetric] = useState<BusinessKpiMetric>('appsTotal')
    const report = useReport<BusinessKpiResponse>('/api/business-kpi', { body: { months: 24 }, keepPreviousData: true })
    const data = report.data
    const months = data?.months ?? []

    const idx = months.findIndex((m) => m.month === selectedMonth)
    const cur = idx >= 0 ? months[idx] : null
    const prev = idx > 0 ? months[idx - 1] : undefined

    return (
        <div className={cx(ui.card, styles.section)}>
            <h2 className={ui.sectionTitle}>
                {selectedMonth} の応募・会員登録
                <InfoTooltip text="出典はプロダクトDB（xmile-drm.xwork）で GA4 ではありません。応募数・会員登録数はこちらが正です。カードを押すとその指標の推移グラフに切り替わります。" />
            </h2>

            <LoadState loading={report.loading && !data} error={report.error} source="bq" variant="inline" onRetry={report.run}>
                {data && !cur && (
                    <p className={styles.sourceNote}>
                        {selectedMonth} のデータはありません（集計は {data.dataTo} まで）。
                    </p>
                )}
                {cur && data && (
                    <>
                        <div className={styles.tiles}>
                            {DASHBOARD_METRICS.map((key) => {
                                const def = BUSINESS_KPI_METRICS[key]
                                const v = metricValue(cur, key)
                                const p = prev ? metricValue(prev, key) : null
                                const pace = paceOf(v, cur)
                                const basis = isPartial(cur) ? pace : v
                                const delta = p != null && p !== 0 && basis != null ? ((basis - p) / p) * 100 : null
                                return (
                                    <div
                                        key={key}
                                        role="button"
                                        tabIndex={0}
                                        aria-pressed={metric === key}
                                        className={cx(styles.tile, styles.tileClickable, metric === key && styles.tileSelected)}
                                        style={{ '--tile-accent': def.color } as CSSProperties}
                                        onClick={() => setMetric(key)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMetric(key) } }}
                                    >
                                        <span className={styles.tileLabel}>{def.label}</span>
                                        <span className={styles.tileValue}>{formatKpi(v, def)}</span>
                                        <span className={styles.tileSub}>
                                            {isPartial(cur)
                                                ? <>月末見込み <strong>{formatKpi(pace, def)}</strong></>
                                                : <>前月比 {delta == null ? '—' : <span className={delta >= 0 ? styles.up : styles.dn}>{delta >= 0 ? '+' : ''}{delta.toFixed(0)}%</span>}</>}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>

                        {isPartial(cur) && (
                            <p className={styles.sourceNote}>
                                {cur.month} は <strong>{cur.daysInMonth} 日のうち {cur.daysElapsed} 日</strong>までの途中集計です。
                                途中の月をそのまま前月の満額と比べると必ず大きなマイナスに見えるので、前月比ではなく<strong>月末見込み</strong>（今のペースで進んだ場合）を出しています。
                            </p>
                        )}

                        <BusinessKpiTrendChart months={months.slice(-12)} metric={metric} highlightMonth={selectedMonth} />

                        <p className={ui.tableNote}>
                            出典は<strong>プロダクトDB（xmile-drm.xwork）</strong>。集計は {data.dataTo} まで（JST の昨日）。
                            流入分類・月次テーブル・求人あたり月間応募は <Link href="/business-kpi">事業KPI（応募・会員登録）</Link> にあります。
                        </p>
                    </>
                )}
            </LoadState>
        </div>
    )
}
