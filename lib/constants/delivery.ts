/** 配信レポート（SMS / メール / LINE）で画面とサーバーの両方が使う定数。 */

export type DeliveryChannel = 'mail' | 'sms' | 'line'

export const DELIVERY_CHANNELS: readonly DeliveryChannel[] = ['sms', 'mail', 'line'] as const

export const CHANNEL_LABEL: Record<DeliveryChannel, string> = {
    mail: 'メール',
    sms: 'SMS',
    line: 'LINE',
}

/**
 * 開封を計測できるのはメールだけ（SES / B-Dash の開封ピクセル）。
 * SMS と LINE には開封イベントが存在しないので、チャネル比較は必ずクリック・着地で行う。
 */
export const CHANNEL_HAS_OPEN: Record<DeliveryChannel, boolean> = {
    mail: true,
    sms: false,
    line: false,
}

/**
 * B-Dash の action_log は 2026-09-11 と 09-13 の partition に全量バックフィル（各 15〜17GB）が
 * 入っていて、日次増分はこの日から。これより前を imported_at で引くと巨大スキャンになるため下限にする。
 */
export const BDASH_INCREMENTAL_START = '2026-09-14'

/** 出典。画面で「どのログから出した数字か」を必ず示す */
export type DeliverySource = 'bdash' | 'messaging' | 'line_unit'

export const SOURCE_LABEL: Record<DeliverySource, string> = {
    bdash: 'B-Dash 一斉配信',
    messaging: '本体通知基盤',
    line_unit: 'LINEおすすめ求人配信',
}

/**
 * 配信の絞り込み。**出典の切り替えではない**。
 * どちらを選んでも B-Dash 一斉配信・本体通知基盤・SES・GA4 の 4 つを読む。
 * 変わるのは B-Dash の中をクロスワークの配信だけに絞るかどうかだけ。
 */
/**
 * 社内ドメイン。ここ宛だけの配信は検証・テストとみなして既定で除外する。
 *
 * 実測（2026-09-14〜10-08）:
 * - 本体メール（SES）6,181 通のうち 30 通が社内宛のみ。`nakamori.takuya+11@` のような
 *   plus アドレスで法人アカウントの動作確認をしているもの、`ebina+verify3436@` の
 *   アカウント発行確認など
 * - B-Dash 一斉配信のクロスワーク分には社内宛は無い（運送/車両/荷主SaaS の配信にはある）
 *
 * **CC に社内アドレスが入っているだけの業務メールは除外しない。**「求職者のご紹介」は
 * CA が企業へ送る正規のメールで、担当者が CC に入る。宛先が **すべて** 社内のときだけ落とす。
 */
export const INTERNAL_MAIL_DOMAIN = 'xmile.co.jp'

export type DeliveryScope = 'xwork' | 'all'

export const SCOPE_LABEL: Record<DeliveryScope, string> = {
    xwork: 'クロスワークのみ',
    all: 'グループ全社',
}

export const SCOPE_HINT: Record<DeliveryScope, string> = {
    xwork: 'B-Dash 内の絞り込み',
    all: '車両SaaS・運送SaaS 等も含む',
}

/** 施策別・件名別の表に出す出典の絞り込み。'all' は絞らない */
export type SourceFilter = DeliverySource | 'all'

export const SOURCE_FILTER_LABEL: Record<SourceFilter, string> = {
    all: 'すべて',
    bdash: 'B-Dash 一斉配信',
    messaging: '本体通知基盤',
    line_unit: 'LINEおすすめ求人配信',
}
