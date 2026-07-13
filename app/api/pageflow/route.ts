import { NextResponse } from 'next/server'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'

const SITE_HOSTS = ['x-work.jp', 'www.x-work.jp']

/**
 * リファラーURL / ページパスを表示用に正規化する。
 * サイト内URLはクエリを落としたパスに、外部URLはホスト名にまとめる。
 */
function normalizeRef(url: string): { key: string; isExternal: boolean } | null {
    if (!url) return null
    try {
        if (url.startsWith('/')) {
            return { key: url.split('?')[0].split('#')[0] || '/', isExternal: false }
        }
        const u = new URL(url)
        const host = u.hostname.replace(/^www\./, '')
        if (SITE_HOSTS.includes(u.hostname) || host === 'x-work.jp') {
            return { key: u.pathname || '/', isExternal: false }
        }
        return { key: `（外部）${host}`, isExternal: true }
    } catch {
        return null
    }
}

export async function POST(request: Request) {
    try {
        const {
            propertyId,
            pagePath,
            startDate = '30daysAgo',
            endDate = 'yesterday',
            accessToken: customToken,
        } = await request.json()

        if (!propertyId || typeof pagePath !== 'string' || !pagePath.startsWith('/')) {
            return NextResponse.json({ error: 'propertyId と pagePath（/で始まる）が必要です' }, { status: 400 })
        }
        const path = pagePath.trim()

        const accessToken = await getGA4AccessToken(customToken)
        const dateRanges = [{ startDate, endDate }]

        const [targetReport, prevReport, nextReport] = await Promise.all([
            // 対象ページ自体の到達ユーザー数
            fetchGA4Data({
                propertyId, dateRanges,
                dimensions: [],
                metrics: [{ name: 'totalUsers' }],
                dimensionFilter: {
                    filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: path } },
                },
                limit: 1,
            }, accessToken),
            // 前: 対象ページに到達した際のリファラー
            fetchGA4Data({
                propertyId, dateRanges,
                dimensions: [{ name: 'pageReferrer' }],
                metrics: [{ name: 'totalUsers' }],
                dimensionFilter: {
                    filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: path } },
                },
                orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
                limit: 2000,
            }, accessToken),
            // 次: 対象ページをリファラーとして見たページ
            fetchGA4Data({
                propertyId, dateRanges,
                dimensions: [{ name: 'pagePath' }],
                metrics: [{ name: 'totalUsers' }],
                dimensionFilter: {
                    filter: { fieldName: 'pageReferrer', stringFilter: { matchType: 'CONTAINS', value: `x-work.jp${path}` } },
                },
                orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
                limit: 2000,
            }, accessToken),
        ])

        const targetUsers = parseInt(targetReport.rows?.[0]?.metricValues[0]?.value ?? '0', 10)

        // 前ページ: リファラーをパス/外部ホストに正規化して集計
        const prevMap = new Map<string, number>()
        let prevNoReferrer = 0
        for (const r of prevReport.rows ?? []) {
            const ref = r.dimensionValues[0]?.value ?? ''
            const users = parseInt(r.metricValues[0]?.value ?? '0', 10)
            if (!ref) { prevNoReferrer += users; continue }
            const norm = normalizeRef(ref)
            if (!norm) { prevNoReferrer += users; continue }
            // 自分自身（対象ページ内の遷移・リロード）は除外
            if (!norm.isExternal && norm.key.startsWith(path)) continue
            prevMap.set(norm.key, (prevMap.get(norm.key) ?? 0) + users)
        }

        // 次ページ: 対象ページ自身は除外
        const nextMap = new Map<string, number>()
        for (const r of nextReport.rows ?? []) {
            const p = (r.dimensionValues[0]?.value ?? '').split('?')[0]
            const users = parseInt(r.metricValues[0]?.value ?? '0', 10)
            if (!p || p.startsWith(path)) continue
            nextMap.set(p, (nextMap.get(p) ?? 0) + users)
        }

        const toRows = (m: Map<string, number>) =>
            [...m.entries()]
                .map(([page, users]) => ({ page, users }))
                .sort((a, b) => b.users - a.users)
                .slice(0, 20)

        return NextResponse.json({
            pagePath: path,
            targetUsers,
            prevPages: toRows(prevMap),
            prevNoReferrer,
            nextPages: toRows(nextMap),
            startDate,
            endDate,
        })
    } catch (error) {
        console.error('PageFlow API Error:', error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch page flow' },
            { status: 500 }
        )
    }
}
