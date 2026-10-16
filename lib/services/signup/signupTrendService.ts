import { exact, or } from '@/lib/api/ga4/filters'
import type { Ga4Reporter } from '@/lib/api/ga4/report'
import { dim, metricInt, rowsOf } from '@/lib/api/ga4/rows'
import { runGa4EventsQuery } from '@/lib/bq/ga4EventsClient'
import { SIGNUP_AB_TEST_GENRE, signupEventsIn, type SignupTimelineEvent } from '@/lib/constants/signupTimeline'
import { prisma } from '@/lib/db/client'
import { dayCount, monthSpans, weekSpans, ymd, type TrendSpan } from '@/lib/services/trend/buckets'
import type { SignupTrendBucket, SignupTrendDay, SignupTrendReport } from './signupTrendTypes'

/**
 * 会員登録の推移。
 *
 * **会員登録数の正はプロダクトDB**（`xmile-drm.xwork.member_users`）。事業KPIページと同じ
 * `is_apply_signup`（signup_kind が入る 2026-09-04 より前は「最初の応募が登録から5秒以内か」）で
 * 単独登録と応募同時登録を分ける。GA4 のサンクス到達と1〜5%ずれるので数は必ずDB側を使う。
 *
 * **できごとの年表は「ABテストDBから自動」＋「手書きの年表」**。対象面（genre）が「会員登録」の
 * ABテストは登録しておけば自動で線になる。リリース・計測変更と、会員登録以外の面だが会員登録に
 * 効くもの（求人詳細のモザイク等）は lib/constants/signupTimeline.ts に手で足す。
 * 同じABテストが両方にあるときは、結果まで書いてある手書きのほうを採る。
 *
 * **会員登録率は GA4 のページ別ユーザー数で分母・分子を揃える**（/members/signup →
 * /members/signup/thanks）。DBの登録数を GA4 の到達で割ると取り口が混ざって辻褄が合わなくなる。
 * ユーザー数は期間ユニークなので、週次・月次はバケットごとに別クエリを投げる
 * （日次UUの合算は延べになり、率が実態より低く出る）。
 */

/**
 * /members/signup のページ計測が使えるようになった日。
 * 実測: ページ別ユーザーは 2026-05-08 から出るが、5/8〜5/10 は screenPageViews が 0 で
 * ユーザー数も翌週の半分以下。まともに揃うのは 5/11 から。
 * これより前から始まるバケットは率を出さない（会員登録数はプロダクトDBなので出る）。
 */
const GA4_PAGE_TRACKING_FROM = '2026-05-11'

const MEMBER_USERS = '`xmile-drm.xwork.member_users`'
const APPLICATIONS = '`xmile-drm.xwork.job_applications`'
const SIGNUP_PATH = '/members/signup'
const THANKS_PATH = '/members/signup/thanks'

function dailySql(startDate: string, endDate: string): string {
    return `
WITH members AS (
  SELECT m.user_id, m.user_created_at, m.employment_status,
    COALESCE(m.signup_kind = 'apply_signup',
             TIMESTAMP_DIFF(MIN(ja.created_at), m.user_created_at, SECOND) BETWEEN 0 AND 5) AS is_apply_signup
  FROM ${MEMBER_USERS} m
  LEFT JOIN ${APPLICATIONS} ja ON ja.user_id = m.user_id
  GROUP BY m.user_id, m.user_created_at, m.signup_kind, m.employment_status
)
SELECT
  FORMAT_DATE('%Y-%m-%d', DATE(user_created_at, 'Asia/Tokyo')) AS d,
  COUNT(*) AS reg,
  COUNTIF(NOT IFNULL(is_apply_signup, FALSE)) AS plain,
  COUNTIF(IFNULL(is_apply_signup, FALSE)) AS apply_signup,
  COUNTIF(NOT IFNULL(is_apply_signup, FALSE) AND employment_status IS NULL) AS phase2_unsaved
FROM members
WHERE DATE(user_created_at, 'Asia/Tokyo') BETWEEN DATE '${startDate}' AND DATE '${endDate}'
GROUP BY d
ORDER BY d`
}

/** バケット1つ分のフォーム到達・完了ユーザー（期間ユニーク）。計測開始前は叩かない */
async function pageUsers(reporter: Ga4Reporter, startDate: string, endDate: string) {
    if (endDate < GA4_PAGE_TRACKING_FROM) return { formUsers: 0, completedUsers: 0 }
    const res = await reporter.run({
        dimensions: ['pagePath'],
        metrics: ['totalUsers'],
        dateRanges: [{ startDate, endDate }],
        dimensionFilter: or(exact('pagePath', SIGNUP_PATH), exact('pagePath', THANKS_PATH)),
        limit: 10,
    })
    let formUsers = 0
    let completedUsers = 0
    for (const r of rowsOf(res)) {
        if (dim(r) === SIGNUP_PATH) formUsers += metricInt(r)
        else if (dim(r) === THANKS_PATH) completedUsers += metricInt(r)
    }
    return { formUsers, completedUsers }
}

