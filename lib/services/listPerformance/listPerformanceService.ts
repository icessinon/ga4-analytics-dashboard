import { runGa4EventsQuery } from '@/lib/bq/ga4EventsClient'
import { eventsFromWhere, toDisplay, type ExportWindow } from '@/lib/bq/ga4EventsSql'
import { INDUSTRY_ALT } from '@/lib/services/journey/pathCategories'
import type { ListPerformanceReport } from './listPerformanceTypes'

/**
 * 求人一覧パフォーマンス: 職種一覧（/{industry}系）と検索結果（/search）の
 * PV・閲覧セッション・詳細（media_）遷移率を、職種別サマリーと日次推移で返す。
 * BigQuery events_* をセッション単位で集計（runGa4EventsQuery の dry run ガード付き）。
 */

// 職種一覧: /{industry} トップ + 絞り込み下層（media_詳細は除外）
const LIST_RE = `^/(${INDUSTRY_ALT})(/[^/]+){0,3}/?$`
const SEARCH_RE = `^/search/?$`
const DETAIL_RE = `^/[^/]+/media_`

// 共通CTE: 期間内のpage_viewをセッションID・パス・日付つきでフラグ化
function flaggedCte(window: ExportWindow): string {
    return `
WITH pv AS (
  SELECT
    CONCAT(user_pseudo_id, '-', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key='ga_session_id') AS STRING)) AS sid,
    event_timestamp,
    event_date,
    REGEXP_EXTRACT((SELECT value.string_value FROM UNNEST(event_params) WHERE key='page_location'), r'^https?://[^/]+(/[^?#]*)') AS path
  ${eventsFromWhere(window)}
    AND event_name = 'page_view'
),
flagged AS (
  SELECT *,
    REGEXP_EXTRACT(path, r'^/(${INDUSTRY_ALT})(?:/|$)') AS ind,
    REGEXP_CONTAINS(path, r'${LIST_RE}') AND NOT REGEXP_CONTAINS(path, r'/media_') AS is_list,
    REGEXP_CONTAINS(path, r'${SEARCH_RE}') AS is_search,
    REGEXP_CONTAINS(path, r'${DETAIL_RE}') AS is_detail
  FROM pv
)`
}

function summaryQuery(window: ExportWindow): string {
    return `${flaggedCte(window)},
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
}

// 日次推移: 職種一覧計 vs search（セッションの初回閲覧日に帰属）
function dailyQuery(window: ExportWindow): string {
    return `${flaggedCte(window)},
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
}

/** window は clampToExportWindow 済みのもの。2 クエリは BQ の同時実行を避けて直列に流す */
export async function runListPerformanceReport(window: ExportWindow): Promise<ListPerformanceReport> {
    const summaryRes = await runGa4EventsQuery(summaryQuery(window))
    const dailyRes = await runGa4EventsQuery(dailyQuery(window))

    const n = (v: string | null | undefined) => parseInt(v ?? '0', 10)
    return {
        startDate: toDisplay(window.start),
        endDate: toDisplay(window.end),
        clamped: window.clamped,
        summary: summaryRes.rows.map((r) => ({ segment: r.segment ?? '', pv: n(r.pv), sessions: n(r.sessions), toDetail: n(r.to_detail) })),
        daily: dailyRes.rows.map((r) => ({
            segment: r.segment ?? '',
            date: toDisplay(r.date ?? ''),
            pv: n(r.pv),
            sessions: n(r.sessions),
            toDetail: n(r.to_detail),
        })),
        scannedBytes: summaryRes.scannedBytes + dailyRes.scannedBytes,
    }
}
