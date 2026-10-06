/**
 * 会員登録フォームの職種選択ボタン（SU__Jobs__Btn__{職種名}）と GA4 フォームキーの対応。
 * drm-front members/signup の groupedOccupations 準拠。/members/signup/thanks?occ= にも同じキーが入る。
 */

export const JOBS_BTN_LABEL: Record<string, string> = {
    Driver: 'ドライバー・運転手',
    Unkan: '運行管理・車両管理',
    Soko: '倉庫・フォークリフト',
    Taxi: 'タクシードライバー',
    Bus: 'バスドライバー',
    Sekokan: '施工管理',
    Sekkei: '設計・積算・測量',
    Hoshu: '建物保守・点検',
    SetsubiSagyo: '設備工事作業員',
    Shokunin: '職人',
    Seibi: '自動車整備士・検査員',
    KojoSagyo: '製造',
    Keibi: '警備員',
    Food: '飲食',
    Others: '営業・事務職その他',
}

/** 職種選択ボタンのラベル → フォームキー（逆引き） */
export const BTN_LABEL_TO_FORM: Record<string, string> = Object.fromEntries(
    Object.entries(JOBS_BTN_LABEL).map(([key, label]) => [label, key])
)
