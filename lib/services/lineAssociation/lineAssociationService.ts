import { GA4_EXPORT_DATASET, GA4_EXPORT_DEFAULT_FILTER, GA4_EXPORT_PROJECT, GA4_EXPORT_START, runGa4EventsQuery } from '@/lib/bq/ga4EventsClient'

/**
 * サイト内の「LINE連携へ進む導線」の実績（BigQuery events_* ベース）。
 * /line-report の既存セクションが「LINE配信 → サイト流入」なのに対し、こちらは逆向きの
 * 「サイト → LINE連携」を導線別に並べる。
 *
 * 指標はすべて user_pseudo_id のユニーク人数で揃えている。イベント件数で数えると、
 * 認証画面から戻って押し直した分が乗って導線間の比較が歪むため（実測で会員登録系は1.25回/人）。
 * ただし user_pseudo_id はCookie単位なので、デバイス跨ぎとITPで実人数より多めに出る。
 *
 * 測れるのは data-click-label が付いた導線のクリックだけで、連携の完了数ではない
 * （遷移先がLIFF・ソーシャルプラス認証でGA4の外に出るため）。
 * ラベル未配線の導線は LINE_UNTRACKED_ENTRIES に列挙して画面に明示する。
 *
 * ラベル体系は drm-front のコードが正。2026-10-05 時点の対応:
 *  - SU__Line__Btn__会員登録 / 会員登録済みの方はこちら … /members/signup のLINEソーシャルログイン
 *  - SU__Line__Area__新規会員登録 … 同ブロックの表示（signup の分母）
 *  - {EF|SU}__Thx*__Modal__*  … XWORK_PRODUCT-1862 サンクス離脱モーダル（2026-10-02リリース）
 *  - {EF|SU}__Thx*__Banner__* … 同 滞在バナー
 *  - *__Image__LINEで問い合わせをする … サンクスの既存LINEバナー
 *  - *__LineContact__Lnk__ … サイドバー
 */

/** event_params の UNNEST は1日≈60MB。runGa4EventsQuery の 5GB ガードに当てないよう期間を切る */
const MAX_DAYS = 30

export type LineChannelKey =
    | 'signup'
    | 'signin'
    | 'thanksModal'
    | 'thanksBanner'
    | 'thanksLegacy'
    | 'sidebar'
    | 'other'

interface ChannelMeta {
    label: string
    hint: string
    /** モーダル・バナーのように表示ラベルを持つ導線だけ表示人数とCTRを出す */
    hasView: boolean
}

export const LINE_CHANNEL_META: Record<LineChannelKey, ChannelMeta> = {
    signup: { label: 'LINEで会員登録', hint: '/members/signup のLINEブロック', hasView: true },
    signin: { label: 'LINEでログイン', hint: '同ブロック「会員登録済みの方はこちら」', hasView: false },
    thanksModal: { label: 'サンクス離脱モーダル', hint: 'XWORK_PRODUCT-1862・2026-10-02〜', hasView: true },
    thanksBanner: { label: 'サンクス滞在バナー', hint: 'XWORK_PRODUCT-1862・2026-10-02〜', hasView: true },
    thanksLegacy: { label: 'サンクス既存バナー', hint: 'LINEで問い合わせをする', hasView: false },
    sidebar: { label: 'サイドバー', hint: '求人一覧・記事ページのLINE連携リンク', hasView: false },
    other: { label: '未分類', hint: 'LINEを含む新しいラベル。出たら分類を足す', hasView: false },
}

export const LINE_CHANNEL_ORDER: LineChannelKey[] = [
    'thanksModal', 'thanksBanner', 'thanksLegacy', 'signup', 'signin', 'sidebar', 'other',
]

export interface UntrackedEntry {
    place: string
    /** drm-front 上の位置（2026-10-05 時点） */
    source: string
    /** 遷移先。inflow-routes のIDが同じ導線同士はLINE側でも区別できない */
    destination: string
}

/**
 * コードにリンクはあるが data-click-label が無く、クリックを数えられない導線。
 * drm-front を grep して列挙した（2026-10-05）。塞ぐときはここから消す。
 */
