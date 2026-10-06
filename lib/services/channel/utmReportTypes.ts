/** UTM別レポート（/api/utm-report）の型 */

export interface UtmRow {
    source: string
    medium: string
    campaign: string
    content: string
    sessions: number
    users: number
    applyCv: number
    lpApplyCv: number
    signupCv: number
}

export interface UtmReportReport {
    rows: UtmRow[]
}

export interface UtmReportResponse extends UtmReportReport {
    success: true
    startDate: string
    endDate: string
    fetchedAt: string
}
