import { runGa4EventsQuery } from '@/lib/bq/ga4EventsClient'
import { clampToExportWindow, eventsFromWhere, toDisplay } from '@/lib/bq/ga4EventsSql'
import { dayCount, weekSpans, type TrendSpan } from '@/lib/services/trend/buckets'
import type { ApplyFunnelBucket, ApplyFunnelReport } from './applyTrendTypes'

/**
 * 求人一覧 → 求人詳細 → 応募フォーム → 応募完了 を**セッション単位**で数える。
 *
 * **到達ユーザー数の比では応募ファネルにならない。** 求人詳細は検索エンジンからの直接流入が
 * 主で、期間UUは一覧 48,596 に対し詳細 82,164（2026-09-15〜10-15 実測）と逆転する。
 * 「一覧を見たセッションが、その後に詳細・フォーム・完了へ進んだか」で数える必要があるため、
 * GA4 Data API ではなく BigQuery のエクスポートを読む。
 *
 * ページ定義（path は page_location のパス部分）:
 *   一覧   `^/(search|{業種})(/[^/]+)?/?$` から `/media_` を含むものを除いたもの
 *          （検索結果・業種トップ・職種一覧。**この除外を忘れると求人詳細が一覧に混ざり、
 *          一覧→詳細が 84.9% のような値になる**）
 *   詳細   `^/[^/]+/media_`
 *   フォーム `^/entry/media_`
 *   完了   `^/entry/thanks`
 *
 * **スキャンが大きい（約60MB/日・70日で約4GB≒4円）ので、画面からは手動実行にする。**
 * 既定の上限は 70 日。runGa4EventsQuery が内部で dry run し、5GB を超えると実行せずに弾く。
 */

/** drm-front の industries（apps/web/src/pages/members/signup/_config/occupations.ts）と同じ */
const INDUSTRIES = [
    'driver', 'hoshu', 'keibi', 'kojo-sagyo', 'others', 'seibi', 'sekkei',
    'sekokan', 'setsubi-sagyo', 'shokunin', 'soko', 'unkan', 'food',
]

/** 1 回で読む最大日数。これ以上は古い側を切る（5GB ガードに当てないため） */
export const APPLY_FUNNEL_MAX_DAYS = 70
/** 画面に出す概算コストの根拠（実測 2026-08〜10 で約60MB/日） */
export const APPLY_FUNNEL_MB_PER_DAY = 60

function sql(start: string, end: string): string {
    const listRe = `^/(search|${INDUSTRIES.join('|')})(/[^/]+)?/?$`
    return `
WITH pv AS (
  SELECT
    CONCAT(user_pseudo_id, '-', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key='ga_session_id') AS STRING)) AS sid,
    event_timestamp AS ts,
    DATE(TIMESTAMP_MICROS(event_timestamp), 'Asia/Tokyo') AS d,
    REGEXP_EXTRACT((SELECT value.string_value FROM UNNEST(event_params) WHERE key='page_location'), r'^https?://[^/]+(/[^?#]*)') AS path
  ${eventsFromWhere({ start, end })}
    AND event_name = 'page_view'
),
list_hits AS (
  SELECT sid, MIN(ts) AS list_ts, MIN(d) AS d
  FROM pv
  -- RE2 に先読みが無いので、詳細（/{業種}/media_*）は別条件で外す
  WHERE REGEXP_CONTAINS(path, r'${listRe}') AND NOT REGEXP_CONTAINS(path, r'/media_')
  GROUP BY sid
),
sess AS (
  SELECT l.sid, l.d,
    LOGICAL_OR(REGEXP_CONTAINS(p.path, r'^/[^/]+/media_') AND p.ts >= l.list_ts) AS to_detail,
    LOGICAL_OR(REGEXP_CONTAINS(p.path, r'^/entry/media_') AND p.ts >= l.list_ts) AS to_form,
    LOGICAL_OR(REGEXP_CONTAINS(p.path, r'^/entry/thanks') AND p.ts >= l.list_ts) AS to_done
  FROM list_hits l JOIN pv p USING (sid)
  GROUP BY l.sid, l.d
)
SELECT FORMAT_DATE('%Y-%m-%d', d) AS d,
  COUNT(*) AS sessions,
  COUNTIF(to_detail) AS to_detail,
  COUNTIF(to_form) AS to_form,
  COUNTIF(to_done) AS to_done
FROM sess
GROUP BY d
ORDER BY d`
}

interface Row { date: string; sessions: number; toDetail: number; toForm: number; toDone: number }

function bucketOf(span: TrendSpan, days: Row[]): ApplyFunnelBucket {
    const inSpan = days.filter((d) => d.date >= span.start && d.date <= span.end)
    const sum = (f: (d: Row) => number) => inSpan.reduce((a, d) => a + f(d), 0)
    return {
        start: span.start, end: span.end, label: span.label,
        sessions: sum((d) => d.sessions),
        toDetail: sum((d) => d.toDetail),
        toForm: sum((d) => d.toForm),
        toDone: sum((d) => d.toDone),
        partial: span.partial,
    }
}

export async function runApplyFunnelReport(startDate: string, endDate: string): Promise<ApplyFunnelReport> {
    const win = clampToExportWindow(startDate, endDate, { maxDays: APPLY_FUNNEL_MAX_DAYS })
    const start = toDisplay(win.start)
    const end = toDisplay(win.end)
    const { rows, scannedBytes } = await runGa4EventsQuery(sql(win.start, win.end))

    const days: Row[] = rows.map((r) => ({
        date: r.d ?? '',
        sessions: Number(r.sessions ?? 0),
        toDetail: Number(r.to_detail ?? 0),
        toForm: Number(r.to_form ?? 0),
        toDone: Number(r.to_done ?? 0),
    }))

    return {
        startDate: start,
        endDate: end,
        clamped: win.clamped,
        weekly: weekSpans(start, end).map((w) => bucketOf(w, days)),
        total: bucketOf({ start, end, label: `${dayCount(start, end)}日間`, partial: false }, days),
        scannedBytes,
    }
}
