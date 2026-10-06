import { beginsWith, regexp } from '@/lib/api/ga4/filters'
import type { Ga4Reporter } from '@/lib/api/ga4/report'
import { dim, firstMetricInt, metricInt, rowsOf } from '@/lib/api/ga4/rows'
import type { LpApplyRow, OccupationReport, OccupationRow } from './occupationTypes'

// occ パラメータ値 → URLスラッグ・表示名（slug が null の職種は専用URL配下を持たない）
export const OCCUPATIONS: Array<{ occ: string; slug: string | null; label: string }> = [
    { occ: 'Driver', slug: 'driver', label: 'ドライバー' },
    // タクシー・バスは /driver 配下のサブカテゴリ（Driver のセッションと重複計上になる）
    { occ: 'Taxi', slug: 'driver/taxi', label: 'タクシー' },
    { occ: 'Bus', slug: 'driver/bus', label: 'バス' },
    { occ: 'Unkan', slug: 'unkan', label: '運行管理' },
    { occ: 'UnyuSagyo', slug: 'unyu-sagyo', label: '運輸作業' },
    { occ: 'Soko', slug: 'soko', label: '倉庫' },
    { occ: 'KojoSagyo', slug: 'kojo-sagyo', label: '工場作業' },
    { occ: 'Sekokan', slug: 'sekokan', label: '施工管理' },
    { occ: 'Sekkei', slug: 'sekkei', label: '設計' },
    { occ: 'Shokunin', slug: 'shokunin', label: '職人' },
    { occ: 'SetsubiSagyo', slug: 'setsubi-sagyo', label: '設備作業' },
    { occ: 'Seibi', slug: 'seibi', label: '整備' },
    { occ: 'Hoshu', slug: 'hoshu', label: '保守' },
    { occ: 'Keibi', slug: 'keibi', label: '警備' },
    { occ: 'Food', slug: 'food', label: 'フード' },
    { occ: 'Others', slug: 'others', label: 'その他' },
]

// /lp-thanks/{slug} → 事業領域の表示名
const LP_LABELS: Record<string, string> = {
    drs: 'DRS（ドライバー人材紹介）',
    crs: 'CRS（建設人材紹介）',
    mrs: 'MRS（製造人材紹介）',
    mrs_maker: 'MRS（製造・メーカー）',
    srs: 'SRS',
    food: 'フード',
}

async function fetchSlugSessions(reporter: Ga4Reporter, slugs: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>()
    // GA4 の同時リクエスト上限（プロパティあたり10）を超えないよう分割実行
    const chunkSize = 5
    for (let i = 0; i < slugs.length; i += chunkSize) {
        const chunk = slugs.slice(i, i + chunkSize)
        const reports = await Promise.all(chunk.map((slug) =>
            reporter.run({
                metrics: ['sessions'],
                dimensionFilter: regexp('pagePath', `^/${slug}(/.*)?$`),
                limit: 1,
            })
        ))
        chunk.forEach((slug, idx) => {
            result.set(slug, firstMetricInt(reports[idx]))
        })
    }
    return result
}

/**
 * 職種（?occ=）別の会員登録CVと、職種URL配下のセッションから登録率を出す。
 * あわせて /lp-thanks 配下の LP 応募CVを事業スラッグ別に集計する。
 */
export async function runOccupationReport(reporter: Ga4Reporter): Promise<OccupationReport> {
    const [totalsReport, signupReport, lpReport, slugSessions] = await Promise.all([
        reporter.run({ metrics: ['sessions'], limit: 1 }),
        reporter.run({
            dimensions: ['pagePathPlusQueryString'],
            metrics: ['totalUsers'],
            dimensionFilter: beginsWith('pagePathPlusQueryString', '/members/signup/thanks'),
            limit: 200,
        }),
        reporter.run({
            dimensions: ['pagePath'],
            metrics: ['totalUsers'],
            dimensionFilter: beginsWith('pagePath', '/lp-thanks'),
            limit: 100,
        }),
        fetchSlugSessions(reporter, OCCUPATIONS.map((o) => o.slug).filter((s): s is string => s !== null)),
    ])

    // 会員登録CV を ?occ= パラメータ別に集計
    const signupByOcc = new Map<string, number>()
    let noOccSignupCv = 0
    for (const r of rowsOf(signupReport)) {
        const path = dim(r)
        const users = metricInt(r)
        const occMatch = path.match(/[?&]occ=([^&]+)/)
        if (occMatch) {
            const occ = decodeURIComponent(occMatch[1])
            signupByOcc.set(occ, (signupByOcc.get(occ) ?? 0) + users)
        } else {
            noOccSignupCv += users
        }
    }

    const knownOccs = new Set(OCCUPATIONS.map((o) => o.occ))
    const occupations: OccupationRow[] = OCCUPATIONS.map((o) => {
        const signupCv = signupByOcc.get(o.occ) ?? 0
        const sessions = o.slug ? slugSessions.get(o.slug) ?? 0 : null
        return {
            occ: o.occ,
            label: o.label,
            slug: o.slug,
            signupCv,
            sessions,
            signupRate: sessions && sessions > 0 ? signupCv / sessions : null,
        }
    })
    // 未定義の occ 値もそのまま行として出す（新職種追加時の取りこぼし防止）
    for (const [occ, signupCv] of signupByOcc) {
        if (!knownOccs.has(occ)) {
            occupations.push({ occ, label: occ, slug: null, signupCv, sessions: null, signupRate: null })
        }
    }
    occupations.sort((a, b) => b.signupCv - a.signupCv)

    // LP応募CV を事業スラッグ別に集計
    const lpByCategory = new Map<string, number>()
    for (const r of rowsOf(lpReport)) {
        const path = dim(r)
        const users = metricInt(r)
        const slug = path.replace(/^\/lp-thanks\/?/, '').split('/')[0] || '(不明)'
        lpByCategory.set(slug, (lpByCategory.get(slug) ?? 0) + users)
    }
    const lpApplies: LpApplyRow[] = [...lpByCategory.entries()]
        .map(([slug, cv]) => ({ slug, label: LP_LABELS[slug] ?? slug.toUpperCase(), cv }))
        .sort((a, b) => b.cv - a.cv)

    const totalSessions = firstMetricInt(totalsReport)
    const totalSignupCv = occupations.reduce((sum, o) => sum + o.signupCv, 0) + noOccSignupCv

    return {
        occupations,
        noOccSignupCv,
        totalSignupCv,
        totalSessions,
        overallSignupRate: totalSessions > 0 ? totalSignupCv / totalSessions : null,
        lpApplies,
        totalLpApplyCv: lpApplies.reduce((sum, l) => sum + l.cv, 0),
    }
}
