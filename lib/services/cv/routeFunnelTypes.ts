/** 経路別ファネル（/api/cv-types/route-funnel）の型 */

export interface RouteFunnelSide {
    detail: number
    form: number
    complete: number
}

export interface RouteFunnelType {
    key: string
    label: string
    /** 一覧（検索・職種一覧）→ 詳細 → フォーム → 完了 */
    viaList: RouteFunnelSide
    /** 全体 − 一覧経由（差分推定） */
    direct: RouteFunnelSide
}

export interface RouteFunnelReport {
    /** 一覧ページを閲覧したユーザー（ファネル 1 段目の最大値） */
    listUsers: number
    types: RouteFunnelType[]
    totals: { viaList: RouteFunnelSide; direct: RouteFunnelSide }
}

export interface RouteFunnelResponse extends RouteFunnelReport {
    success: true
    startDate: string
    endDate: string
    fetchedAt: string
}
