import { anyOf, beginsWith, contains } from '@/lib/api/ga4/filters'
import type { Ga4Reporter } from '@/lib/api/ga4/report'
import { dim, firstMetricInt, metricInt, rowsOf } from '@/lib/api/ga4/rows'
import type { PageFlowReport } from './pageFlowTypes'

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

/**
 * 指定ページ（前方一致）の「直前に見ていたページ」と「直後に見たページ」を GA4 のリファラーから近似する。
 * 直前ページは経路ページ自体の表示 PV も取り、遷移率（到達PV ÷ 表示PV）を出す。
 */
export async function runPageFlowReport(reporter: Ga4Reporter, path: string): Promise<PageFlowReport> {
    const [targetReport, prevReport, nextReport] = await reporter.runAll([
        // 対象ページ自体の到達ユーザー数
        { metrics: ['totalUsers'], dimensionFilter: beginsWith('pagePath', path), limit: 1 },
        // 前: 対象ページに到達した際のリファラー（ユーザー数と到達PVの両方）
        {
            dimensions: ['pageReferrer'],
            metrics: ['totalUsers', 'screenPageViews'],
            dimensionFilter: beginsWith('pagePath', path),
            orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
            limit: 2000,
        },
        // 次: 対象ページをリファラーとして見たページ
        {
            dimensions: ['pagePath'],
            metrics: ['totalUsers'],
            dimensionFilter: contains('pageReferrer', `x-work.jp${path}`),
            orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
            limit: 2000,
        },
    ])

    const targetUsers = firstMetricInt(targetReport)

    // 前ページ: リファラーをパス/外部ホストに正規化して集計（ユーザー数＋到達PV）
    const prevMap = new Map<string, { users: number; pv: number; isExternal: boolean }>()
    let prevNoReferrer = 0
    for (const r of rowsOf(prevReport)) {
        const ref = dim(r)
        const users = metricInt(r, 0)
        const pv = metricInt(r, 1)
        if (!ref) { prevNoReferrer += users; continue }
        const norm = normalizeRef(ref)
        if (!norm) { prevNoReferrer += users; continue }
        // 自分自身（対象ページ内の遷移・リロード）は除外
        if (!norm.isExternal && norm.key.startsWith(path)) continue
        const cur = prevMap.get(norm.key)
        if (cur) { cur.users += users; cur.pv += pv }
        else prevMap.set(norm.key, { users, pv, isExternal: norm.isExternal })
    }

    // 経路（サイト内の直前ページ）自体の表示PVを取得 → 遷移率 = 到達PV / 表示PV
    const topPrev = [...prevMap.entries()].sort((a, b) => b[1].pv - a[1].pv).slice(0, 30)
    const internalPrevPaths = topPrev.filter(([, v]) => !v.isExternal).map(([p]) => p).slice(0, 30)
    const sourcePvMap = new Map<string, number>()
    if (internalPrevPaths.length > 0) {
        const sourcePvReport = await reporter.run({
            dimensions: ['pagePath'],
            metrics: ['screenPageViews'],
            dimensionFilter: anyOf('pagePath', internalPrevPaths),
            limit: 100,
        })
        for (const r of rowsOf(sourcePvReport)) sourcePvMap.set(dim(r), metricInt(r))
    }

    const prevPages = topPrev.slice(0, 20).map(([page, v]) => {
        const sourcePv = v.isExternal ? null : sourcePvMap.get(page) ?? null
        return { page, users: v.users, pv: v.pv, sourcePv, transitionRate: sourcePv && sourcePv > 0 ? v.pv / sourcePv : null }
    })

    // 次ページ: 対象ページ自身は除外
    const nextMap = new Map<string, number>()
    for (const r of rowsOf(nextReport)) {
        const p = dim(r).split('?')[0]
        if (!p || p.startsWith(path)) continue
        nextMap.set(p, (nextMap.get(p) ?? 0) + metricInt(r))
    }

    return {
        pagePath: path,
        targetUsers,
        prevPages,
        prevNoReferrer,
        nextPages: [...nextMap.entries()]
            .map(([page, users]) => ({ page, users }))
            .sort((a, b) => b.users - a.users)
            .slice(0, 20),
    }
}
