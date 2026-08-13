import type { GscFilter } from './client'

/** ページカテゴリ定義（SEOモニタとSEO急落アラートで共有） */

export const INDUSTRY_ALT = 'driver|sekokan|sekkei|soko|shokunin|seibi|hoshu|setsubi-sagyo|keibi|unkan|kojo-sagyo|food|unyu-sagyo|others'

export const GSC_PAGE_CATEGORIES: Array<{ key: string; label: string; filters: GscFilter[] }> = [
    {
        key: 'detail',
        label: '求人詳細',
        filters: [{ dimension: 'page', operator: 'includingRegex', expression: `^https://x-work\\.jp/(${INDUSTRY_ALT})/media_[0-9]+` }],
    },
    {
        key: 'list',
        label: '検索・一覧',
        filters: [
            { dimension: 'page', operator: 'includingRegex', expression: `^https://x-work\\.jp/(search|(${INDUSTRY_ALT})(/|$))` },
            { dimension: 'page', operator: 'excludingRegex', expression: 'media_' },
        ],
    },
    {
        key: 'cond',
        label: '資格条件',
        filters: [{ dimension: 'page', operator: 'includingRegex', expression: '^https://x-work\\.jp/cond/' }],
    },
    {
        key: 'top',
        label: 'TOP',
        filters: [{ dimension: 'page', operator: 'equals', expression: 'https://x-work.jp/' }],
    },
    {
        key: 'journal',
        label: 'コラム',
        filters: [{ dimension: 'page', operator: 'contains', expression: '/journal' }],
    },
]
