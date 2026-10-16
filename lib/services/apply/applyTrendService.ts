import { runGa4EventsQuery } from '@/lib/bq/ga4EventsClient'
import { APPLY_AB_TEST_GENRES, applyEventsIn, type ApplyTimelineEvent } from '@/lib/constants/applyTimeline'
import { prisma } from '@/lib/db/client'
import { dayCount, monthSpans, weekSpans, ymd, type TrendSpan } from '@/lib/services/trend/buckets'
import type { ApplyTrendBucket, ApplyTrendDay, ApplyTrendReport } from './applyTrendTypes'

/**
 * 応募数の推移。
 *
 * **応募数の正はプロダクトDB**（`xmile-drm.xwork.job_applications`）。契約種別は求人マスタ
 * （削除済みも含む `job_descriptions_with_deleted`）の `contract_type` で引く。事業KPIページと
 * 同じ取り口なので、月次は事業KPIと一致する。GA4 の `/entry/thanks` 到達とは一致しない
 * （GA4 は計測の取りこぼしがある）。
 *
 * **ゲスト応募（`guest_job_applications`）は合計に入れない。** 会員を介さない人材紹介LP経由の
 * 応募で、桁が違う（2026-09 実測: 会員応募 522件 に対しゲスト 2,978件）。事業KPIページの
 * 応募数も会員応募だけを数えているので、合算すると「正」が2つになる。別系列として併記する。
 *
 * 一覧→詳細→応募の遷移率は applyFunnelService（BigQuery のセッション解析）が別で出す。
 * こちらは件数だけなのでスキャンが小さく、ページを開くたびに回してよい。
 */

const APPLICATIONS = '`xmile-drm.xwork.job_applications`'
const GUEST_APPLICATIONS = '`xmile-drm.xwork.guest_job_applications`'
const JOB_DESCRIPTIONS_ALL = '`xmile-drm.xwork.job_descriptions_with_deleted`'

function dailySql(startDate: string, endDate: string): string {
    return `
WITH member_apps AS (
  SELECT DATE(ja.created_at, 'Asia/Tokyo') AS d, jd.contract_type
  FROM ${APPLICATIONS} ja
  JOIN ${JOB_DESCRIPTIONS_ALL} jd ON jd.id = ja.media_id
  WHERE DATE(ja.created_at, 'Asia/Tokyo') BETWEEN DATE '${startDate}' AND DATE '${endDate}'
),
by_day AS (
  SELECT d,
    COUNT(*) AS total,
    COUNTIF(contract_type = '求人広告') AS job_ad,
    COUNTIF(contract_type = '人材紹介') AS agent,
    COUNTIF(contract_type = 'ハローワーク') AS hw
  FROM member_apps GROUP BY d
),
guest AS (
  SELECT DATE(created_at, 'Asia/Tokyo') AS d, COUNT(*) AS guest
  FROM ${GUEST_APPLICATIONS}
  WHERE DATE(created_at, 'Asia/Tokyo') BETWEEN DATE '${startDate}' AND DATE '${endDate}'
  GROUP BY d
)
SELECT
  FORMAT_DATE('%Y-%m-%d', IFNULL(b.d, g.d)) AS d,
  IFNULL(b.total, 0) AS total,
  IFNULL(b.job_ad, 0) AS job_ad,
  IFNULL(b.agent, 0) AS agent,
  IFNULL(b.hw, 0) AS hw,
  IFNULL(g.guest, 0) AS guest
FROM by_day b
FULL OUTER JOIN guest g ON g.d = b.d
ORDER BY d`
}

/** 対象面が応募系のABテストを、期間に開始したものだけ年表の形にして返す */
async function abTestEvents(propertyId: string, startDate: string, endDate: string): Promise<ApplyTimelineEvent[]> {
    const rows = await prisma.abTest.findMany({
        where: {
            genre: { in: [...APPLY_AB_TEST_GENRES] },
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

function mergeEvents(manual: ApplyTimelineEvent[], fromDb: ApplyTimelineEvent[]): ApplyTimelineEvent[] {
    const seenId = new Set(manual.map((e) => e.abTestId).filter((id): id is number => id != null))
    const seenStart = new Set(manual.filter((e) => e.kind === 'ab').map((e) => e.date))
    const extra = fromDb.filter((e) => !(e.abTestId != null && seenId.has(e.abTestId)) && !seenStart.has(e.date))
    return [...manual.map((e) => ({ ...e, source: e.source ?? ('manual' as const) })), ...extra]
        .sort((a, b) => a.date.localeCompare(b.date))
}

function bucketOf(span: TrendSpan, days: ApplyTrendDay[]): ApplyTrendBucket {
    const inSpan = days.filter((d) => d.date >= span.start && d.date <= span.end)
    const sum = (f: (d: ApplyTrendDay) => number) => inSpan.reduce((a, d) => a + f(d), 0)
    const total = sum((d) => d.total)
    const n = dayCount(span.start, span.end)
    return {
        start: span.start, end: span.end, label: span.label,
        total,
        jobAd: sum((d) => d.jobAd), agent: sum((d) => d.agent), hw: sum((d) => d.hw), guest: sum((d) => d.guest),
        perDay: n > 0 ? total / n : 0,
        partial: span.partial,
    }
}

export async function runApplyTrendReport(
    propertyId: string,
    startDate: string,
    endDate: string,
): Promise<ApplyTrendReport> {
    const [bq, dbEvents] = await Promise.all([
        runGa4EventsQuery(dailySql(startDate, endDate)),
        abTestEvents(propertyId, startDate, endDate).catch(() => [] as ApplyTimelineEvent[]),
    ])

    const daily: ApplyTrendDay[] = bq.rows.map((r) => ({
        date: r.d ?? '',
        total: Number(r.total ?? 0),
        jobAd: Number(r.job_ad ?? 0),
        agent: Number(r.agent ?? 0),
        hw: Number(r.hw ?? 0),
        guest: Number(r.guest ?? 0),
    }))

    return {
        daily,
        weekly: weekSpans(startDate, endDate).map((w) => bucketOf(w, daily)),
        monthly: monthSpans(startDate, endDate).map((m) => bucketOf(m, daily)),
        events: mergeEvents(applyEventsIn(startDate, endDate), dbEvents),
        total: bucketOf({ start: startDate, end: endDate, label: '期間合計', partial: false }, daily),
        scannedBytes: bq.scannedBytes,
    }
}