export const LINE_UNTRACKED_ENTRIES: UntrackedEntry[] = [
    { place: 'フッターのLINEリンク', source: 'components/applicant/layouts/Footer/Footer.tsx:174', destination: 'liff inflow-routes/8136fc6f…（サンクス導線と共通）' },
    { place: 'SNS問い合わせカード', source: 'components/applicant/LINE/SNSContactCard/SNSContactCard.tsx:34', destination: 'liff inflow-routes/8136fc6f…（サンクス導線と共通）' },
    { place: 'LP サンクス（汎用）', source: 'pages/lp-thanks/_components/Line/index.tsx:12', destination: 'lin.ee/a8hTQ1t' },
    { place: 'LP サンクス（若手）', source: 'pages/lp-thanks/_components/LineEarlycareer/index.tsx:10', destination: 'lin.ee/gaGjUKr' },
    { place: 'LP サンクス（CRS）', source: 'pages/lp-thanks/_components/LineCrs/index.tsx:10', destination: 'liff inflow-routes/7afef5a3…' },
    { place: 'LP サンクス（MRS）', source: 'pages/lp-thanks/mrs/index.page.tsx:69', destination: 'liff 1645278921-kWRPP32q（別アカウント）' },
    { place: 'LP サンクス（MRSメーカー）', source: 'pages/lp-thanks/mrs_maker/index.page.tsx:72', destination: 'liff inflow-routes/aa599468…' },
    { place: 'LP サンクス（選考フロー内）', source: 'pages/lp-thanks/_components/ProcessFlowSquare/index.tsx:55,105', destination: 'lin.ee/zEVqvWS' },
    { place: '会員登録完了メール', source: 'commons/mail/htmls/signupUserHtml.tsx:50', destination: 'ソーシャルプラス認証（メール内のためGA4の外）' },
]

export interface LineChannelSummary {
    key: LineChannelKey
    label: string
    hint: string
    /** LINE連携へ進んだ人数（Cookie単位） */
    users: number
    /** 表示された人数。表示ラベルを持たない導線は null */
    viewUsers: number | null
    /** 「あとで」「閉じる」で見送った人数。モーダル・バナーのみ */
    declineUsers: number | null
    pages: { path: string; users: number }[]
}

export interface LineAssociationReport {
    startDate: string
    endDate: string
    /** 期間がBQエクスポート開始日または上限日数で切られたか */
    clamped: boolean
    channels: LineChannelSummary[]
    /** 全導線を横断した連携人数。導線別の合計ではない（複数導線を押した人は1人） */
    totalUsers: number
    /** 日付 × チャネルの連携人数。1862の立ち上がりを日次で見るため */
    daily: { date: string; users: Partial<Record<LineChannelKey, number>>; total: number }[]
    untracked: UntrackedEntry[]
    scannedMb: number
}

function buildQuery(start: string, end: string): string {
    return `
WITH ev AS (
  SELECT
    event_date,
    event_name,
    user_pseudo_id,
    COALESCE(
      (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'click_label'),
      (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'view_label')
    ) AS lbl,
    IFNULL((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_path'), '(not set)') AS page_path
  FROM \`${GA4_EXPORT_PROJECT}.${GA4_EXPORT_DATASET}.events_*\`
  WHERE _TABLE_SUFFIX BETWEEN '${start}' AND '${end}'${GA4_EXPORT_DEFAULT_FILTER}
    AND event_name IN ('data_click_label', 'data_view_label')
),
classified AS (
  SELECT
    event_date,
    user_pseudo_id,
    page_path,
    CASE
      -- 「会員登録済みの方はこちら」は「会員登録」で始まるので先に判定する
      WHEN REGEXP_CONTAINS(lbl, r'^SU__Line__Btn__会員登録済みの方はこちら') THEN 'signin'
      -- Area__新規会員登録 は LINEブロック自体の表示。signup の分母に使う
      WHEN REGEXP_CONTAINS(lbl, r'^SU__Line__(Btn__会員登録|Area__新規会員登録)') THEN 'signup'
      WHEN REGEXP_CONTAINS(lbl, r'^(EF|SU)__Thx[A-Za-z]+__Modal(__|$)') THEN 'thanksModal'
      WHEN REGEXP_CONTAINS(lbl, r'^(EF|SU)__Thx[A-Za-z]+__Banner(__|$)') THEN 'thanksBanner'
      WHEN REGEXP_CONTAINS(lbl, r'__Image__LINEで問い合わせをする$') THEN 'thanksLegacy'
      WHEN REGEXP_CONTAINS(lbl, r'__LineContact__Lnk__') THEN 'sidebar'
      -- 未分類は「取りこぼしているクリック導線」の検知が目的なので表示ラベルは拾わない
      WHEN event_name = 'data_click_label' AND REGEXP_CONTAINS(lbl, r'LINE|Line') THEN 'other'
      ELSE NULL
    END AS channel,
    CASE
      WHEN event_name = 'data_view_label' THEN 'view'
      WHEN REGEXP_CONTAINS(lbl, r'__(あとで|閉じる)$') THEN 'decline'
      ELSE 'cta'
    END AS kind
  FROM ev
  WHERE lbl IS NOT NULL
)
SELECT
  channel,
  event_date AS date,
  page_path,
  GROUPING(channel) AS g_channel,
  GROUPING(event_date) AS g_date,
  GROUPING(page_path) AS g_path,
  COUNT(DISTINCT IF(kind = 'cta', user_pseudo_id, NULL)) AS cta_users,
  COUNT(DISTINCT IF(kind = 'view', user_pseudo_id, NULL)) AS view_users,
  COUNT(DISTINCT IF(kind = 'decline', user_pseudo_id, NULL)) AS decline_users
FROM classified
WHERE channel IS NOT NULL
-- () と (event_date) は導線を横断したユニーク人数。導線別の和では重複を除けないため別途取る
GROUP BY GROUPING SETS ((channel), (channel, event_date), (channel, page_path), (event_date), ())`
}

