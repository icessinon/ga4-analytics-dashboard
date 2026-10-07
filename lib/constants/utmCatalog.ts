/**
 * UTMカタログ: utm_source / utm_medium / utm_campaign / utm_content の組み合わせを
 * 「どの施策のリンクか・いつ発行されるか」に解決する辞書。
 * 完全版リファレンスは docs/utm-naming-convention.md（コード実測＋GA4実流入で突合）。
 * UTM別集計ページ（/utm-report）が各行の注記に使う。
 *
 * 重要な前提: UTMには2種類ある。
 *  - 流入UTM（外部→サイト・新規セッション）= GA4のセッション帰属に計上され、ここで数字が見れる（attributed=true）
 *  - サイト内リンクUTM（既存セッションで踏む内部リンク）= GA4はUTMをセッション開始時のみ読むためほぼ計上されない（attributed=false）。
 *    リンククリック計測・リンク先/Salesforce識別が目的で、流入計測用ではない。
 *
 * utm_content の位置づけ: 「同じ配信の中のどのリンク／どの文面か」を分ける4つ目の軸。
 *  送信側の使い分けは2通りある。
 *   (a) 配信内のリンク位置（ステップメールの profile_register / line_settings / recommend_N など）
 *   (b) 文面バリアント＝AB（crm_scout SMS の featured_a / featured_b）
 *  広告（facebook cpm / Kbox cpc）は媒体側が自動で入れるIDなので意味は引けない。
 */

export type UtmCategory =
    | 'product' // 自社プロダクト通知（メール/LINE push/SMS）
    | 'line' // LINE公式アカウント（リッチメニュー・サーベイ）
    | 'ca' // CA個別配信
    | 'scout' // スカウト一斉配信（マーケ・SMS/メール）
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
    product: { label: '自社通知', color: '#3b82f6', attributed: true },
    line: { label: 'LINE公式', color: '#16a34a', attributed: true },
    ca: { label: 'CA配信', color: '#8b5cf6', attributed: true },
    scout: { label: 'スカウト配信', color: '#d97706', attributed: true },
    paid: { label: '広告', color: '#ec4899', attributed: true },
    influencer: { label: 'インフルエンサー', color: '#ec4899', attributed: true },
    internal: { label: 'サイト内リンク', color: '#6b7280', attributed: false },
    organic: { label: 'オーガニック', color: '#16a34a', attributed: false },
    referral: { label: 'リファラル', color: '#0891b2', attributed: false },
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

