/**
 * エンゲージメントファネルサービス
 * 元のGASコードのcreateEngagementFunnelReport / writeTrendFunnelSheetを参考に実装
 * ページごと・滞在時間（time_on_page）のファネルを集計する
 * ※ サーバー専用（GA4参照のため）。クライアントは engagementFunnelTypes を参照すること
 */

import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { parseDateString } from '@/lib/utils/date'
import {
    ENGAGEMENT_MILESTONES,
    type EngagementMilestone,
    type EngagementMilestoneData,
    type EngagementFunnelRow,
    type EngagementFunnelData,
} from './engagementFunnelTypes'

export type { EngagementFunnelData, EngagementFunnelRow, EngagementMilestone, EngagementMilestoneData }
export { ENGAGEMENT_MILESTONES }

const timeLabelDimensionCache = new Map<string, 'customEvent:data_time_label' | 'customEvent:view_label'>()

/**
 * data_time_label が利用可能かテスト（GASと同様に1件だけ取得）
 * propertyId ごとにキャッシュし、毎リクエストの余分な GA4 呼び出しを排除する
 */
async function detectTimeLabelDimension(
    propertyId: string,
    accessToken: string
): Promise<'customEvent:data_time_label' | 'customEvent:view_label'> {
    const cached = timeLabelDimensionCache.get(propertyId)
    if (cached) return cached

    try {
        await fetchGA4Data(
            {
                propertyId,
                dateRanges: [{ startDate: 'yesterday', endDate: 'yesterday' }],
                dimensions: [{ name: 'customEvent:data_time_label' }],
                metrics: [{ name: 'totalUsers' }],
                limit: 1,
            },
            accessToken
        )
        timeLabelDimensionCache.set(propertyId, 'customEvent:data_time_label')
        return 'customEvent:data_time_label'
    } catch {
        timeLabelDimensionCache.set(propertyId, 'customEvent:view_label')
        return 'customEvent:view_label'
    }
}

/**
 * エンゲージメントファネルデータを取得
 * GAS: eventName=time_on_page, dimensions=pagePath+data_time_label, metrics=totalUsers,eventCount
 */
export async function fetchEngagementFunnelData(
    propertyId: string,
    startDate: string,
    endDate: string,
    accessToken?: string
): Promise<EngagementFunnelData> {
    const token = accessToken || (await getGA4AccessToken())
    const timeLabelDimension = await detectTimeLabelDimension(propertyId, token)
    const parsedStart = parseDateString(startDate)
    const parsedEnd = parseDateString(endDate)

    const report = await fetchGA4Data(
        {
            propertyId,
            dateRanges: [{ startDate: parsedStart, endDate: parsedEnd }],
            dimensions: [{ name: 'pagePath' }, { name: timeLabelDimension }],
            metrics: [{ name: 'totalUsers' }, { name: 'eventCount' }],
            dimensionFilter: {
                filter: {
                    fieldName: 'eventName',
                    stringFilter: { matchType: 'EXACT', value: 'time_on_page' },
                },
            },
            limit: 100000,
        },
        token
    )

    const pivotData = new Map<string, Record<string, { users: number; events: number }>>()
    if (report.rows) {
        for (const row of report.rows) {
            const pagePath = row.dimensionValues[0]?.value ?? ''
            const timeLabel = row.dimensionValues[1]?.value ?? ''
            const users = parseInt(row.metricValues[0]?.value ?? '0', 10)
            const events = parseInt(row.metricValues[1]?.value ?? '0', 10)
            if (!pivotData.has(pagePath)) pivotData.set(pagePath, {})
            pivotData.get(pagePath)![timeLabel] = { users, events }
        }
    }

    const rows: EngagementFunnelRow[] = []
    const [baseMilestone, ...restMilestones] = ENGAGEMENT_MILESTONES

    pivotData.forEach((data, pagePath) => {
        const base = data[baseMilestone] ?? { users: 0, events: 0 }
        if (base.users === 0) return

        const milestones: Record<EngagementMilestone, EngagementMilestoneData> = {
            '10秒以上滞在': base,
            '30秒以上滞在': data['30秒以上滞在'] ?? { users: 0, events: 0 },
            '60秒以上滞在': data['60秒以上滞在'] ?? { users: 0, events: 0 },
            '120秒以上滞在': data['120秒以上滞在'] ?? { users: 0, events: 0 },
            '180秒以上滞在': data['180秒以上滞在'] ?? { users: 0, events: 0 },
        }

        const rates: Record<string, number> = {}
        restMilestones.forEach((m) => {
            const milestoneData = milestones[m]
            rates[m.replace('以上滞在', '')] = base.users > 0 ? milestoneData.users / base.users : 0
        })

        rows.push({
            pagePath,
            baseUsers: base.users,
            baseEvents: base.events,
            milestones,
            rates,
        })
    })

    rows.sort((a, b) => b.baseUsers - a.baseUsers)

    return {
        startDate: parsedStart,
        endDate: parsedEnd,
        rows,
    }
}

