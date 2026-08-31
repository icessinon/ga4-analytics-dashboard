/**
 * UTMカタログ: utm_source / utm_medium / utm_campaign の組み合わせを
 * 「どの施策のリンクか・いつ発行されるか」に解決する辞書。
 * 完全版リファレンスは docs/utm-naming-convention.md（コード実測＋GA4 BQ実流入で突合）。
 * UTM別集計ページ（/utm-report）が各行の注記に使う。
 *
 * 重要な前提: UTMには2種類ある。
 *  - 流入UTM（外部→サイト・新規セッション）= GA4のセッション帰属に計上され、ここで数字が見れる（attributed=true）
 *  - サイト内リンクUTM（既存セッションで踏む内部リンク）= GA4はUTMをセッション開始時のみ読むためほぼ計上されない（attributed=false）。
 *    リンククリック計測・リンク先/Salesforce識別が目的で、流入計測用ではない。
 */

export type UtmCategory =
    | 'product' // 自社プロダクト通知（メール/LINE push）
    | 'line' // LINE公式アカウント（リッチメニュー・サーベイ）
    | 'ca' // CA個別配信
    | 'scout' // スカウトSMS（マーケ一斉配信）
    | 'paid' // 広告
    | 'influencer' // インフルエンサー
    | 'internal' // サイト内リンク（帰属されない）
    | 'organic' // オーガニック検索
    | 'referral' // リファラル
    | 'ai' // AIアシスタント経由
    | 'direct' // 直接/未帰属
    | 'unknown'

export interface UtmCategoryMeta {
    label: string
    /** バッジ色（CSS） */
    color: string
    /** 流入計測としてUTM別に数字が意味を持つか */
    attributed: boolean
}

export const UTM_CATEGORY_META: Record<UtmCategory, UtmCategoryMeta> = {
    product: { label: '自社通知', color: '#60a5fa', attributed: true },
    line: { label: 'LINE公式', color: '#22c55e', attributed: true },
    ca: { label: 'CA配信', color: '#a78bfa', attributed: true },
    scout: { label: 'スカウトSMS', color: '#f59e0b', attributed: true },
    paid: { label: '広告', color: '#f472b6', attributed: true },
    influencer: { label: 'インフルエンサー', color: '#fb7185', attributed: true },
    internal: { label: 'サイト内リンク', color: '#6b7280', attributed: false },
    organic: { label: 'オーガニック', color: '#34d399', attributed: false },
    referral: { label: 'リファラル', color: '#38bdf8', attributed: false },
    ai: { label: 'AIアシスタント', color: '#c084fc', attributed: false },
    direct: { label: '直接/未帰属', color: '#9ca3af', attributed: false },
    unknown: { label: '不明', color: '#6b7280', attributed: false },
}

export interface UtmDescriptor {
    /** 施策名 */
    label: string
    /** いつ・どういう時に発行されるか */
    timing: string
    category: UtmCategory
    /** コード側の既知の不具合（あれば） */
    warning?: string
}

type Rule = {
    test: (s: string, m: string, c: string) => boolean
    describe: (s: string, m: string, c: string) => UtmDescriptor
}

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