/** 会員登録後ステップメール（drm-front SignupStepMailsStack/.../templates.ts） */
const SIGNUP_STEP_LABEL: Record<string, string> = {
    day1: 'Day1 プロフィール入力',
    day3: 'Day3 LINE連携',
    day7: 'Day7 おすすめ求人',
    day14: 'Day14 キープ求人の確認',
    day30: 'Day30 条件の見直し',
}

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
        test: (s, m, c) => eq(s, 'product') && eq(m, 'email') && eq(c, 'application_complete'),
        describe: () => ({ label: '応募完了メールのおすすめ求人', timing: '応募完了メールに差し込まれたおすすめ求人リンクを踏んだとき（prepareTemplateValues.ts:13）', category: 'product' }),
    },
    {
        test: (s, m, c) => eq(s, 'product') && eq(m, 'email') && /^signup_step_/i.test(c),
        describe: (_s, _m, c) => {
            const key = c.replace(/^signup_step_/i, '')
            return {
                label: `会員登録ステップメール ${SIGNUP_STEP_LABEL[key] ?? key}`,
                timing: `会員登録から${key.replace('day', '')}日後に自動送信されるステップメールのリンクを踏んだとき。utm_content がメール内のどのリンクかを表す（2026-10リリース）`,
                category: 'product',
            }
        },
    },
    {
        test: (s, m, c) => eq(s, 'product') && eq(m, 'email') && eq(c, 'lp_thanks'),
        describe: () => ({ label: 'LP応募サンクス系メール', timing: 'LP応募後に送られるメール内のリンクを踏んだとき（発行元コードは未特定・配信基盤側の可能性）', category: 'product' }),
    },
    {
        test: (s, m, c) => eq(s, 'product') && (eq(m, 'email') || eq(m, 'line')) && /^keep_remider(_|$)/i.test(c),
        describe: (_s, m, c) => ({
            label: `キープ求人リマインド${eq(m, 'line') ? 'LINE' : 'メール'}${/1st/i.test(c) ? '（1通目）' : /2nd/i.test(c) ? '（2通目）' : /3rd/i.test(c) ? '（3通目）' : ''}`,
            timing: 'キープ（お気に入り）求人があるユーザーへの再訪促進リマインドを踏んだとき',
            category: 'product',
            warning: 'campaign名が keep_remider（正: keep_reminder のタイポ・n欠落）。実データにもタイポのまま流入',
        }),
    },
    {
        test: (s, m, c) => eq(s, 'product') && eq(m, 'sms') && /^scout_[0-9a-f-]{20,}$/i.test(c),
        describe: () => ({
            label: '本体スカウト通知SMS（1スカウト＝1campaign）',
            timing: '企業から特別スカウトが届いたときに本体が送るSMS（/scout/{scoutId}）を踏んだとき。ScoutSmsNotificationFunction/handler.ts:99',
            category: 'product',
            warning: 'campaign が scoutId 単位のため値が無限に増える。集計は接頭辞 scout_ で束ねる',
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

    // ---- スカウト一斉配信（source=scout / crm_scout。SMSとメールの2チャネル） ----
    {
        test: (s, m, c) => eq(s, 'scout') && eq(m, 'sms') && /^at_agent/i.test(c),
        describe: () => ({
            label: '人材紹介スカウトSMS（agent）',
            timing: 'マーケ配信のスカウトSMS（人材紹介・手数料課金求人）を受け取り、リンクを踏んだとき。campaign は at_agent_fee_media_{求人ID}_{日付}_{セグメント} と at_agent_media_{求人ID}_fee_{日付}_{セグメント} の2語順が混在',
            category: 'scout',
        }),
    },
    {
        test: (s, m) => (eq(s, 'scout') || eq(s, 'crm_scout')) && eq(m, 'email'),
        describe: (s) => ({
            label: `スカウトメール（${eq(s, 'scout') ? '人材紹介 agent' : '求人広告 direct'}）`,
            timing: 'マーケ配信のスカウトメールのリンクを踏んだとき。campaign命名はSMSと共通で medium=email だけが違う',
            category: 'scout',
        }),
    },
    {
        test: (s, m, c) => eq(s, 'scout') && eq(m, 'sms') && /^agent_media_/i.test(c),
        describe: () => ({
            label: '人材紹介スカウトSMS（at_なし・時刻指定配信）',
            timing: 'マーケ配信のスカウトSMSのうち agent_media_{求人ID}_{日付}_{配信時刻} 命名のもの（2026-09〜。800=朝/1700=夕の配信枠）',
            category: 'scout',
            warning: 'at_ 接頭辞が無いため at_agent_* の集計から漏れる。接頭辞で束ねるときは agent_media_ も拾うこと',
        }),
    },
    {
        test: (s, m, c) => (eq(s, 'crm_scout') || eq(s, 'scout')) && eq(m, 'sms') && /^at_direct/i.test(c),
        describe: () => ({
            label: '求人広告スカウトSMS（direct）',
            timing: 'マーケ配信のスカウトSMS（求人広告・企業直接掲載求人）を受け取り、リンクを踏んだとき。campaign は at_direct_{日付}_{都道府県}_{職種}_media_{求人ID}（末尾に _groupa/_groupb/_age4555 等のセグメントが付く）',
            category: 'scout',
        }),
    },
    {
        test: (s, m, c) => (eq(s, 'scout') || eq(s, 'crm_scout')) && eq(m, 'sms') && /^media_\d/i.test(c),
        describe: () => ({
            label: 'スカウトSMS（media_ 命名の少量系統）',
            timing: 'media_{求人ID}_{日付}[_{連番}] 命名のスカウト配信。at_agent / agent_media とは別系統で量は少ない',
            category: 'scout',
            warning: 'at_ も agent_ も付かないため、接頭辞で束ねるときに取りこぼしやすい',
        }),
    },
    {
        test: (s, m) => (eq(s, 'scout') || eq(s, 'crm_scout')) && eq(m, 'sms'),
        describe: () => ({ label: 'スカウトSMS', timing: 'マーケ配信のスカウトSMSを受け取り、リンクを踏んだとき（送客が目的で会員登録CVはほぼ0）', category: 'scout' }),
    },
    {
        test: (s, m) => eq(s, 'sms') && eq(m, 'scout'),
        describe: () => ({ label: 'スカウトSMS（本体発行・旧命名）', timing: '本体のスカウト通知SMSの旧UTM（/scout/{scoutId}?utm_source=sms&utm_medium=scout）。現行は product/sms/scout_{scoutId}', category: 'scout' }),
    },

    // ---- 広告 ----
    {
        test: (s, m) => eq(s, 'kbox') && eq(m, 'cpc'),
        describe: (_s, _m, c) => ({
            label: `求人ボックス有料クリック（${c}）`,
            timing: '求人ボックス(Kbox)の有料掲載枠から流入したとき。utm_content の Kbox_agent_media_{求人ID} でどの求人経由かが分かる',
            category: 'paid',
        }),
    },
    {
        test: (_s, m) => eq(m, 'cpc'),
        describe: (s) => ({ label: `検索連動型広告（${s}）`, timing: `${s}のリスティング広告（検索キーワード連動）をクリックしたとき`, category: 'paid' }),
    },
    {
        test: (_s, m) => eq(m, 'cpm') || eq(m, 'display') || eq(m, 'banner') || eq(m, 'paid'),
        describe: (s) => ({ label: `ディスプレイ/SNS広告（${s}）`, timing: `${s}のディスプレイ/SNS広告をクリックしたとき。utm_content=クリエイティブID / utm_term=広告セットID（媒体が自動付与）`, category: 'paid' }),
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
        test: (s) => eq(s, 'google_jobs_apply'),
        describe: () => ({ label: 'Googleしごと検索', timing: 'Google検索の求人枠（Google for Jobs）の「応募」から流入したとき。構造化データ経由のためUTMは媒体が自動付与', category: 'organic' }),
    },
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
        describe: () => ({ label: '計測欠落/未割当', timing: 'source/medium/campaignが全て取得できないセッション。2026-08-11〜8月下旬のUnassignedインシデント（収束済み）やアプリ内ブラウザのリファラ欠落など。絶対数は割り引いて見る', category: 'direct' }),
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

/** 配信内のリンク位置を表す utm_content（自社メール系で使う固定値） */
const CONTENT_LABEL: Record<string, string> = {
    profile_register: 'プロフィール入力へのリンク',
    line_settings: 'LINE連携（会員設定）へのリンク',
    search: '求人検索へのリンク',
    keeps: 'キープ一覧へのリンク',
    conditions: '希望条件の見直しへのリンク',
    unsubscribe: '配信停止リンク',
}

/** 値が空/未設定なら表示しない */
export const isEmptyUtmValue = (v: string | undefined | null) =>
    !v || eq(v, '(not set)') || eq(v, '(none)') || eq(v, '(not provided)') || eq(v, '(data not available)')

/**
 * utm_content の意味を解決する。引けないときは null（画面では生値のみ表示）。
 * content は「同じ配信の中のどのリンク／どの文面か」を分ける軸で、使い方が送信側ごとに違う。
 */
export function describeUtmContent(source: string, medium: string, campaign: string, content: string): string | null {
    const s = source ?? '', m = medium ?? '', ct = content ?? ''
    if (isEmptyUtmValue(ct)) return null

    const fixed = CONTENT_LABEL[ct.toLowerCase()]
    if (fixed) return fixed

    const rec = /^recommend_(\d+)$/i.exec(ct)
    if (rec) return `おすすめ求人 ${rec[1]} 件目のリンク`

    // スカウト配信は content が文面バリアント＝ABになっている（featured / featured_a / featured_b / normal）
    if (eq(s, 'crm_scout') || eq(s, 'scout')) {
        const ab = /^(featured|normal)(?:_([a-z]))?$/i.exec(ct)
        if (ab) {
            const base = eq(ab[1], 'featured') ? '注目求人訴求の文面' : '通常文面'
            return ab[2] ? `${base}（ABバリアント ${ab[2].toUpperCase()}）` : base
        }
    }

    if (eq(s, 'kbox')) {
        const id = /^kbox_agent_media_(\d+)$/i.exec(ct)
        if (id) return `求人ボックス掲載求人 ID:${id[1]}`
    }

    if (eq(m, 'cpm') || eq(m, 'paid')) return '広告クリエイティブID（媒体が自動付与）'

    return null
}
