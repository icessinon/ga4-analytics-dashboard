/**
 * ファネル分析サービス
 * 元のGASコードのfetchFunnelData関数を参考に実装
 */

import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { parseDateString } from '@/lib/utils/date'
import type {
    FunnelStep,
    FunnelConfig,
    FunnelFilterConfig,
    FunnelStepData,
    FunnelData,
} from '@/app/funnel/types'

export type { FunnelStep, FunnelConfig, FunnelFilterConfig, FunnelStepData, FunnelData }

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
    accessToken?: string
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

    const [clickReport, viewReport] = await Promise.all([
        fetchGA4Data(
            { ...baseRequest, dimensions: ['customEvent:click_label'], ...(pageFilter ? { dimensionFilter: pageFilter } : {}) },
            token
        ).catch(() => null),
        fetchGA4Data(
            { ...baseRequest, dimensions: ['customEvent:view_label'], ...(pageFilter ? { dimensionFilter: pageFilter } : {}) },
            token
        ).catch(() => null),
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

    for (let i = 0; i < funnelConfig.steps.length; i++) {
        const step = funnelConfig.steps[i]
        const clickUsers = clickMap.get(step.customEventLabel) ?? 0
        const viewUsers = viewMap.get(step.customEventLabel) ?? 0
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

    return funnelData
}