function bucketOf(span: TrendSpan, days: SignupTrendDay[], ga4: { formUsers: number; completedUsers: number }): SignupTrendBucket {
    const inSpan = days.filter((d) => d.date >= span.start && d.date <= span.end)
    const sum = (f: (d: SignupTrendDay) => number) => inSpan.reduce((a, d) => a + f(d), 0)
    const reg = sum((d) => d.reg)
    const n = dayCount(span.start, span.end)
    return {
        start: span.start, end: span.end, label: span.label,
        reg, plain: sum((d) => d.plain), apply: sum((d) => d.apply), phase2Unsaved: sum((d) => d.phase2Unsaved),
        perDay: n > 0 ? reg / n : 0,
        formUsers: ga4.formUsers, completedUsers: ga4.completedUsers,
        rate: span.start >= GA4_PAGE_TRACKING_FROM && ga4.formUsers > 0 ? ga4.completedUsers / ga4.formUsers : null,
        partial: span.partial,
    }
}

/** 対象面が「会員登録」のABテストを、期間に開始したものだけ年表の形にして返す */
async function abTestEvents(propertyId: string, startDate: string, endDate: string): Promise<SignupTimelineEvent[]> {
    const rows = await prisma.abTest.findMany({
        where: {
            genre: SIGNUP_AB_TEST_GENRE,
            product: { ga4PropertyId: propertyId },
            startDate: { gte: new Date(`${startDate}T00:00:00+09:00`), lte: new Date(`${endDate}T23:59:59+09:00`) },
        },
        select: {
            id: true, name: true, startDate: true, endDate: true, status: true,
            winnerVariant: true, improvementVsAPercent: true, issueUrl: true,
        },
        orderBy: { startDate: 'asc' },
    })
    return rows.map((r) => {
        const improvement = r.improvementVsAPercent != null ? Number(r.improvementVsAPercent) : null
        const result = r.status === 'completed' && r.winnerVariant
            ? `${r.winnerVariant} 勝ち${improvement != null ? `（A比 ${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}%）` : ''}。`
            : r.status === 'running' ? '実施中。' : ''
        const issue = r.issueUrl?.match(/(\d+)/)?.[1]
        return {
            date: ymd(r.startDate),
            endDate: r.endDate ? ymd(r.endDate) : undefined,
            kind: 'ab' as const,
            title: r.name,
            detail: `${result}ダッシュボードのABテスト id=${r.id}。`,
            abTestId: r.id,
            issue: issue ? Number(issue) : undefined,
            source: 'ab-test' as const,
        }
    })
}

/** 手書きの年表（結果まで書いてある方を優先）とABテストDBの自動分を混ぜる */
function mergeEvents(manual: SignupTimelineEvent[], fromDb: SignupTimelineEvent[]): SignupTimelineEvent[] {
    const seenId = new Set(manual.map((e) => e.abTestId).filter((id): id is number => id != null))
    // 本番とローカルで id が違っても二重に出さないよう、同じ日に始まるABテストも同一とみなす
    const seenStart = new Set(manual.filter((e) => e.kind === 'ab').map((e) => e.date))
    const extra = fromDb.filter((e) => !(e.abTestId != null && seenId.has(e.abTestId)) && !seenStart.has(e.date))
    return [...manual.map((e) => ({ ...e, source: e.source ?? ('manual' as const) })), ...extra]
        .sort((a, b) => a.date.localeCompare(b.date))
}

export async function runSignupTrendReport(
    reporter: Ga4Reporter,
    startDate: string,
    endDate: string,
): Promise<SignupTrendReport> {
    const weeks = weekSpans(startDate, endDate)
    const months = monthSpans(startDate, endDate)

    const [bq, weekUsers, monthUsers, totalUsers, dbEvents] = await Promise.all([
        runGa4EventsQuery(dailySql(startDate, endDate)),
        Promise.all(weeks.map((w) => pageUsers(reporter, w.start, w.end))),
        Promise.all(months.map((m) => pageUsers(reporter, m.start, m.end))),
        pageUsers(reporter, startDate, endDate),
        // ABテストDBが読めなくても推移は出す
        abTestEvents(reporter.ctx.propertyId, startDate, endDate).catch(() => [] as SignupTimelineEvent[]),
    ])

    const daily: SignupTrendDay[] = bq.rows.map((r) => ({
        date: r.d ?? '',
        reg: Number(r.reg ?? 0),
        plain: Number(r.plain ?? 0),
        apply: Number(r.apply_signup ?? 0),
        phase2Unsaved: Number(r.phase2_unsaved ?? 0),
    }))

    return {
        daily,
        weekly: weeks.map((w, i) => bucketOf(w, daily, weekUsers[i])),
        monthly: months.map((m, i) => bucketOf(m, daily, monthUsers[i])),
        events: mergeEvents(signupEventsIn(startDate, endDate), dbEvents),
        total: bucketOf({ start: startDate, end: endDate, label: '期間合計', partial: false }, daily, totalUsers),
        scannedBytes: bq.scannedBytes,
    }
}
