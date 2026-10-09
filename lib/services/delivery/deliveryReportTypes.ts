/** 配信レポート（POST /api/delivery-report）の型。クライアントは import type でここを参照する */

import type { DeliveryChannel, DeliveryScope, DeliverySource } from '@/lib/constants/delivery'

export interface DeliveryRates {
    /** 開封 ÷ 送達。開封を計測できないチャネルは null */
    openRate: number | null
    /** クリック ÷ 送達 */
    clickRate: number | null
    /** クリック ÷ 開封。メールのみ */
    ctorRate: number | null
}

export interface DeliveryCounts {
    tried: number
    /** メール=SES Delivery / SMS=事業者受付 / LINE=配信成功。取れないときは null */
    delivered: number | null
    /** 開封。SMS・LINE は計測手段が無いので null（0 ではない） */
    opened: number | null
    clicked: number | null
    failed: number
    unsubscribed: number
}

export interface ChannelSummaryRow extends DeliveryCounts, DeliveryRates {
    channel: DeliveryChannel
    /** 送信先の実人数（分かるソースのみ） */
    people: number | null
    /** GA4 でこのチャネル経由と判定できた着地セッション */
    ga4Sessions: number
    ga4Users: number
}

export interface CampaignRow extends DeliveryCounts, DeliveryRates {
    source: DeliverySource
    channel: DeliveryChannel
    /** 施策名。B-Dash は campaign_name から連番・ID 接頭辞を落としたもの、本体は topic */
    name: string
    people: number | null
    /** SMS 短縮URLのリダイレクト数。bot やプリフェッチを含み過大なので参考値 */
    redirectClicked: number | null
}

export interface SubjectRow extends DeliveryRates {
    /**
     * 開封・クリックを計測しているか。SES の設定が件名の種類ごとに違い、
     * Open / Click を一度も publish していないメールがある。
     * false のとき率は null で、画面は 0% ではなく「計測なし」と出す。
     */
    openTracked: boolean
    clickTracked: boolean
    source: DeliverySource
    channel: DeliveryChannel
    subject: string
    /** 期間内に 1 つ以上イベントが観測されたメッセージ数。率の分母はこれ */
    messages: number
    sent: number
    delivered: number
    opened: number
    clicked: number
    bounced: number
}

export interface Ga4LandingRow {
    source: string
    medium: string
    /** 数字を N に潰した campaign。生の campaign は数万種あって読めない */
    campaignGroup: string
    sessions: number
    users: number
}

export interface LineUnitRow {
    unit: string
    linkedUsers: number
    jobsAvailableUsers: number
    successUsers: number
    errorUsers: number
    notToReceiveUsers: number
    deliveries: number
    lastDeliveredAt: string | null
}

export interface DeliveryReport {
    scope: DeliveryScope
    /** 社内ドメイン宛だけの配信（検証・テスト）を除外したか */
    excludeInternal: boolean
    /** 除外した件数。0 なら「テスト配信は無かった」と読める */
    excludedInternal: { bdashMail: number; sesMessages: number }
    startDate: string
    endDate: string
    /** 要求期間が B-Dash の増分開始日より前だったので切り詰めた */
    clamped: boolean
    channels: ChannelSummaryRow[]
    campaigns: CampaignRow[]
    subjects: SubjectRow[]
    ga4: Ga4LandingRow[]
    lineUnits: LineUnitRow[]
    /** この 1 回の実行で BigQuery がスキャンしたバイト数（コスト表示用） */
    scannedBytes: number
    fetchedAt: string
}

export type DeliveryReportResponse = DeliveryReport & { success: true }
