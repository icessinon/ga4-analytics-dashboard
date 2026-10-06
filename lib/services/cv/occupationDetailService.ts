import { and, contains, not, regexp } from '@/lib/api/ga4/filters'
import type { Ga4Reporter } from '@/lib/api/ga4/report'
import { dim, firstMetricInt, metricInt, rowsOf } from '@/lib/api/ga4/rows'
import type { OccupationDetailReport } from './occupationTypes'

// URL第2セグメントが都道府県ページかどうかの判定用（/{industry}/{prefecture} パターン）
const PREFECTURES = new Set([
    'hokkaido', 'aomori', 'iwate', 'miyagi', 'akita', 'yamagata', 'fukushima',
    'ibaraki', 'tochigi', 'gunma', 'saitama', 'chiba', 'tokyo', 'kanagawa',
    'niigata', 'toyama', 'ishikawa', 'fukui', 'yamanashi', 'nagano', 'gifu',
    'shizuoka', 'aichi', 'mie', 'shiga', 'kyoto', 'osaka', 'hyogo', 'nara',
    'wakayama', 'tottori', 'shimane', 'okayama', 'hiroshima', 'yamaguchi',
    'tokushima', 'kagawa', 'ehime', 'kochi', 'fukuoka', 'saga', 'nagasaki',
    'kumamoto', 'oita', 'miyazaki', 'kagoshima', 'okinawa',
])

export const VALID_OCCUPATION_SLUG = /^[a-z0-9-]+(\/[a-z0-9-]+)?$/

/** 職種 URL 配下（/{slug}/…）のセッションを 一覧トップ / 都道府県 / サブカテゴリ / 求人詳細ほか に分ける */
export async function runOccupationDetailReport(reporter: Ga4Reporter, slug: string): Promise<OccupationDetailReport> {
    const underSlug = regexp('pagePath', `^/${slug}(/.*)?$`)
    const [totalReport, pagesReport] = await reporter.runAll([
        { metrics: ['sessions'], dimensionFilter: underSlug, limit: 1 },
        // 求人詳細（/media_）は行数が膨大で他ページを打ち切ってしまうため除外して取得。
        // 求人詳細ぶんのセッションは「全体 − 分類済み」の residual として算出する
        {
            dimensions: ['pagePath'],
            metrics: ['sessions'],
            dimensionFilter: and(underSlug, not(contains('pagePath', '/media_'))),
            orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
            limit: 10000,
        },
    ])

    const totalSessions = firstMetricInt(totalReport)

    let listTopSessions = 0
    let prefectureSessions = 0
    let categorizedSessions = 0
    const subCategories = new Map<string, number>()

    for (const r of rowsOf(pagesReport)) {
        const path = dim(r)
        const sessions = metricInt(r)
        const rest = path.replace(new RegExp(`^/${slug}/?`), '')
        const segment = rest.split('/')[0].split('?')[0]
        if (segment === '') {
            listTopSessions += sessions
        } else if (PREFECTURES.has(segment)) {
            prefectureSessions += sessions
        } else {
            subCategories.set(segment, (subCategories.get(segment) ?? 0) + sessions)
        }
        categorizedSessions += sessions
    }

    const subCategoryRows = [...subCategories.entries()]
        .map(([segment, sessions]) => ({ segment, path: `/${slug}/${segment}`, sessions }))
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, 20)

    return {
        slug,
        totalSessions,
        listTopSessions,
        prefectureSessions,
        // 求人詳細＋集計上位から漏れたロングテール = 全体 − 分類済み
        jobDetailAndOtherSessions: Math.max(0, totalSessions - categorizedSessions),
        subCategories: subCategoryRows,
    }
}
