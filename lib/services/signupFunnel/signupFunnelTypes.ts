/** 会員登録フォームファネル（/api/signup-funnel, /api/signup-funnel/trend）の型 */

export interface SignupFunnelQuestion {
    name: string
    /** 質問画面を見たユニークユーザー。view ラベルは1問目しか発火しないため多くの質問で 0 になる */
    view: number
    /** 前進操作（選択肢・次へ）をしたユニークユーザー。ファネルの段はこちらが正 */
    click: number
    /** この質問が存在する AB 変種の数 */
    variants: number
    /** 1 = 会員成立まで（フェーズ1） / 2 = 会員成立後の職種別設問（フェーズ2） */
    phase: 1 | 2
    /** 会員成立ライン（パスワード →「登録する」）の質問か */
    isCutoff: boolean
    /** view ラベルが無く、2段階フローの固定順から質問名を推定したか */
    nameInferred: boolean
    /** 質問名が復元できないときの手がかり（その質問で最も多かった選択肢） */
    hint: string | null
}

export interface SignupFunnelDbCounts {
    /** 期間内に会員登録フォームから作られた会員（signup_kind = plain_signup） */
    members: number
    /** そのうちフェーズ2を保存した会員 */
    phase2Saved: number
    /** フェーズ1で止まっている会員（プロフィール未作成のまま） */
    phase2Unsaved: number
}

/** プロダクトDB（xmile-drm.xwork.member_users）による会員成立・フェーズ2完了の実数 */
export interface SignupFunnelDb {
    /** 選択中フォームの職種に一致する分。希望職種の大分類で突合し、一致が無ければ null */
    form: SignupFunnelDbCounts | null
    /** 全職種合計 */
    overall: SignupFunnelDbCounts
}

export interface SignupFunnelReport {
    forms: Array<{ key: string; label: string }>
    form: string
    formLabel: string
    /** 職種選択ボタンのクリックユーザー（起点）。ボタン定義が無い職種は null */
    origin: number | null
    questions: SignupFunnelQuestion[]
    /** 会員成立（フェーズ1完了）のクリックユーザー。成立ラインが見つからなければ null */
    memberCreated: number | null
    /** ステップ番号を持たず質問に割り当てられなかったクリック */
    unassignedClicks: number
    /** プロダクトDBの実数。取得に失敗したら null（GA4 側だけで表示する） */
    db: SignupFunnelDb | null
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
