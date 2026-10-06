/** CVセッション解剖（/api/user-flow）のレスポンス型。ページは `import type` でここから引く */

export interface FlowGroup {
    key: 'applied' | 'signup' | 'browsed' | 'other'
    sessions: number
    avgDetails: number
    medDetails: number
    searchRatePct: number
    medDurMin: number
    medCvMin: number | null
    dist: { d0: number; d1: number; d2_3: number; d4_9: number; d10p: number }
}

export interface NextAction {
    action: string
    count: number
}

export interface DeviceFlowGroup extends FlowGroup {
    device: string
}

export interface DailyDetailFlow {
    date: string
    /** その日の求人詳細PV数（次アクションの母数） */
    detailPv: number
    /** 詳細→応募フォーム進出数 */
    toEntry: number
    /** 詳細→離脱数 */
    exit: number
}

export interface UserFlowReport {
    startDate: string
    endDate: string
    clamped: boolean
    groups: FlowGroup[]
    deviceGroups: DeviceFlowGroup[]
    nextActions: NextAction[]
    daily: DailyDetailFlow[]
    scannedMb: number
}

export interface UserFlowResponse extends UserFlowReport {
    success: true
    fetchedAt: string
}
