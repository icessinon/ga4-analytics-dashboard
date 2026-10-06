import { anyOf, type Ga4FilterExpression } from '@/lib/api/ga4/filters'

/**
 * x-work.jp のサンクスページ = CV 判定の正。
 * 応募CV / LP応募CV / 会員登録CV を pagePath の前方一致で見分ける（insights・utm-report・line-report 共通）。
 */
export const CV_PAGES = [
    { key: 'applyCv', label: '応募CV', prefix: '/entry/thanks' },
    { key: 'lpApplyCv', label: 'LP応募CV', prefix: '/lp-thanks' },
    { key: 'signupCv', label: '会員登録CV', prefix: '/members/signup/thanks' },
] as const

export type CvPageKey = (typeof CV_PAGES)[number]['key']

export type CvCounts = Record<CvPageKey, number>

export const emptyCvCounts = (): CvCounts => ({ applyCv: 0, lpApplyCv: 0, signupCv: 0 })

/** 3 つのサンクスページのどれかに前方一致する pagePath フィルタ（orGroup） */
export const cvPagesFilter = (): Ga4FilterExpression => anyOf('pagePath', CV_PAGES.map((p) => p.prefix), 'BEGINS_WITH')

/** パスがどの CV か。どれでもなければ null */
export function cvKeyForPath(path: string): CvPageKey | null {
    for (const p of CV_PAGES) if (path.startsWith(p.prefix)) return p.key
    return null
}
