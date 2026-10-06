import { and, exact } from '@/lib/api/ga4/filters'
import type { Ga4Reporter } from '@/lib/api/ga4/report'
import { dim, metricInt, rowsOf } from '@/lib/api/ga4/rows'
import { bqListExternalTableRows } from '@/lib/bq/client'
import { LINE_DELIVERY_SNAPSHOT, LINE_DELIVERY_SNAPSHOT_ASOF } from '@/lib/constants/lineDeliverySnapshot'
import { cvKeyForPath, cvPagesFilter, emptyCvCounts } from '@/lib/services/cv/cvPages'
import type { LineDeliveryRow, LineReportReport } from './lineReportTypes'

/**
 * LINE配信レポート:
 *  - GA4: LINE経由（sessionMedium=line）の再訪・CV（utm_source別・日別）
 *  - BQ: おすすめ求人LINE配信の週次実績（xmile-drm.xwork.line_job_recommendation_unit_stats、
 *    drm-front の export-to-bigquery が投入。write SA に閲覧権限がない場合はスナップショット）
 * クリック統計（LINE Insight）は drm-front 側で BQ 未連携のため未対応（連携され次第追加）。
 */

async function fetchDeliveries(): Promise<Pick<LineReportReport, 'deliveries' | 'deliverySource'>> {
    const deliveryRows = await bqListExternalTableRows('xmile-drm', 'xwork', 'line_job_recommendation_unit_stats', 500)
    const live: LineDeliveryRow[] | null = deliveryRows
        ?.map((r) => ({
            unit: r.unit ?? '',
            date: (r.unit ?? '').replace('job_recommendation_', ''),
            linked: parseInt(r.linked_user_count ?? '0', 10),
            success: parseInt(r.success_user_count ?? '0', 10),
            optOut: parseInt(r.not_to_receive_user_count ?? '0', 10),
            noJobs: parseInt(r.no_jobs_available_user_count ?? '0', 10),
            error: parseInt(r.error_user_count ?? '0', 10),
        }))
        .sort((a, b) => b.date.localeCompare(a.date)) ?? null
    if (live) return { deliveries: live, deliverySource: 'live' }
    // BQ権限がない間はスナップショット（nitta権限のMCP経由で取得した静的データ）にフォールバック
    const snapshot: LineDeliveryRow[] = LINE_DELIVERY_SNAPSHOT
        .map(([date, linked, optOut, noJobs, success, error]) => ({ unit: `job_recommendation_${date}`, date, linked, success, optOut, noJobs, error }))
        .sort((a, b) => b.date.localeCompare(a.date))
    return { deliveries: snapshot, deliverySource: 'snapshot' }
}

export async function runLineReport(reporter: Ga4Reporter): Promise<LineReportReport> {
    const lineFilter = exact('sessionMedium', 'line')

    const [bySource, daily, cvRows] = await reporter.runAll([
        // utm_source別（product=おすすめ配信 / ca / scout 等)
        { dimensions: ['sessionSource'], metrics: ['sessions', 'activeUsers'], dimensionFilter: lineFilter, orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 20 },
        // 日別の再訪ユーザー
        { dimensions: ['date'], metrics: ['activeUsers', 'sessions'], dimensionFilter: lineFilter, limit: 400 },
        // LINE経由のCV到達
        { dimensions: ['pagePath'], metrics: ['activeUsers'], dimensionFilter: and(lineFilter, cvPagesFilter()), limit: 100 },
    ])

    const sources = rowsOf(bySource).map((r) => ({ source: dim(r) || '(not set)', sessions: metricInt(r, 0), users: metricInt(r, 1) }))
    const dailyRows = rowsOf(daily)
        .map((r) => ({ date: dim(r), users: metricInt(r, 0), sessions: metricInt(r, 1) }))
        .sort((a, b) => a.date.localeCompare(b.date))
    const cv = emptyCvCounts()
    for (const r of rowsOf(cvRows)) {
        const key = cvKeyForPath(dim(r))
        if (key) cv[key] += metricInt(r)
    }

    const { deliveries, deliverySource } = await fetchDeliveries()
    return { sources, daily: dailyRows, cv, deliveries, deliverySource, snapshotAsOf: LINE_DELIVERY_SNAPSHOT_ASOF }
}
