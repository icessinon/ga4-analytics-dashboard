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

    for (let i = 0; i < funnelConfig.steps.length; i++) {
        const step = funnelConfig.steps[i]

        let clickFilter: any = {
            filter: {
                fieldName: 'customEvent:click_label',
                stringFilter: {
                    matchType: 'EXACT',
                    value: step.customEventLabel,
                },
            },
        }

        let viewFilter: any = {
            filter: {
                fieldName: 'customEvent:view_label',
                stringFilter: {
                    matchType: 'EXACT',
                    value: step.customEventLabel,
                },
            },
        }

        if (filterConfig && filterConfig.dimension && filterConfig.operator && filterConfig.expression) {
            clickFilter = {
                andGroup: {
                    expressions: [
                        {
                            filter: {
                                fieldName: 'customEvent:click_label',
                                stringFilter: {
                                    matchType: 'EXACT',
                                    value: step.customEventLabel,
                                },
                            },
                        },
                        {
                            filter: {
                                fieldName: filterConfig.dimension,
                                stringFilter: {
                                    matchType: filterConfig.operator,
                                    value: filterConfig.expression,
                                },
                            },
                        },
                    ],
                },
            }

            viewFilter = {
                andGroup: {
                    expressions: [
                        {
                            filter: {
                                fieldName: 'customEvent:view_label',
                                stringFilter: {
                                    matchType: 'EXACT',
                                    value: step.customEventLabel,
                                },
                            },
                        },
                        {
                            filter: {
                                fieldName: filterConfig.dimension,
                                stringFilter: {
                                    matchType: filterConfig.operator,
                                    value: filterConfig.expression,
                                },
                            },
                        },
                    ],
                },
            }
        }

        try {
            const clickReport = await fetchGA4Data(
                {
                    propertyId,
                    dateRanges: [{ startDate: parsedStartDate, endDate: parsedEndDate }],
                    dimensions: ['customEvent:click_label'],
                    metrics: ['totalUsers'],
                    dimensionFilter: clickFilter,
                    limit: 100000,
                },
                token
            )

            const viewReport = await fetchGA4Data(
                {
                    propertyId,
                    dateRanges: [{ startDate: parsedStartDate, endDate: parsedEndDate }],
                    dimensions: ['customEvent:view_label'],
                    metrics: ['totalUsers'],
                    dimensionFilter: viewFilter,
                    limit: 100000,
                },
                token
            )

            let clickUsers = 0
            let viewUsers = 0

            if (clickReport && clickReport.rows) {
                clickUsers = clickReport.rows.reduce((sum, row) => {
                    return sum + parseInt(row.metricValues[0]?.value || '0', 10)
                }, 0)
            }

            if (viewReport && viewReport.rows) {
                viewUsers = viewReport.rows.reduce((sum, row) => {
                    return sum + parseInt(row.metricValues[0]?.value || '0', 10)
                }, 0)
            }

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
        } catch (error) {
            console.error(`ファネルステップ ${step.stepName} のデータ取得に失敗:`, error)
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
