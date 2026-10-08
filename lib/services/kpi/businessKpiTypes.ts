/** 事業KPI（POST /api/business-kpi）の型。クライアントは import type でここを参照する */

/** 求人広告の応募をどこから来たかで分けた区分。三木さんの分類（2026-10-02）に揃えてある */
export type JobAdSource = 'scout' | 'product' | 'line' | 'hrs' | 'apply_signup' | 'others'

export interface BusinessKpiMonth {
    /** 'YYYY-MM' */
    month: string
    /** その月の経過日数。当月は昨日まで */
    daysElapsed: number
    daysInMonth: number

    appsTotal: number
    appsJobAd: number
    appsAgent: number
    appsHelloWork: number

    /** 求人広告の応募の流入分類。合計は appsJobAd と一致する */
    jobAdBySource: Record<JobAdSource, number>

    /** 会員登録（全体） */
    reg: number
    /** うち単独登録（応募と同時でない） */
    regPlain: number
    /** うち応募同時登録 */
    regApplySignup: number
    /** うち LINE 連携済み */
    regLine: number

    /** スカウト SMS の送信数 */
    sends: number

    /** 求人あたり月間応募 ＝ appsJobAd ÷ 公開中の求人広告数 */
    appsPerJob: number | null
    /** 当月を同じペースで進んだ場合の月末着地（確定月は実績そのまま） */
    appsJobAdPace: number
    regPace: number
}

export interface BusinessKpiReport {
    months: BusinessKpiMonth[]
    /** 公開中の求人広告数（現在値。過去月にも同じ値を使うので推移の分母としては粗い） */
    inventoryJobAd: number
    /** 集計に含めた最終日（JST の昨日） */
    dataTo: string
    scannedBytes: number
    fetchedAt: string
}

export type BusinessKpiResponse = BusinessKpiReport & { success: true }
