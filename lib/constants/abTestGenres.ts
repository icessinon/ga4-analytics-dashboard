/**
 * ABテストの対象面（ジャンル）。
 *
 * 語彙は Notion「課題・施策アイディア」DB のセレクト「ジャンル」と同じものを使う。
 * 施策カードとダッシュボードで面の呼び方がズレると突き合わせができなくなるため、
 * 選択肢を足すときは Notion 側のオプションも揃えること。
 */

export const AB_TEST_GENRES = [
    '会員登録',
    '応募｜求人一覧',
    '応募｜求人詳細',
    '応募フォーム',
    '求人検索',
    'スカウト',
    'マイページ・再訪',
    '通知・CRM',
    'TOP',
    'manage',
    'admin',
    '分析・ダッシュボード',
    'その他',
] as const

export type AbTestGenre = (typeof AB_TEST_GENRES)[number]

export function isAbTestGenre(value: unknown): value is AbTestGenre {
    return typeof value === 'string' && (AB_TEST_GENRES as readonly string[]).includes(value)
}

/**
 * CVR 設定のラベル接頭辞（`{Area}__{Section}__…`）から面を推定する。
 * ジャンル未設定のテストの初期値を提案するためだけに使う。
 * ラベルは「計測している面」であって「変更を加えた面」とは限らないので、推定値は保存前に人が確認する。
 */
const AREA_TO_GENRE: Record<string, AbTestGenre> = {
    SU: '会員登録',
    EF: '応募フォーム',
    DL: '応募｜求人詳細',
    CT: '応募｜求人一覧',
    MW: '求人検索',
    SC: 'スカウト',
}

export function guessGenreFromLabels(labels: readonly string[]): AbTestGenre | null {
    for (const label of labels) {
        const area = label.split('__')[0]?.trim()
        if (area && AREA_TO_GENRE[area]) return AREA_TO_GENRE[area]
    }
    return null
}
