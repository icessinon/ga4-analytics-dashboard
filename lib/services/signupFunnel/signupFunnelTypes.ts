/** 会員登録フォームファネル（/api/signup-funnel, /api/signup-funnel/trend）の型 */

export interface SignupFunnelQuestion {
    name: string
    /** 質問画面を見たユニークユーザー */
    view: number
    /** 前進操作（選択肢・次へ）をしたユニークユーザー */
    click: number
    /** この質問が存在する AB 変種の数 */
    variants: number
}

export interface SignupFunnelReport {
    forms: Array<{ key: string; label: string }>
    form: string
    formLabel: string
    /** 職種選択ボタンのクリックユーザー（起点）。ボタン定義が無い職種は null */
    origin: number | null
    questions: SignupFunnelQuestion[]
    /** (variant, step) の対応が取れず質問に割り当てられなかったクリック */
    unassignedClicks: number
}

export interface SignupFunnelResponse extends SignupFunnelReport {
    success: true
    startDate: string
    endDate: string
    fetchedAt: string
}

export interface SignupTrendForm {
    key: string
    label: string
    clicks: number[]
    completed: number[]
}

export interface SignupTrendReport {
    /** 'YYYYMMDD' 昇順 */
    dates: string[]
    overall: { clicks: number[]; completed: number[]; formUsers: number[] }
    forms: SignupTrendForm[]
}

export interface SignupTrendResponse extends SignupTrendReport {
    success: true
    startDate: string
    endDate: string
    fetchedAt: string
}
