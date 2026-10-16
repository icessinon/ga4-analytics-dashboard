/** 応募の推移（/api/apply-trend, /api/apply-trend/funnel）の型 */

import type { ApplyTimelineEvent } from '@/lib/constants/applyTimeline'

export interface ApplyTrendDay {
    date: string
    /** 会員応募の合計（プロダクトDB・契約種別の合計）。ゲスト応募は含まない */
    total: number
    /** 求人広告 */
    jobAd: number
    /** 人材紹介 */
    agent: number
    /** ハローワーク */
    hw: number
    /** ゲスト応募（人材紹介LP経由・会員を介さない）。total には含めない参考値 */
    guest: number
}

export interface ApplyTrendBucket {
    start: string
    end: string
    label: string
    total: number
    jobAd: number
    agent: number
    hw: number
    guest: number
    perDay: number
    partial: boolean
}

export interface ApplyTrendReport {
    daily: ApplyTrendDay[]
    weekly: ApplyTrendBucket[]
    monthly: ApplyTrendBucket[]
    events: ApplyTimelineEvent[]
    total: ApplyTrendBucket
    scannedBytes: number
}

export interface ApplyTrendResponse extends ApplyTrendReport {
    success: true
    startDate: string
    endDate: string
    fetchedAt: string
}

/** 一覧を見たセッションの、詳細 → 応募フォーム → 完了への到達 */
export interface ApplyFunnelBucket {
    start: string
    end: string
    label: string
    /** 求人一覧（/search・業種/職種一覧）を見たセッション */
    sessions: number
    /** そのうち同じセッションで求人詳細へ進んだ */
    toDetail: number
    /** そのうち応募フォームまで進んだ */
    toForm: number
    /** そのうち応募完了（/entry/thanks）まで行った */
    toDone: number
    partial: boolean
}

export interface ApplyFunnelReport {
    /** 実際に集計した期間（BigQuery エクスポートの範囲に丸めた後） */
    startDate: string
    endDate: string
    /** 期間がエクスポート範囲・上限日数で切り詰められたか */
    clamped: boolean
    weekly: ApplyFunnelBucket[]
    total: ApplyFunnelBucket
    scannedBytes: number
}

export interface ApplyFunnelResponse extends ApplyFunnelReport {
    success: true
    fetchedAt: string
}