function toSuffix(d: Date): string {
    return d.toISOString().slice(0, 10).replace(/-/g, '')
}

function toDisplay(suffix: string): string {
    return `${suffix.slice(0, 4)}-${suffix.slice(4, 6)}-${suffix.slice(6, 8)}`
}

export async function runLineAssociationReport(startDate: string, endDate: string): Promise<LineAssociationReport> {
    // BQの日次エクスポートは前日分まで。JST基準で昨日を超える終端は昨日に丸める
    const nowJst = new Date(Date.now() + 9 * 3600 * 1000)
    const yesterday = new Date(nowJst)
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)
    const yesterdaySuffix = toSuffix(yesterday)

    let start = startDate.replace(/-/g, '')
    let endSuffix = endDate.replace(/-/g, '')
    if (endSuffix > yesterdaySuffix) endSuffix = yesterdaySuffix
    let clamped = false
    if (start < GA4_EXPORT_START) {
        start = GA4_EXPORT_START
        clamped = true
    }
    // 上限日数を超える指定は新しい側を残して切る
    const endDateObj = new Date(`${toDisplay(endSuffix)}T00:00:00Z`)
    const minStart = new Date(endDateObj)
    minStart.setUTCDate(minStart.getUTCDate() - (MAX_DAYS - 1))
    const minStartSuffix = toSuffix(minStart)
    if (start < minStartSuffix) {
        start = minStartSuffix
        clamped = true
    }
    if (start > endSuffix) start = endSuffix

    const { rows, scannedBytes } = await runGa4EventsQuery(buildQuery(start, endSuffix))

    const channelMap = new Map<LineChannelKey, LineChannelSummary>()
    const dailyMap = new Map<string, { date: string; users: Partial<Record<LineChannelKey, number>>; total: number }>()
    let totalUsers = 0

    const ensureDaily = (date: string) => {
        let d = dailyMap.get(date)
        if (!d) {
            d = { date, users: {}, total: 0 }
            dailyMap.set(date, d)
        }
        return d
    }

    for (const r of rows) {
        const gChannel = r.g_channel === '1'
        const gDate = r.g_date === '1'
        const gPath = r.g_path === '1'
        const ctaUsers = Number(r.cta_users ?? 0)

        if (gChannel) {
            // 導線を横断した集計行
            if (gDate) totalUsers = ctaUsers
            else ensureDaily(toDisplay(r.date ?? '')).total = ctaUsers
            continue
        }

        const key = (r.channel ?? 'other') as LineChannelKey
        const meta = LINE_CHANNEL_META[key] ?? LINE_CHANNEL_META.other

        if (gDate && gPath) {
            channelMap.set(key, {
                key,
                label: meta.label,
                hint: meta.hint,
                users: ctaUsers,
                viewUsers: meta.hasView ? Number(r.view_users ?? 0) : null,
                declineUsers: meta.hasView ? Number(r.decline_users ?? 0) : null,
                pages: [],
            })
        } else if (!gDate) {
            const d = ensureDaily(toDisplay(r.date ?? ''))
            d.users[key] = (d.users[key] ?? 0) + ctaUsers
        }
    }

    // ページ別はチャネル行が出揃ってから詰める（GROUPING SETS の行順に依存しないため）
    for (const r of rows) {
        if (r.g_channel === '1' || r.g_path !== '0') continue
        const key = (r.channel ?? 'other') as LineChannelKey
        const users = Number(r.cta_users ?? 0)
        if (users === 0) continue
        channelMap.get(key)?.pages.push({ path: r.page_path ?? '(not set)', users })
    }

    const channels = [...channelMap.values()].sort(
        (a, b) => LINE_CHANNEL_ORDER.indexOf(a.key) - LINE_CHANNEL_ORDER.indexOf(b.key)
    )
    for (const c of channels) c.pages.sort((a, b) => b.users - a.users)

    return {
        startDate: toDisplay(start),
        endDate: toDisplay(endSuffix),
        clamped,
        channels,
        totalUsers,
        daily: [...dailyMap.values()].sort((a, b) => b.date.localeCompare(a.date)),
        untracked: LINE_UNTRACKED_ENTRIES,
        scannedMb: Math.round(scannedBytes / 1024 ** 2),
    }
}
