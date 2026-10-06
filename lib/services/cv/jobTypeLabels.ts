/**
 * 求人種別（contractType）と drm-front の GTM ラベル規則。
 * cv-types / apply-fields / cv-value / route-funnel が同じ文字列を組み立てるので 1 箇所に置く。
 */

export const JOB_TYPES = [
    { key: 'JobR', label: '人材紹介' },
    { key: 'JobA', label: '求人広告' },
    { key: 'JobH', label: 'ハローワーク' },
] as const

export type JobTypeKey = (typeof JOB_TYPES)[number]['key']

// 完了 = 応募フォームの送信ボタンクリック（クリック基準）。
// 送信ボタンは入力完了までdisabledのため「クリック=応募実行」であり、
// DynamoDBの実応募数と一致することを確認済み（2026-07-22、求人広告54件で完全一致）。
// 視認条件がなくbotの影響も受けない。
export const completeClickLabel = (key: string) => `EF__${key}__Btn__${key === 'JobA' ? '応募する' : '話を聞いてみる'}`
/** 応募フォームのヘッダ表示（フォーム到達） */
export const formLabel = (key: string) => `EF__${key}__Area__Header`
/** 求人詳細の種別セクション表示（詳細閲覧） */
export const detailLabel = (key: string) => `DL__Media__Area__${key}`

// 応募フォームの入力項目（フォーム内の並び順）。項目タップ=着手のファネルに使う。
// 種別によって項目構成が異なる（ゲスト可の人材紹介/HWはパスワード等なし）
export const FORM_FIELDS = ['氏名', 'フリガナ', '生まれ年', '郵便番号', '電話番号', 'メールアドレス', 'パスワード', '保有免許・資格']
export const fieldLabel = (key: string, field: string) => `EF__${key}__Field__${field}`

// 一覧ページ（検索・大職種一覧）。一覧経由の詳細到達を pageReferrer で近似判定する
export const LIST_PATHS = [
    'search', 'driver', 'sekokan', 'sekkei', 'soko', 'shokunin', 'seibi', 'hoshu',
    'setsubi-sagyo', 'keibi', 'unkan', 'kojo-sagyo', 'food', 'unyu-sagyo', 'others',
]

export type ChannelKey = 'organic' | 'direct' | 'crm' | 'paid' | 'other'

/** チャネルの表示グルーピング（GA4 sessionDefaultChannelGroup → 表示用キー） */
export function channelKey(group: string): ChannelKey {
    if (group === 'Organic Search') return 'organic'
    if (group === 'Direct') return 'direct'
    if (group === 'SMS' || group === 'Email' || group === 'Mobile Push Notifications') return 'crm'
    if (group.startsWith('Paid')) return 'paid'
    return 'other'
}
