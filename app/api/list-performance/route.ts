import { NextResponse } from 'next/server'
import { runGa4EventsQuery, GA4_EXPORT_START } from '@/lib/bq/ga4EventsClient'

/**
 * 求人一覧パフォーマンス: 職種一覧（/{industry}系）と検索結果（/search）の
 * PV・閲覧セッション・詳細（media_）遷移率を、職種別サマリーと日次推移で返す。
 * BigQuery events_* をセッション単位で集計（runGa4EventsQueryのdry runガード付き）。
 */

const INDUSTRIES = [
    'driver', 'sekokan', 'sekkei', 'soko', 'shokunin', 'seibi', 'hoshu',
    'setsubi-sagyo', 'keibi', 'unkan', 'kojo-sagyo', 'food', 'unyu-sagyo', 'others',
]
const IND_ALT = INDUSTRIES.join('|')

// 職種一覧: /{industry} トップ + 絞り込み下層（media_詳細は除外）
const LIST_RE = `^/(${IND_ALT})(/[^/]+){0,3}/?$`
const SEARCH_RE = `^/search/?$`
const DETAIL_RE = `^/[^/]+/media_`

const YMD = /^\d{4}-\d{2}-\d{2}$/

function toSuffix(ymd: string): string {
    return ymd.replace(/-/g, '')
}

