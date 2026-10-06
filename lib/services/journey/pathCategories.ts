/**
 * x-work.jp の URL をページカテゴリに畳む規則。
 *
 * journey / exit / list-performance / userFlow（BQ）が同じ職種スラッグ一覧と判定を
 * それぞれ持っていたのを 1 箇所にする。URL 構造の正は drm-front（memory: project_xwork_domain）。
 */

import { and, not, partialRegexp, regexp, type Ga4FilterExpression, stringFilter, type Ga4MatchType } from '@/lib/api/ga4/filters'

/** 大職種のURLスラッグ（/driver, /sekokan …）。/{slug}/media_{id} が求人詳細 */
export const INDUSTRY_SLUGS = [
    'driver', 'sekokan', 'sekkei', 'soko', 'shokunin', 'seibi', 'hoshu',
    'setsubi-sagyo', 'keibi', 'unkan', 'kojo-sagyo', 'food', 'unyu-sagyo', 'others',
] as const

export const INDUSTRY_SLUG_SET: ReadonlySet<string> = new Set(INDUSTRY_SLUGS)

/** 正規表現の選択肢として使う `driver|sekokan|…` */
export const INDUSTRY_ALT = INDUSTRY_SLUGS.join('|')

export type PageCategory =
    | 'TOP'
    | '会員登録フォーム'
    | 'ログイン'
    | 'マイページ'
    | 'スカウト'
    | '会員系その他'
    | 'featured'
    | '人材紹介LP'
    | 'LP'
    | 'コラム'
    | '資格条件'
    | '検索結果'
    | '応募フォーム'
    | '求人詳細'
    | '絞り込み検索'
    | '大職種一覧'
    | 'その他'

/** パス（クエリ・ハッシュ付き可）→ カテゴリ */
export function categorizePath(path: string): PageCategory {
    const p = (path || '').split('?')[0].split('#')[0]
    if (!p || p === '/') return 'TOP'
    if (/^\/members\/signup/.test(p)) return '会員登録フォーム'
    if (/^\/members\/(?:login|signin)/.test(p)) return 'ログイン'
    if (/^\/members\/mypage/.test(p)) return 'マイページ'
    if (/^\/members\/scout/.test(p)) return 'スカウト'
    if (/^\/members/.test(p)) return '会員系その他'
    if (/^\/featured/.test(p)) return 'featured'
    if (/^\/logi/.test(p)) return '人材紹介LP'
    if (/^\/lp[_/]/.test(p) || p === '/lp') return 'LP'
    if (/^\/journal/.test(p)) return 'コラム'
    if (/^\/cond/.test(p)) return '資格条件'
    if (/^\/search/.test(p)) return '検索結果'
    if (/^\/entry\/media_\d+/.test(p)) return '応募フォーム'

    const parts = p.split('/').filter(Boolean)
    if (parts.length >= 2 && INDUSTRY_SLUG_SET.has(parts[0]) && /^media_\d+$/.test(parts[1])) return '求人詳細'
    if (parts.length >= 2 && INDUSTRY_SLUG_SET.has(parts[0])) return '絞り込み検索'
    if (parts.length === 1 && INDUSTRY_SLUG_SET.has(parts[0])) return '大職種一覧'

    return 'その他'
}

/**
 * リファラー URL → 直前ページのカテゴリ。外部サイトはホスト名、無ければ '直接アクセス'。
 * フォーム自身からの遷移（リロード等）は '直接アクセス' に畳む。
 */
export function categorizeReferrer(referrer: string, internalDomain: string): string {
    if (!referrer || referrer === '(not set)') return '直接アクセス'
    try {
        const url = new URL(referrer)
        const host = url.hostname.toLowerCase().replace(/^www\./, '')
        const internal = internalDomain.toLowerCase().replace(/^www\./, '')
        if (host === internal || host.endsWith('.' + internal)) {
            const cat = categorizePath(url.pathname)
            if (cat === '会員登録フォーム' || cat === '応募フォーム') return '直接アクセス'
            return cat
        }
        // ドメイン不一致でも業種固有パスなら内部ページ扱い（TOP除外：外部サイトの/ を誤認しないため）
        const pathCat = categorizePath(url.pathname)
        if (pathCat !== 'その他' && pathCat !== 'TOP') {
            if (pathCat === '会員登録フォーム' || pathCat === '応募フォーム') return '直接アクセス'
            return pathCat
        }
        return host || '外部サイト'
    } catch {
        return '直接アクセス'
    }
}

/** ID 付きパスを {id} に丸めて同じ種類のページを 1 行にまとめる */
export function normalizePath(p: string): string {
    return p
        .replace(/\/media_\d+/g, '/media_{id}')
        .replace(/\/license\d+/g, '/license{id}')
}

/** 離脱分析のファネルステップに使えるカテゴリ → GA4 pagePath フィルタ */
const CATEGORY_FILTER_PATTERNS: Partial<Record<PageCategory, { value: string; matchType: Ga4MatchType }>> = {
    'TOP': { value: '/', matchType: 'EXACT' },
    '大職種一覧': { value: `^/(${INDUSTRY_ALT})/?$`, matchType: 'FULL_REGEXP' },
    '求人詳細': { value: `/(${INDUSTRY_ALT})/media_`, matchType: 'PARTIAL_REGEXP' },
    '応募フォーム': { value: '/entry/media_', matchType: 'BEGINS_WITH' },
    '会員登録フォーム': { value: '/members/signup', matchType: 'BEGINS_WITH' },
    'ログイン': { value: '/members/login', matchType: 'BEGINS_WITH' },
    '検索結果': { value: '/search', matchType: 'BEGINS_WITH' },
    'コラム': { value: '/journal', matchType: 'BEGINS_WITH' },
    'featured': { value: '/featured', matchType: 'BEGINS_WITH' },
    'LP': { value: '/lp_', matchType: 'BEGINS_WITH' },
}

/** ファネルステップとして選べるカテゴリ（表示順） */
export const FUNNEL_STEP_CATEGORIES: PageCategory[] = [
    'TOP', '大職種一覧', '絞り込み検索', '求人詳細', '応募フォーム', '会員登録フォーム',
    'ログイン', '検索結果', 'コラム', 'featured', 'LP',
]

export function categoryPathFilter(category: string): Ga4FilterExpression | null {
    // GA4 の正規表現は RE2 で先読み (?!…) が使えない。「職種配下だが media_ ではない」は AND NOT で表す
    // （旧実装は (?!media_) を送っていて、このステップを含むファネルは常に 400 で落ちていた）
    if (category === '絞り込み検索') {
        return and(regexp('pagePath', `^/(${INDUSTRY_ALT})/[^/].*`), not(partialRegexp('pagePath', `^/(${INDUSTRY_ALT})/media_`)))
    }
    const pattern = CATEGORY_FILTER_PATTERNS[category as PageCategory]
    return pattern ? stringFilter('pagePath', pattern.matchType, pattern.value) : null
}
