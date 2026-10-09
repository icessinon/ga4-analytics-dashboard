/** スカウト効果ファネル（/api/scout/funnel）の型 */

export interface ScoutFunnelSummary {
    requested: number
    sent: number
    failed: number
    skipped: number
    viewedUsers: number
    viewedSessions: number
    /** 閲覧された scoutId の数 */
    viewedScoutIds: number
    formReachedUsers: number
    appliedUsers: number
}

export interface ScoutHourlyRow {
    /** JST 0〜23 */
    hour: number
    sent: number
    /** 送達のうち scoutId が閲覧された数 */
    viewed: number
    topCompanyName: string | null
}

export interface ScoutDailyRow {
    date: string
    requested: number
    viewed: number
    applied: number
}

export interface ScoutCompanyRow {
    companyId: string
    companyName: string | null
    requested: number
    sent: number
    viewed: number
    applied: number
}

export interface ScoutCompanyDailyRow {
    companyId: string
    companyName: string | null
    requested: number[]
    viewed: number[]
    applied: number[]
}

/** 本体の 1:1 スカウトか、B-Dash の一斉配信か */
export type ScoutChannelSystem = 'direct' | 'bulk'

export interface ScoutChannelRow {
    system: ScoutChannelSystem
    /** unknown は medium_last が sms / email のどちらでもなかったもの */
    channel: 'sms' | 'mail' | 'unknown'
    /** 送信数。一斉配信は B-Dash 側にしか無いので null */
    sent: number | null
    applied: number
    applyRate: number | null
}

export interface ScoutFunnelReport {
    summary: ScoutFunnelSummary
    hourly: ScoutHourlyRow[]
    daily: ScoutDailyRow[]
    companies: ScoutCompanyRow[]
    companyDaily: ScoutCompanyDailyRow[]
    /** 応募のチャネル内訳（プロダクトDB）。ファネル本体とは出典が違う */
    channels: ScoutChannelRow[]
}

export interface ScoutFunnelResponse extends ScoutFunnelReport {
    success: true
    startDate: string
    endDate: string
    fetchedAt: string
}