// 上から順に最初にマッチしたルールを採用する（具体的なものを先に）
const RULES: Rule[] = [
    // ---- 自社プロダクト通知（source=product） ----
    {
        test: (s, m, c) => eq(s, 'product') && eq(m, 'line') && eq(c, 'job_description'),
        describe: () => ({ label: 'おすすめ求人LINE（→求人詳細）', timing: '毎週火曜のおすすめ求人LINE配信で、求人詳細へのリンクを踏んだとき', category: 'product' }),
    },
    {
        test: (s, m, c) => eq(s, 'product') && eq(m, 'line') && eq(c, 'entry_form'),
        describe: () => ({ label: 'おすすめ求人LINE（→応募フォーム）', timing: 'おすすめ求人LINE配信で、応募フォームへの直リンクを踏んだとき', category: 'product' }),
    },
    {
        test: (s, m, c) => eq(s, 'product') && eq(m, 'email') && eq(c, 'signup_complete'),
        describe: () => ({ label: '会員登録完了メール（ウェルカム）', timing: '会員登録完了直後に送られるウェルカムメール内のリンクを踏んだとき', category: 'product' }),
    },
    {
        test: (s, m, c) => eq(s, 'product') && eq(m, 'email') && eq(c, 'lp_thanks'),
        describe: () => ({ label: 'LP応募サンクス系メール', timing: 'LP応募後に送られるメール内のリンクを踏んだとき（発行元コードは未特定・配信基盤側の可能性）', category: 'product' }),
    },
    {
        test: (s, m, c) => eq(s, 'product') && eq(m, 'email') && /^keep_remider(_|$)/i.test(c),
        describe: (_s, _m, c) => ({
            label: `キープ求人リマインドメール${/1st/i.test(c) ? '（1通目）' : /2nd/i.test(c) ? '（2通目）' : /3rd/i.test(c) ? '（3通目）' : ''}`,
            timing: 'キープ（お気に入り）求人があるユーザーへの再訪促進リマインドメールを踏んだとき',
            category: 'product',
            warning: 'campaign名が keep_remider（正: keep_reminder のタイポ・n欠落）。実データにもタイポのまま流入',
        }),
    },

    // ---- LINE公式アカウント（source=line, medium=social） ----
    {
        test: (s, m, c) => eq(s, 'line') && eq(m, 'social') && eq(c, 'survey_thanks_scout'),
        describe: () => ({ label: 'サーベイ完了→スカウト誘導', timing: 'LINEサーベイ回答完了後のサンクスで、スカウト確認へ誘導するリンクを踏んだとき（会員登録CVRが突出）', category: 'line' }),
    },
    {
        test: (s, m, c) => eq(s, 'line') && eq(m, 'social') && /^richmenu_/i.test(c),
        describe: (_s, _m, c) => ({
            label: `LINEリッチメニュー: ${c.replace(/^richmenu_/i, '')}`,
            timing: 'LINE公式アカウントのリッチメニュー（常設タブ）をタップしたとき',
            category: 'line',
        }),
    },
    {
        test: (s, m) => eq(s, 'line') && eq(m, 'social'),
        describe: (_s, _m, c) => ({ label: `LINE公式配信: ${c}`, timing: 'LINE公式アカウントの配信/導線から流入したとき', category: 'line' }),
    },

    // ---- CA配信（source=ca） ----
    {
        test: (s, m) => eq(s, 'ca') && eq(m, 'line'),
        describe: (_s, _m, c) => ({ label: `CAからの求人提案LINE (${c})`, timing: 'キャリアアドバイザー(CA)が個別に送るLINE求人提案を踏んだとき', category: 'ca' }),
    },

    // ---- スカウトSMS（source=scout / crm_scout） ----
    {
        test: (s, m, c) => eq(s, 'scout') && eq(m, 'sms') && /^at_agent/i.test(c),
        describe: () => ({ label: '人材紹介スカウトSMS（agent）', timing: 'マーケ配信のスカウトSMS（人材紹介・手数料課金求人）を受け取り、リンクを踏んだとき', category: 'scout' }),
    },
    {
        test: (s, m, c) => (eq(s, 'crm_scout') || eq(s, 'scout')) && eq(m, 'sms') && /^at_direct/i.test(c),
        describe: () => ({ label: '求人広告スカウトSMS（direct）', timing: 'マーケ配信のスカウトSMS（求人広告・企業直接掲載求人）を受け取り、リンクを踏んだとき', category: 'scout' }),
    },
    {
        test: (s, m) => (eq(s, 'scout') || eq(s, 'crm_scout')) && eq(m, 'sms'),
        describe: () => ({ label: 'スカウトSMS', timing: 'マーケ配信のスカウトSMSを受け取り、リンクを踏んだとき（送客が目的で会員登録CVはほぼ0）', category: 'scout' }),
    },
    {
        test: (s, m) => eq(s, 'sms') && eq(m, 'scout'),
        describe: () => ({ label: 'スカウトSMS（本体発行）', timing: '本体のスカウト通知SMS（/scout/{scoutId}?utm_source=sms&utm_medium=scout）を踏んだとき', category: 'scout' }),
    },

    // ---- 広告 ----
    {
        test: (_s, m) => eq(m, 'cpc'),
        describe: (s) => ({ label: `検索連動型広告（${s}）`, timing: `${s}のリスティング広告（検索キーワード連動）をクリックしたとき`, category: 'paid' }),
    },
    {
        test: (_s, m) => eq(m, 'cpm') || eq(m, 'display') || eq(m, 'banner'),
        describe: (s) => ({ label: `ディスプレイ/SNS広告（${s}）`, timing: `${s}のディスプレイ/SNS広告（インプレッション課金）をクリックしたとき`, category: 'paid' }),
    },
    {
        test: (_s, m) => eq(m, 'influencer'),
        describe: (s) => ({ label: `インフルエンサー施策（${s}）`, timing: `インフルエンサーの投稿/概要欄リンク（${s}）から流入したとき`, category: 'influencer' }),
    },
    {
        // GoogleのP-MAX/クロスネットワークは配信面をまたぐため source/medium が (data not available) になる
        test: (s, m, c) => /cross-network/i.test(c) || eq(m, 'cross-network') || eq(m, 'cpc-cross-network'),
        describe: () => ({ label: 'クロスネットワーク広告（Google P-MAX等）', timing: 'GoogleのP-MAX/クロスネットワーク広告経由。複数の配信面をまたぐため個別の面は特定できない', category: 'paid' }),
    },

    // ---- サイト内リンクUTM（帰属されない・参考） ----
    {
        test: (s) => eq(s, 'xwork') || eq(s, 'thanks'),
        describe: (_s, _m, c) => ({
            label: `サイト内リンク: ${c}`,
            timing: 'フッター/サイドバー/バナー/LP誘導ボタンなど、既にサイト内に居るユーザーが踏む内部リンク。GA4のセッション帰属には計上されない（クリック計測・リンク先識別用）',
            category: 'internal',
        }),
    },

    // ---- 非UTM（medium/sourceから推定） ----
    {
        test: (_s, m) => eq(m, 'organic'),
        describe: (s) => ({ label: `オーガニック検索（${s}）`, timing: `${s}などの検索結果から自然流入したとき（UTMなし）`, category: 'organic' }),
    },
    {
        test: (_s, m) => eq(m, 'ai-assistant'),
        describe: (s) => ({ label: `AIアシスタント経由（${s}）`, timing: 'ChatGPT等のAIアシスタントの回答リンクから流入したとき（新興チャネル）', category: 'ai' }),
    },
    {
        test: (_s, m) => eq(m, 'referral'),
        describe: (s) => ({ label: `リファラル（${s}）`, timing: `${s}などの外部サイトのリンクから流入したとき（UTMなし）`, category: 'referral' }),
    },
    {
        test: (s, m) => (eq(s, '(direct)') || s === '' || eq(s, '(not set)')) && (eq(m, '(none)') || m === ''),
        describe: () => ({ label: '直接/未帰属', timing: 'ブックマーク・URL直打ち・アプリ内ブラウザのリファラ欠落など、流入元が特定できないアクセス', category: 'direct' }),
    },
    {
        // source/medium/campaign が全て取得不能（計測欠落・未割当）
        test: (s, m, c) => [s, m, c].every((v) => eq(v, '(not set)') || eq(v, '(data not available)') || v === ''),
        describe: () => ({ label: '計測欠落/未割当', timing: 'source/medium/campaignが全て取得できないセッション。2026-08-11〜のUnassignedインシデントやアプリ内ブラウザのリファラ欠落など。絶対数は割り引いて見る', category: 'direct' }),
    },
]

const DEFAULT: UtmDescriptor = { label: '（辞書未登録）', timing: 'カタログに未登録のUTM。docs/utm-naming-convention.md への追記を検討', category: 'unknown' }

/**
 * source / medium / campaign から施策の意味・発行タイミングを解決する。
 * 値は GA4 の生値（(none) / (direct) / (not set) 等を含む）を想定。
 */
export function describeUtm(source: string, medium: string, campaign: string): UtmDescriptor {
    const s = source ?? '', m = medium ?? '', c = campaign ?? ''
    for (const r of RULES) {
        if (r.test(s, m, c)) return r.describe(s, m, c)
    }
    return DEFAULT
}
