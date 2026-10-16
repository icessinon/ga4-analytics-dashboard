/** 会員登録推移（/api/signup-trend）の型 */

import type { SignupTimelineEvent } from '@/lib/constants/signupTimeline'

export interface SignupTrendDay {
    /** YYYY-MM-DD（JST） */
    date: string
    /** 会員登録数（プロダクトDB） */
    reg: number
    /** 単独登録 */
    plain: number
    /** 応募と同時の登録 */
    apply: number
    /** 単独登録のうちフェーズ2未完了（現在のご状況が空） */
    phase2Unsaved: number
}

export interface SignupTrendBucket {
    /** バケットの開始日 */
    start: string
    /** バケットの終了日（期間の端で切れている場合は実データの最終日） */
    end: string
    label: string
    reg: number
    plain: number
    apply: number
    phase2Unsaved: number
    /** 1日あたりの会員登録数 */
    perDay: number
    /** /members/signup に来たユーザー（期間ユニーク・GA4） */
    formUsers: number
    /** /members/signup/thanks に到達したユーザー（期間ユニーク・GA4） */
    completedUsers: number
    /** 会員登録率（completedUsers / formUsers）。分母0なら null */
    rate: number | null
    /** 期間の端で日数が欠けているバケット */
    partial: boolean
}

export interface SignupTrendReport {
    daily: SignupTrendDay[]
    weekly: SignupTrendBucket[]
    monthly: SignupTrendBucket[]
    /** 期間に重なるできごと（ABテスト・リリース・計測変更） */
    events: SignupTimelineEvent[]
    /** 期間全体の合計 */
    total: SignupTrendBucket
    /** BigQuery のスキャン量（バイト） */
    scannedBytes: number
}

export interface SignupTrendResponse extends SignupTrendReport {
    success: true
    startDate: string
    endDate: string
    fetchedAt: string
}
