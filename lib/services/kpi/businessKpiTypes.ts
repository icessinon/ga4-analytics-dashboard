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

    /**
     * 成果目標 M1 が要求する内訳。
     * プロダクト経由は「LINEプッシュ経由」と「会員になってからの経過（登録当日 / 1〜30日の再訪 / 既存会員）」に、
     * LINE公式は経過だけに分ける。prodLinePush + prodDay0 + prodD1_30 + prodD31 = jobAdBySource.product。
     */
    breakdown: {
        prodLinePush: number
        prodDay0: number
        prodD1_30: number
        prodD31: number
        lineDay0: number
        lineD1_30: number
        lineD31: number
    }

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
    /** 会員全体の LINE 連携率（現在値。月次ではない） */
    lineRateAll: number | null
    /** 集計に含めた最終日（JST の昨日） */
    dataTo: string
    scannedBytes: number
    fetchedAt: string
}

export type BusinessKpiResponse = BusinessKpiReport & { success: true }
