/**
 * 会員登録の数字を動かしうる「できごと」の年表。会員登録推移ページ（/signup-trend）の
 * グラフに縦線として重ねる。
 *
 * **自動で増える分と、手で足す分がある。**
 * - 自動: 対象面（genre）が「会員登録」のABテスト。ダッシュボードにABテストを登録すれば
 *   signupTrendService が DB から拾って線にする。ここに書かなくてよい。
 * - 手動: リリース・恒久化・計測変更と、**会員登録以外の面だが会員登録に効くもの**
 *   （求人詳細のモザイク化など）。これはここに 1 行足す。
 *   日付は本番へ出た日（drm-front の develop マージ日とほぼ同じ。ズレるのは当日夕方以降のマージ）。
 *
 * 同じABテストが両方にあるときは、結果まで書けるここの記述を優先する（abTestId で突き合わせ）。
 *
 * kind:
 *   ab          … ABテスト（endDate まで一部ユーザーだけに出ている）
 *   release     … 全ユーザーへのリリース・恒久化
 *   measurement … 計測側の変更（数字の不連続点。プロダクトの変更ではない）
 */

export type SignupTimelineKind = 'ab' | 'release' | 'measurement'

export interface SignupTimelineEvent {
    /** 本番に出た日（JST） */
    date: string
    kind: SignupTimelineKind
    /** グラフの凡例に出る短い名前 */
    title: string
    /** 一覧に出る説明。結果が出ているテストは結論まで書く */
    detail: string
    /** ABテストの終了日（kind='ab' のとき） */
    endDate?: string
    /** 本番ダッシュボードのABテストid（分かるもの） */
    abTestId?: number
    /** Backlog の課題番号 */
    issue?: number
    /** 'manual' = この年表に手で書いたもの / 'ab-test' = ABテストDBから自動で拾ったもの */
    source?: 'manual' | 'ab-test'
}

/**
 * ABテストDBから自動で拾うジャンル。ABテスト登録画面で対象面を「会員登録」にしておけば
 * 推移ページの年表に自動で線が増える（lib/constants/abTestGenres.ts の語彙）。
 * 会員登録以外の面でも会員登録に効くもの（求人詳細のモザイク等）は下の SIGNUP_TIMELINE に手で足す。
 */
export const SIGNUP_AB_TEST_GENRE = '会員登録'

export const SIGNUP_TIMELINE: SignupTimelineEvent[] = [
    {
        date: '2026-07-01', endDate: '2026-07-08', kind: 'ab', abTestId: 1, issue: 1618,
        title: '登録ページのヘッダー・フッター非表示AB',
        detail: 'フォームから離脱できる導線を消す。7/13 にテスト終了・全職種フォームへ適用。',
    },
    {
        date: '2026-07-22', endDate: '2026-07-29', kind: 'ab', abTestId: 2, issue: 1741,
        title: '重複3設問を「現在のご状況」1問に集約AB',
        detail: '設問数そのものを減らす。7/31 に driver で恒久化し全職種へ横展開（#3160）。',
    },
    {
        date: '2026-08-13', kind: 'measurement',
        title: '社内IPの内部トラフィック除外',
        detail: 'GA4 の分母が約2%減る不連続点。会員登録数（プロダクトDB）には影響しない。',
    },
    {
        date: '2026-08-25', endDate: '2026-09-07', kind: 'ab', abTestId: 4, issue: 1808,
        title: '求人詳細のモザイク化AB（＋FV概要化）',
        detail: 'ハローワーク求人詳細の一部を伏せて会員登録に促す（1808）。同日に求人詳細のFV概要化（1804・id=3）も開始。'
            + 'id=4 の計測CVは「話を聞いてみる」クリックで A 3.26%（176/5,396）> B 2.43%（126/5,178）。会員登録側では測っていない。',
    },
    {
        date: '2026-09-08', kind: 'release', issue: 1808,
        title: 'モザイク・FV概要化を全員へ',
        detail: '1804 / 1808 を B 寄せで恒久化（#3490）。以降の求人詳細は会員登録CTAを前に出す形。',
    },
    {
        date: '2026-09-15', endDate: '2026-10-05', kind: 'ab', abTestId: 8, issue: 1800,
        title: '会員登録フォームの2段階化ABC',
        detail: 'B 43.08%（252/585）vs A 35.36%（227/642）で +21.8%・有意性99%。C（設問順だけ入替）は 22.70% で大敗。',
    },
    {
        date: '2026-10-06', kind: 'release', issue: 1800,
        title: '2段階フォームを全員へ',
        detail: 'AB-1800 を B 寄せで畳む（#3892）。日次が約40件/日から約57件/日へ。',
    },
    {
        date: '2026-10-09', endDate: '2026-11-08', kind: 'ab', abTestId: 14, issue: 1844,
        title: '強み診断の導入',
        detail: 'ABではなく経路分離。TOP・業種トップのバナー → signup の前に2問 → サンクスで結果表示。',
    },
    {
        date: '2026-10-13', kind: 'release', issue: 1879,
        title: '流入元の職種を引き継ぎ（職種選択を省略）',
        detail: '求人詳細などから職種を引き継いで最初の設問を飛ばす。AB無しの全員適用。',
    },
    {
        date: '2026-10-14', endDate: '2027-01-31', kind: 'ab', abTestId: 17, issue: 1880,
        title: '登録ボタンの文言AB',
        detail: 'パスワード設問の確定ボタンを「登録する」vs「まずは無料登録する」。表示トグルも同梱。',
    },
    {
        date: '2026-10-16', endDate: '2026-10-29', kind: 'ab', abTestId: 18, issue: 1867,
        title: '求人一覧にマッチ度★5段階',
        detail: '会員登録情報を使ったマッチ度を一覧カードに出す。会員登録の動機づけが狙い。',
    },
]

/** 期間に重なるできごとを日付順で返す */
export function signupEventsIn(startDate: string, endDate: string): SignupTimelineEvent[] {
    return SIGNUP_TIMELINE.filter((e) => e.date >= startDate && e.date <= endDate)
        .sort((a, b) => a.date.localeCompare(b.date))
}
