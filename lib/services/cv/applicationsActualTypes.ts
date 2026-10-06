/** 応募の全体像（/api/applications/actual、DynamoDB 実数）の型 */

export type ApplicationLayer = 'natural' | 'featured' | 'scout' | 'caReferral' | 'other'

export interface ApplicationCell {
    member: number
    guest: number
}

export interface ApplicationTypeRow {
    /** 人材紹介 / 求人広告 / ハローワーク / その他/不明 */
    label: string
    layers: Record<ApplicationLayer, ApplicationCell>
    total: number
}

export interface ApplicationsActualReport {
    types: ApplicationTypeRow[]
    grandTotal: number
    memberTotal: number
    guestTotal: number
    signup: {
        /** 応募と同時（10 分以内）に登録したユーザー */
        withApplication: number
        withApplicationByType: Record<string, number>
        /** 登録のみ（GA4 の thanks 到達 UU）。propertyId が無い・取れないときは null */
        standalone: number | null
        /** userId 欠落等で同時登録を判定できなかった応募 */
        unknownUserApps: number
    }
}

export interface ApplicationsActualResponse extends ApplicationsActualReport {
    success: true
    startDate: string
    endDate: string
    fetchedAt: string
}