/**
 * 10秒以上滞在のうち30秒未満で離脱した率を、期間別（日・週・月）で取得する。
 * 時系列グラフ用。periodKey は series API の byPeriod キーと揃える（daily: YYYYMMDD, weekly: YYYY-MM-DD, monthly: YYYYMM）。
 */
export async function fetchEngagementExitRateSeries(
    propertyId: string,
    startDate: string,
    endDate: string,
    pagePath: string,
    granularity: 'daily' | 'weekly' | 'monthly',
    accessToken?: string
): Promise<Record<string, number>> {
    const token = accessToken || (await getGA4AccessToken())
    const timeLabelDimension = await detectTimeLabelDimension(propertyId, token)
    const parsedStart = parseDateString(startDate)
    const parsedEnd = parseDateString(endDate)

    const dimName = granularity === 'monthly' ? 'yearMonth' : 'date'
    const report = await fetchGA4Data(
        {
            propertyId,
            dateRanges: [{ startDate: parsedStart, endDate: parsedEnd }],
            dimensions: [
                { name: 'pagePath' },
                { name: dimName },
                { name: timeLabelDimension },
            ],
            metrics: [{ name: 'totalUsers' }],
            dimensionFilter: {
                andGroup: {
                    expressions: [
                        { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'EXACT', value: pagePath } } },
                        { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'time_on_page' } } },
                    ],
                },
            },
            limit: 100000,
        },
        token
    )

    const byPeriod: Record<string, { baseUsers: number; users30: number }> = {}
    const baseLabel = '10秒以上滞在'
    const label30 = '30秒以上滞在'

    for (const row of report.rows ?? []) {
        const periodVal = row.dimensionValues?.[1]?.value ?? ''
        const timeLabel = row.dimensionValues?.[2]?.value ?? ''
        const users = parseInt(row.metricValues?.[0]?.value ?? '0', 10)
        if (!periodVal || (timeLabel !== baseLabel && timeLabel !== label30)) continue

        let periodKey = periodVal
        if (granularity === 'weekly' && dimName === 'date' && periodVal.length === 8) {
            const y = parseInt(periodVal.slice(0, 4), 10)
            const m = parseInt(periodVal.slice(4, 6), 10)
            const d = parseInt(periodVal.slice(6, 8), 10)
            const date = new Date(y, m - 1, d)
            const sun = new Date(date)
            sun.setDate(date.getDate() - date.getDay())
            periodKey = `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, '0')}-${String(sun.getDate()).padStart(2, '0')}`
        }

        if (!byPeriod[periodKey]) byPeriod[periodKey] = { baseUsers: 0, users30: 0 }
        if (timeLabel === baseLabel) byPeriod[periodKey].baseUsers += users
        if (timeLabel === label30) byPeriod[periodKey].users30 += users
    }

    const result: Record<string, number> = {}
    for (const [key, v] of Object.entries(byPeriod)) {
        if (v.baseUsers > 0) {
            result[key] = ((v.baseUsers - v.users30) / v.baseUsers) * 100
        }
    }
    return result
}
