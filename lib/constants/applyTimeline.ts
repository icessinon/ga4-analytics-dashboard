/**
 * 応募の数字を動かしうる「できごと」の年表。応募推移ページ（/apply-trend）のグラフに
 * 縦線として重ねる。考え方は会員登録側（signupTimeline.ts）と同じ。
 *
 * - 自動: 対象面（genre）が「応募｜求人一覧」「応募｜求人詳細」「応募フォーム」のABテスト。
 *   ダッシュボードにABテストを登録すれば applyTrendService が DB から拾って線にする。
 * - 手動: リリース・恒久化・計測変更と、上記以外の面だが応募に効くもの。ここに 1 行足す。
 *
 * 同じABテストが両方にあるときは、結果まで書けるここの記述を優先する（abTestId で突き合わせ）。
 */

import type { SignupTimelineEvent } from './signupTimeline'

export type ApplyTimelineEvent = SignupTimelineEvent

/** ABテストDBから自動で拾う対象面（lib/constants/abTestGenres.ts の語彙） */
export const APPLY_AB_TEST_GENRES = ['応募｜求人一覧', '応募｜求人詳細', '応募フォーム'] as const

export const APPLY_TIMELINE: ApplyTimelineEvent[] = [
    {
        date: '2026-08-13', kind: 'measurement',
        title: '社内IPの内部トラフィック除外',
        detail: 'GA4 の分母が約2%減る不連続点。応募数（プロダクトDB）には影響しない。',
    },
    {
        date: '2026-08-25', endDate: '2026-08-28', kind: 'ab', abTestId: 5, issue: 1803,
        title: '求人一覧カードの圧縮AB',
        detail: '一覧カードを絵文字中心にしてテキストを減らす。8/28 に B 採用で恒久化。',
    },
    {
        date: '2026-08-25', endDate: '2026-09-07', kind: 'ab', abTestId: 3, issue: 1804,
        title: '求人詳細のFV概要化ABC（＋モザイク化1808）',
        detail: 'SP の求人詳細ファーストビューをタイトル・主要属性・CTA の概要構成に。同日にハローワーク詳細のモザイク化（1808・id=4）も開始。9/8 にどちらも B 寄せで恒久化（#3490）。',
    },
    {
        date: '2026-09-01', endDate: '2026-09-15', kind: 'ab', abTestId: 6, issue: 1848,
        title: '一覧のキープを「お問い合わせ」ボタンに変更',
        detail: 'キープボタンを応募導線に変える。9/18 に B 寄せで畳む（#3686）。',
    },
    {
        date: '2026-09-08', kind: 'release', issue: 1804,
        title: 'FV概要化・モザイクを全員へ',
        detail: '1804 / 1808 を B 寄せで恒久化（#3490）。',
    },
    {
        date: '2026-09-09', endDate: '2026-09-16', kind: 'ab', abTestId: 7, issue: 1802,
        title: '求人詳細の追従応募ボタン最適化',
        detail: '詳細ページの追従CTA。9/18 に A 寄せで畳む（#3686）＝ B は採用せず。',
    },
    {
        date: '2026-09-19', endDate: '2026-10-13', kind: 'ab', abTestId: 12, issue: 1859,
        title: '応募フォーム遷移の同一タブ化',
        detail: '詳細→フォームを別タブから同一タブへ。10/13 に B 寄せで畳む（1882・#3998）。',
    },
    {
        date: '2026-10-13', kind: 'release', issue: 1882,
        title: '応募フォームの同一タブ遷移を全員へ',
        detail: 'AB-1859 を B 寄せで畳む（#3998）。',
    },
    {
        date: '2026-10-14', endDate: '2026-12-14', kind: 'ab', abTestId: 16, issue: 1878,
        title: '求人詳細の魅力文を全文表示',
        detail: '「もっと見る」で畳んでいた魅力文を全文表示にする（/entry は対象外）。',
    },
    {
        date: '2026-10-15', endDate: '2026-10-26', kind: 'ab', abTestId: 15, issue: 1871,
        title: '応募フォームの見出し直下に求人情報',
        detail: 'A=現行帯 / B=要約カード / C=追従ボタン＋モーダル。応募フォーム全体に計測サフィックスを付与。',
    },
    {
        date: '2026-10-16', endDate: '2026-10-29', kind: 'ab', abTestId: 18, issue: 1867,
        title: '求人一覧にマッチ度★5段階',
        detail: '会員登録情報を使ったマッチ度を一覧カードに表示。一覧→詳細の遷移率が狙い。',
    },
]

/** 期間に重なるできごとを日付順で返す */
export function applyEventsIn(startDate: string, endDate: string): ApplyTimelineEvent[] {
    return APPLY_TIMELINE.filter((e) => e.date >= startDate && e.date <= endDate)
        .sort((a, b) => a.date.localeCompare(b.date))
}
