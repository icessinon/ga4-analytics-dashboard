/** 会員登録後ステップメール実績（POST /api/signup-step-mails）の型。クライアントは import type でここを参照する */

import type { SignupStepDef } from '@/lib/constants/signupStepMails'

export interface MailCounts {
    sent: number
    delivered: number
    opened: number
    clicked: number
    bounced: number
    /** 送ろうとして落ちた */
    failed: number
    /** 配信停止・アドレス無しなど、送るべきでなかった人（送信失敗とは別物） */
    skipped: number
}

export interface StepMailRow extends SignupStepDef, MailCounts {
    /** 分母は配信成功（Delivery） */
    openRate: number | null
    clickRate: number | null
    /** クリック ÷ 開封 */
    ctorRate: number | null
    /** このステップの到達待ち（active なスケジュールの次ステップがこれ） */
    pendingUsers: number
}

export interface DailyMailRow extends MailCounts {
    date: string
    openRate: number | null
}

export interface SignupStepMailsReport {
    days: number
    since: string
    steps: StepMailRow[]
    daily: DailyMailRow[]
    totals: MailCounts & { openRate: number | null; clickRate: number | null }
    schedules: { total: number; byStatus: Record<string, number>; firstRegisteredAt: string | null }
    skipReasons: Record<string, number>
    /** 送達記録のうち SES イベントと突合できなかった件数（連携遅延） */
    unmatchedMessages: number
    /** 日次 Lambda の発火時刻（JST）。当日分がこの時刻まで 0 なのは正常 */
    cronHourJst: number
    todayJst: string
    fetchedAt: string
}

export type SignupStepMailsResponse = SignupStepMailsReport & { success: true }
