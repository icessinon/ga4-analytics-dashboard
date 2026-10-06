/** ページフロー分析（/api/pageflow）の型 */

export interface PageFlowNextRow {
    page: string
    users: number
}

export interface PageFlowPrevRow {
    page: string
    users: number
    /** 対象ページへ到達した PV */
    pv: number
    /** 経路ページ自体の表示 PV（外部サイトは取れないので null） */
    sourcePv: number | null
    /** 到達PV ÷ 経路ページの表示PV */
    transitionRate: number | null
}

export interface PageFlowReport {
    pagePath: string
    targetUsers: number
    prevPages: PageFlowPrevRow[]
    prevNoReferrer: number
    nextPages: PageFlowNextRow[]
}

export type PageFlowResponse = PageFlowReport & { startDate: string; endDate: string }
