/**
 * 職種別 会員登録CV（/occupation）のレスポンス型。
 * ページ側は `import type` でここから引く（値を持たないので client bundle に入らない）。
 */

export interface OccupationRow {
    occ: string
    label: string
    slug: string | null
    signupCv: number
    sessions: number | null
    signupRate: number | null
}

export interface LpApplyRow {
    slug: string
    label: string
    cv: number
}

export interface OccupationReport {
    occupations: OccupationRow[]
    /** ?occ= が付いていない会員登録CV（職種に振り分けられない分） */
    noOccSignupCv: number
    totalSignupCv: number
    totalSessions: number
    overallSignupRate: number | null
    lpApplies: LpApplyRow[]
    totalLpApplyCv: number
}

export type OccupationResponse = OccupationReport & { startDate: string; endDate: string }

/** 職種配下のセッション内訳（/api/occupation/detail） */
export interface OccupationDetailReport {
    slug: string
    totalSessions: number
    /** /{slug} トップ */
    listTopSessions: number
    /** /{slug}/{都道府県} の合計 */
    prefectureSessions: number
    /** 求人詳細（media_）と集計上位から漏れたロングテール = 全体 − 分類済み */
    jobDetailAndOtherSessions: number
    subCategories: Array<{ segment: string; path: string; sessions: number }>
}

export type OccupationDetailResponse = OccupationDetailReport & { startDate: string; endDate: string }
