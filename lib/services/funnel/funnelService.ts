/**
 * ファネル分析サービス
 * 元のGASコードのfetchFunnelData関数を参考に実装
 */

import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { parseDateString } from '@/lib/utils/date'
import { channelLabel } from '@/lib/constants/channelLabels'
import type {
    FunnelStep,
    FunnelConfig,
    FunnelFilterConfig,
    FunnelStepData,
    FunnelData,
    ChannelFunnelData,
} from '@/app/funnel/types'

export type { FunnelStep, FunnelConfig, FunnelFilterConfig, FunnelStepData, FunnelData, ChannelFunnelData }

/**
 * エントリーフォームファネルデータを取得
 * GA4 APIから各ステップのクリック数とビュー数を取得し、コンバージョン率とドロップオフ率を計算
 * @param propertyId - GA4プロパティID
 * @param funnelConfig - ファネル設定（ステップ定義）
 * @param filterConfig - フィルタ設定（オプション）
 * @param startDate - 開始日（YYYY-MM-DD形式）
 * @param endDate - 終了日（YYYY-MM-DD形式）
 * @param accessToken - GA4アクセストークン（オプション、未指定の場合は環境変数から取得）
 * @returns ファネルデータ（各ステップのユーザー数、コンバージョン率、ドロップオフ率）
 */
