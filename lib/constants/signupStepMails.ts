/**
 * 会員登録後ステップメールの定義。
 * drm-front の apps/infra/drm-infra/stacks/SignupStepMailsStack/lambda/SignupStepMailFunction/templates.ts
 * にある SIGNUP_STEPS と対応する。向こうを変えたらこちらも合わせる。
 *
 * 件名は day7 / day14 が氏名・エリアを差し込む可変文面なので、ここでは代表的な要約を持つ。
 * 実績の突合は件名ではなく DeliveryRecords の sentIdempotencyKey（末尾がステップキー）で行う。
 */

export interface SignupStepDef {
    key: string
    offsetDays: number
    label: string
    /** 何を促すメールか */
    intent: string
}

export const SIGNUP_STEPS: SignupStepDef[] = [
    { key: 'day1', offsetDays: 1, label: 'Day1 プロフィール入力', intent: 'プロフィールを埋めてスカウトを受け取れる状態にする' },
    { key: 'day3', offsetDays: 3, label: 'Day3 LINE連携', intent: 'LINE連携して選考の連絡を見逃さないようにする' },
    { key: 'day7', offsetDays: 7, label: 'Day7 おすすめ求人', intent: '希望条件に近い求人を見せてキープを促す（エリア・件数を差し込み）' },
    { key: 'day14', offsetDays: 14, label: 'Day14 キープ求人の確認', intent: 'キープした求人の募集終了前に応募を促す' },
    { key: 'day30', offsetDays: 30, label: 'Day30 条件の見直し', intent: '条件を広げて閲覧できる求人を増やす' },
]

export const SIGNUP_STEP_TOPIC = 'signup_step_mail'

/** スケジュールの状態。drm-front の StepMailStatus と対応 */
export const STEP_MAIL_STATUS_LABEL: Record<string, string> = {
    active: '配信中',
    completed: '完了（全ステップ送信済み）',
    withdrawn: '退会により打ち切り',
    expired: '最終ステップから猶予超過で打ち切り',
}
