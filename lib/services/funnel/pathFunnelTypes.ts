/** 経路ファネルビルダー（/api/funnel/path）の型。GA4 v1alpha runFunnelReport の入出力 */

import type { GA4FunnelStepInput, GA4FunnelStepResult } from '@/lib/api/ga4/client'

export type PathFunnelStepInput = GA4FunnelStepInput
export type PathFunnelStepResult = GA4FunnelStepResult

export interface PathFunnelResponse {
    steps: PathFunnelStepResult[]
    startDate: string
    endDate: string
}
