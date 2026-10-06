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
