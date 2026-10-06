/**
 * 求人種別CV分析（/api/cv-types）のレスポンス型。
 * cv-types / apply-fields / cv-value の 3 ページがここから `import type` する。
 */

export interface CvTypeFieldRow {
    name: string
    users: number
}

export interface CvTypeChannels {
    organic: number
    direct: number
    crm: number
    paid: number
    other: number
}

export interface CvTypeRow {
    key: string
    label: string
    detailViews: number
    formViews: number
    completed: number
    detailToForm: number | null
    formToComplete: number | null
    overallRate: number | null
    channels: CvTypeChannels
    /** 一覧（検索・職種一覧）経由で詳細に到達したユーザー（referrer 近似） */
    viaList: number
    viaListRate: number | null
    fields: CvTypeFieldRow[]
}

export interface CvTypesChannelMixRow {
    channel: string
    sessions: number
    users: number
}

/** 日別の完了数。JobR / JobA / JobH / signup のうち、その日に値がある種別だけキーを持つ */
export type CvTypesDailyPoint = { date: string } & Partial<Record<'JobR' | 'JobA' | 'JobH' | 'signup', number>>

export interface CvTypesReport {
    jobTypes: CvTypeRow[]
    listViews: number
    channelMix: CvTypesChannelMixRow[]
    signup: { formViews: number; completed: number; formToComplete: number | null }
    daily: CvTypesDailyPoint[]
}

export type CvTypesResponse = CvTypesReport & { startDate: string; endDate: string }