export async function fetchEntryFormFunnelData(
    propertyId: string,
    funnelConfig: FunnelConfig,
    filterConfig: FunnelFilterConfig | null,
    startDate: string,
    endDate: string,
    accessToken?: string,
    options?: { channelBreakdown?: boolean }
): Promise<FunnelData> {
    const funnelData: FunnelData = {
        steps: [],
        totalUsers: 0,
    }

    const token = accessToken || await getGA4AccessToken()
    const parsedStartDate = parseDateString(startDate)
    const parsedEndDate = parseDateString(endDate)

    const baseRequest = {
        propertyId,
        dateRanges: [{ startDate: parsedStartDate, endDate: parsedEndDate }],
        metrics: ['totalUsers'],
        limit: 100000,
    }

    const pageFilter = filterConfig?.dimension && filterConfig?.operator && filterConfig?.expression
        ? {
            filter: {
                fieldName: filterConfig.dimension,
                stringFilter: { matchType: filterConfig.operator, value: filterConfig.expression },
            },
        }
        : undefined

    const withChannel = options?.channelBreakdown === true
    const [clickReport, viewReport, clickChannelReport, viewChannelReport] = await Promise.all([
        fetchGA4Data(
            { ...baseRequest, dimensions: ['customEvent:click_label'], ...(pageFilter ? { dimensionFilter: pageFilter } : {}) },
            token
        ).catch(() => null),
        fetchGA4Data(
            { ...baseRequest, dimensions: ['customEvent:view_label'], ...(pageFilter ? { dimensionFilter: pageFilter } : {}) },
            token
        ).catch(() => null),
        withChannel
            ? fetchGA4Data(
                { ...baseRequest, dimensions: ['customEvent:click_label', 'sessionDefaultChannelGroup'], ...(pageFilter ? { dimensionFilter: pageFilter } : {}) },
                token
            ).catch(() => null)
            : Promise.resolve(null),
        withChannel
            ? fetchGA4Data(
                { ...baseRequest, dimensions: ['customEvent:view_label', 'sessionDefaultChannelGroup'], ...(pageFilter ? { dimensionFilter: pageFilter } : {}) },
                token
            ).catch(() => null)
            : Promise.resolve(null),
    ])

    // ラベル → totalUsers のマップを構築
    const clickMap = new Map<string, number>()
    const viewMap = new Map<string, number>()

    for (const row of clickReport?.rows ?? []) {
        const label = row.dimensionValues?.[0]?.value ?? ''
        const users = parseInt(row.metricValues[0]?.value || '0', 10)
        clickMap.set(label, (clickMap.get(label) ?? 0) + users)
    }
    for (const row of viewReport?.rows ?? []) {
        const label = row.dimensionValues?.[0]?.value ?? ''
        const users = parseInt(row.metricValues[0]?.value || '0', 10)
        viewMap.set(label, (viewMap.get(label) ?? 0) + users)
    }

    // カンマ区切りで複数ラベル指定時は各ラベルの値を合算する
    const parseLabels = (s: string) =>
        s.split(/[,、]/).map((l) => l.trim()).filter((l) => l !== '')
    const sumUsers = (map: Map<string, number>, labels: string[]) =>
        labels.reduce((sum, label) => sum + (map.get(label) ?? 0), 0)

    for (let i = 0; i < funnelConfig.steps.length; i++) {
        const step = funnelConfig.steps[i]
        const labels = parseLabels(step.customEventLabel)
        const clickUsers = sumUsers(clickMap, labels)
        const viewUsers = sumUsers(viewMap, labels)
        const totalUsers = Math.max(clickUsers, viewUsers)

        funnelData.steps.push({
            stepName: step.stepName,
            customEventLabel: step.customEventLabel,
            users: totalUsers,
            clickUsers,
            viewUsers,
            conversionRate: 0,
            dropoffRate: 0,
        })

        if (i === 0) {
            funnelData.totalUsers = totalUsers
        }
    }

    // コンバージョン率とドロップオフ率を計算
    funnelData.steps.forEach((step, index) => {
        if (funnelData.totalUsers > 0) {
            step.conversionRate = step.users / funnelData.totalUsers
        } else {
            step.conversionRate = 0
        }

        if (index > 0) {
            const previousStep = funnelData.steps[index - 1]
            if (previousStep.users > 0) {
                step.dropoffRate = Math.max(0, (previousStep.users - step.users) / previousStep.users)
            } else {
                step.dropoffRate = 0
            }
        } else {
            step.dropoffRate = 0
        }
    })

    // ── チャネル別内訳（sessionDefaultChannelGroup クロス）──
    if (withChannel && (clickChannelReport || viewChannelReport)) {
        const clickChMap = new Map<string, number>()
        const viewChMap = new Map<string, number>()
        const channelSet = new Set<string>()

        const collect = (report: typeof clickChannelReport, map: Map<string, number>) => {
            for (const row of report?.rows ?? []) {
                const label = row.dimensionValues?.[0]?.value ?? ''
                const channel = channelLabel(row.dimensionValues?.[1]?.value ?? '')
                const users = parseInt(row.metricValues[0]?.value || '0', 10)
                const key = `${channel}|||${label}`
                map.set(key, (map.get(key) ?? 0) + users)
                channelSet.add(channel)
            }
        }
        collect(clickChannelReport, clickChMap)
        collect(viewChannelReport, viewChMap)

        const sumChUsers = (map: Map<string, number>, channel: string, labels: string[]) =>
            labels.reduce((sum, label) => sum + (map.get(`${channel}|||${label}`) ?? 0), 0)

        const breakdown: ChannelFunnelData[] = []
        for (const channel of channelSet) {
            const chSteps: FunnelStepData[] = funnelConfig.steps.map((step) => {
                const labels = parseLabels(step.customEventLabel)
                const clickUsers = sumChUsers(clickChMap, channel, labels)
                const viewUsers = sumChUsers(viewChMap, channel, labels)
                return {
                    stepName: step.stepName,
                    customEventLabel: step.customEventLabel,
                    users: Math.max(clickUsers, viewUsers),
                    clickUsers,
                    viewUsers,
                    conversionRate: 0,
                    dropoffRate: 0,
                }
            })
            const chTotal = chSteps[0]?.users ?? 0
            if (chTotal === 0) continue
            chSteps.forEach((step, index) => {
                step.conversionRate = chTotal > 0 ? step.users / chTotal : 0
                if (index > 0 && chSteps[index - 1].users > 0) {
                    step.dropoffRate = Math.max(0, (chSteps[index - 1].users - step.users) / chSteps[index - 1].users)
                }
            })
            breakdown.push({ channel, totalUsers: chTotal, steps: chSteps })
        }

        breakdown.sort((a, b) => b.totalUsers - a.totalUsers)
        funnelData.channelBreakdown = breakdown
    }

    return funnelData
}