// 共通CTE: 期間内のpage_viewをセッションID・パス・日付つきでフラグ化
function flaggedCte(startSuffix: string, endSuffix: string): string {
    return `
WITH pv AS (
  SELECT
    CONCAT(user_pseudo_id, '-', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key='ga_session_id') AS STRING)) AS sid,
    event_timestamp,
    event_date,
    REGEXP_EXTRACT((SELECT value.string_value FROM UNNEST(event_params) WHERE key='page_location'), r'^https?://[^/]+(/[^?#]*)') AS path
  FROM \`x-work-ga.analytics_534098180.events_*\`
  WHERE _TABLE_SUFFIX BETWEEN '${startSuffix}' AND '${endSuffix}'
    AND event_name = 'page_view'
),
flagged AS (
  SELECT *,
    REGEXP_EXTRACT(path, r'^/(${IND_ALT})(?:/|$)') AS ind,
    REGEXP_CONTAINS(path, r'${LIST_RE}') AND NOT REGEXP_CONTAINS(path, r'/media_') AS is_list,
    REGEXP_CONTAINS(path, r'${SEARCH_RE}') AS is_search,
    REGEXP_CONTAINS(path, r'${DETAIL_RE}') AS is_detail
  FROM pv
)`
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}))
        let startDate: string = YMD.test(body?.startDate) ? body.startDate : ''
        let endDate: string = YMD.test(body?.endDate) ? body.endDate : ''
        if (!startDate || !endDate) {
            return NextResponse.json({ error: 'startDate / endDate (YYYY-MM-DD) が必要です' }, { status: 400 })
        }

        // BQ日次エクスポートは前日分まで。開始はエクスポート開始日にクランプ
        const yesterday = new Date(Date.now() + 9 * 3600 * 1000 - 86400000).toISOString().slice(0, 10)
        if (endDate > yesterday) endDate = yesterday
        let clamped = false
        let startSuffix = toSuffix(startDate)
        if (startSuffix < GA4_EXPORT_START) {
            startSuffix = GA4_EXPORT_START
            startDate = `${GA4_EXPORT_START.slice(0, 4)}-${GA4_EXPORT_START.slice(4, 6)}-${GA4_EXPORT_START.slice(6, 8)}`
            clamped = true
        }
        const endSuffix = toSuffix(endDate)
        if (startSuffix > endSuffix) {
            return NextResponse.json({ error: '対象期間にBQデータがありません（エクスポートは2026-08-07開始）' }, { status: 400 })
        }

        // 職種別 + search のサマリー
        const summaryQuery = `${flaggedCte(startSuffix, endSuffix)},
ind_cohort AS (
  SELECT ind AS segment, sid, MIN(event_timestamp) AS first_ts
  FROM flagged WHERE is_list AND ind IS NOT NULL GROUP BY ind, sid
),
search_cohort AS (
  SELECT 'search' AS segment, sid, MIN(event_timestamp) AS first_ts
  FROM flagged WHERE is_search GROUP BY sid
),
cohort AS (SELECT * FROM ind_cohort UNION ALL SELECT * FROM search_cohort),
trans AS (
  SELECT c.segment, c.sid,
    LOGICAL_OR(f.is_detail AND f.event_timestamp >= c.first_ts) AS to_detail
  FROM cohort c JOIN flagged f ON f.sid = c.sid
  GROUP BY c.segment, c.sid
),
pv_counts AS (
  SELECT ind AS segment, COUNT(*) AS pv FROM flagged WHERE is_list AND ind IS NOT NULL GROUP BY ind
  UNION ALL
  SELECT 'search', COUNTIF(is_search) FROM flagged
)
SELECT t.segment, ANY_VALUE(p.pv) AS pv, COUNT(*) AS sessions, COUNTIF(t.to_detail) AS to_detail
FROM trans t JOIN pv_counts p ON p.segment = t.segment
GROUP BY t.segment
ORDER BY sessions DESC`

        // 日次推移: 職種一覧計 vs search（セッションの初回閲覧日に帰属）
        const dailyQuery = `${flaggedCte(startSuffix, endSuffix)},
cohort AS (
  SELECT 'industry_list' AS segment, sid, MIN(event_timestamp) AS first_ts, MIN(event_date) AS date
  FROM flagged WHERE is_list GROUP BY sid
  UNION ALL
  SELECT 'search', sid, MIN(event_timestamp), MIN(event_date)
  FROM flagged WHERE is_search GROUP BY sid
),
trans AS (
  SELECT c.segment, c.sid, c.date,
    LOGICAL_OR(f.is_detail AND f.event_timestamp >= c.first_ts) AS to_detail
  FROM cohort c JOIN flagged f ON f.sid = c.sid
  GROUP BY c.segment, c.sid, c.date
),
pv_daily AS (
  SELECT 'industry_list' AS segment, event_date AS date, COUNTIF(is_list) AS pv FROM flagged GROUP BY event_date
  UNION ALL
  SELECT 'search', event_date, COUNTIF(is_search) FROM flagged GROUP BY event_date
)
SELECT t.segment, t.date, ANY_VALUE(p.pv) AS pv, COUNT(*) AS sessions, COUNTIF(t.to_detail) AS to_detail
FROM trans t JOIN pv_daily p ON p.segment = t.segment AND p.date = t.date
GROUP BY t.segment, t.date
ORDER BY t.date, t.segment`

        const [summaryRes, dailyRes] = [await runGa4EventsQuery(summaryQuery), await runGa4EventsQuery(dailyQuery)]

        const summary = summaryRes.rows.map((r) => ({
            segment: r.segment ?? '',
            pv: parseInt(r.pv ?? '0', 10),
            sessions: parseInt(r.sessions ?? '0', 10),
            toDetail: parseInt(r.to_detail ?? '0', 10),
        }))
        const daily = dailyRes.rows.map((r) => ({
            segment: r.segment ?? '',
            date: `${(r.date ?? '').slice(0, 4)}-${(r.date ?? '').slice(4, 6)}-${(r.date ?? '').slice(6, 8)}`,
            pv: parseInt(r.pv ?? '0', 10),
            sessions: parseInt(r.sessions ?? '0', 10),
            toDetail: parseInt(r.to_detail ?? '0', 10),
        }))

        return NextResponse.json({
            success: true,
            startDate,
            endDate,
            clamped,
            summary,
            daily,
            scannedBytes: summaryRes.scannedBytes + dailyRes.scannedBytes,
            fetchedAt: new Date().toISOString(),
        })
    } catch (error) {
        console.error('List Performance API Error:', error)
        return NextResponse.json(
            { error: '求人一覧パフォーマンスの集計に失敗しました', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
