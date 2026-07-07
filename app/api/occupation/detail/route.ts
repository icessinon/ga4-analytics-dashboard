import { NextResponse } from 'next/server'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'

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

const VALID_SLUG = /^[a-z0-9-]+(\/[a-z0-9-]+)?$/

export async function POST(request: Request) {
    try {
        const {
            propertyId,
            slug,
            startDate = '30daysAgo',
            endDate = 'yesterday',
            accessToken: customToken,
        } = await request.json()

        if (!propertyId || typeof slug !== 'string' || !VALID_SLUG.test(slug)) {
            return NextResponse.json({ error: 'propertyId と slug が必要です' }, { status: 400 })
        }

        const accessToken = await getGA4AccessToken(customToken)
        const dateRanges = [{ startDate, endDate }]

        const [totalReport, pagesReport] = await Promise.all([
            fetchGA4Data({
                propertyId, dateRanges,
                dimensions: [],
                metrics: [{ name: 'sessions' }],
                dimensionFilter: {
                    filter: { fieldName: 'pagePath', stringFilter: { matchType: 'FULL_REGEXP', value: `^/${slug}(/.*)?$` } },
                },
                limit: 1,
            }, accessToken),
            // 求人詳細（/media_）は行数が膨大で他ページを打ち切ってしまうため除外して取得。
            // 求人詳細ぶんのセッションは「全体 − 分類済み」の residual として算出する
            fetchGA4Data({
                propertyId, dateRanges,
                dimensions: [{ name: 'pagePath' }],
                metrics: [{ name: 'sessions' }],
                dimensionFilter: {
                    andGroup: {
                        expressions: [
                            { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'FULL_REGEXP', value: `^/${slug}(/.*)?$` } } },
                            { notExpression: { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'CONTAINS', value: '/media_' } } } },
                        ],
                    },
                },
                orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
                limit: 10000,
            }, accessToken),
        ])

        const totalSessions = parseInt(totalReport.rows?.[0]?.metricValues[0]?.value ?? '0', 10)

        let listTopSessions = 0
        let prefectureSessions = 0
        let categorizedSessions = 0
        const subCategories = new Map<string, number>()

        for (const r of pagesReport.rows ?? []) {
            const path = r.dimensionValues[0]?.value ?? ''
            const sessions = parseInt(r.metricValues[0]?.value ?? '0', 10)
            const rest = path.replace(new RegExp(`^/${slug}/?`), '')
            const segment = rest.split('/')[0].split('?')[0]
            if (segment === '') {
                listTopSessions += sessions
                categorizedSessions += sessions
            } else if (PREFECTURES.has(segment)) {
                prefectureSessions += sessions
                categorizedSessions += sessions
            } else {
                subCategories.set(segment, (subCategories.get(segment) ?? 0) + sessions)
                categorizedSessions += sessions
            }
        }

        const subCategoryRows = [...subCategories.entries()]
            .map(([segment, sessions]) => ({ segment, path: `/${slug}/${segment}`, sessions }))
            .sort((a, b) => b.sessions - a.sessions)
            .slice(0, 20)

        // 求人詳細＋集計上位から漏れたロングテール = 全体 − 分類済み
        const jobDetailAndOtherSessions = Math.max(0, totalSessions - categorizedSessions)

        return NextResponse.json({
            slug,
            totalSessions,
            listTopSessions,
            prefectureSessions,
            jobDetailAndOtherSessions,
            subCategories: subCategoryRows,
            startDate,
            endDate,
        })
    } catch (error) {
        console.error('Occupation Detail API Error:', error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch occupation detail' },
            { status: 500 }
        )
    }
}
