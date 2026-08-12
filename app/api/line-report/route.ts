import { NextResponse } from 'next/server'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { bqListExternalTableRows } from '@/lib/bq/client'
import { LINE_DELIVERY_SNAPSHOT, LINE_DELIVERY_SNAPSHOT_ASOF } from '@/lib/constants/lineDeliverySnapshot'
import { parseDateString } from '@/lib/utils/date'

/**
 * LINE配信レポート:
 *  - GA4: LINE経由（sessionMedium=line）の再訪・CV（utm_source別・日別）
 *  - BQ: おすすめ求人LINE配信の週次実績（xmile-drm.xwork.line_job_recommendation_unit_stats、
 *    drm-front の export-to-bigquery が投入。write SA に閲覧権限がない場合は null）
 * クリック統計（LINE Insight）は drm-front 側で BQ 未連携のため未対応（連携され次第追加）。
 */

const CV_PAGES = [
    { key: 'applyCv', label: '応募CV', prefix: '/entry/thanks' },
    { key: 'lpApplyCv', label: 'LP応募CV', prefix: '/lp-thanks' },
    { key: 'signupCv', label: '会員登録CV', prefix: '/members/signup/thanks' },
] as const

interface GA4Row { dimensionValues: Array<{ value?: string }>; metricValues: Array<{ value?: string }> }

export async function POST(request: Request) {
    try {
        const { propertyId, startDate = '30daysAgo', endDate = 'yesterday' } = await request.json()
        if (!propertyId) {
            return NextResponse.json({ error: 'propertyId が必要です' }, { status: 400 })
        }
        const accessToken = await getGA4AccessToken()
        const dateRanges = [{ startDate: parseDateString(startDate), endDate: parseDateString(endDate) }]
        const lineFilter = { filter: { fieldName: 'sessionMedium', stringFilter: { matchType: 'EXACT', value: 'line' } } }

        const [bySource, daily, cvRows] = await Promise.all([
            // utm_source別（product=おすすめ配信 / ca / scout 等)
            fetchGA4Data({
                propertyId, dateRanges,
                dimensions: [{ name: 'sessionSource' }],
                metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
                dimensionFilter: lineFilter,
                orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
                limit: 20,
            }, accessToken),
            // 日別の再訪ユーザー
            fetchGA4Data({
                propertyId, dateRanges,
                dimensions: [{ name: 'date' }],
                metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
                dimensionFilter: lineFilter,
                limit: 400,
            }, accessToken),
            // LINE経由のCV到達
            fetchGA4Data({
                propertyId, dateRanges,
                dimensions: [{ name: 'pagePath' }],
                metrics: [{ name: 'activeUsers' }],
                dimensionFilter: {
                    andGroup: {
                        expressions: [
                            lineFilter,
                            { orGroup: { expressions: CV_PAGES.map((p) => ({ filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: p.prefix } } })) } },
                        ],
                    },
                },
                limit: 100,
            }, accessToken),
        ])

        const sources = ((bySource.rows ?? []) as GA4Row[]).map((r) => ({
            source: r.dimensionValues[0]?.value ?? '(not set)',
            sessions: parseInt(r.metricValues[0]?.value ?? '0', 10),
            users: parseInt(r.metricValues[1]?.value ?? '0', 10),
        }))
        const dailyRows = ((daily.rows ?? []) as GA4Row[])
            .map((r) => ({
                date: r.dimensionValues[0]?.value ?? '',
                users: parseInt(r.metricValues[0]?.value ?? '0', 10),
                sessions: parseInt(r.metricValues[1]?.value ?? '0', 10),
            }))
            .sort((a, b) => a.date.localeCompare(b.date))
        const cv: Record<string, number> = { applyCv: 0, lpApplyCv: 0, signupCv: 0 }
        for (const r of (cvRows.rows ?? []) as GA4Row[]) {
            const path = r.dimensionValues[0]?.value ?? ''
            const users = parseInt(r.metricValues[0]?.value ?? '0', 10)
            for (const p of CV_PAGES) {
                if (path.startsWith(p.prefix)) { cv[p.key] += users; break }
            }
        }

        // 配信実績（週次）。BQ権限がない間はスナップショット（nitta権限のMCP経由で取得した静的データ）にフォールバック
        const deliveryRows = await bqListExternalTableRows('xmile-drm', 'xwork', 'line_job_recommendation_unit_stats', 500)
        const live = deliveryRows
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
        const snapshot = LINE_DELIVERY_SNAPSHOT
            .map(([date, linked, optOut, noJobs, success, error]) => ({
                unit: `job_recommendation_${date}`, date, linked, success, optOut, noJobs, error,
            }))
            .sort((a, b) => b.date.localeCompare(a.date))
        const deliveries = live ?? snapshot

        return NextResponse.json({
            success: true,
            startDate: dateRanges[0].startDate,
            endDate: dateRanges[0].endDate,
            sources,
            daily: dailyRows,
            cv,
            deliveries,
            deliverySource: live ? 'live' : 'snapshot',
            snapshotAsOf: LINE_DELIVERY_SNAPSHOT_ASOF,
            fetchedAt: new Date().toISOString(),
        })
    } catch (error) {
        console.error('LINE Report API Error:', error)
        return NextResponse.json(
            { error: 'LINEレポートの集計に失敗しました', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
