import type { ScanCommandInput } from '@aws-sdk/lib-dynamodb'
import { and, beginsWith, contains } from '@/lib/api/ga4/filters'
import type { Ga4Reporter } from '@/lib/api/ga4/report'
import { dim, metricInt, rowsOf } from '@/lib/api/ga4/rows'
import { DDB_TABLES, scanAll } from '@/lib/aws/dynamoClient'
import type { ScoutFunnelReport } from './scoutFunnelTypes'

/**
 * スカウト効果ファネル（A-1 暫定版）
 *   送信リクエスト(DDB ScoutHistories) → 閲覧(GA4 /scout/ ページ) → 応募(GA4 送信ボタンクリック × scoutId付きURL)
 * 送達(sent)は drm-front 側の writeback (C-4) 実装後に requested と分離して表示できる。
 * 応募は C-3（scoutId永続化）完了後に DDB ベースへ切替可能。クリック=実応募一致はDB照合で実証済み。
 */

interface ScoutAttempt {
    scoutId?: string
    status?: string
    requestedAt?: string
    sentAt?: string
}

interface ScoutHistoryItem {
    pk: string
    companyId?: string
    jobId?: string
    attempts?: ScoutAttempt[]
    // ScoutPageData（pk=SCOUT#...）側
    scoutId?: string
    companyName?: string
}

const JST_MS = 9 * 3600 * 1000

function jstDate(iso: string): string {
    return new Date(new Date(iso).getTime() + JST_MS).toISOString().split('T')[0]
}

function extractScoutIdFromUrl(url: string): string | null {
    const m = url.match(/[?&]scoutId=([0-9a-f-]{36})/i)
    return m ? m[1].toLowerCase() : null
}

function scoutIdFromPagePath(path: string): string | null {
    const m = path.match(/^\/scout\/([0-9a-f-]{36})/i)
    return m ? m[1].toLowerCase() : null
}

const ymd = (raw: string) => `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`

/** startDate / endDate は 'YYYY-MM-DD'（DDB 側の日付絞り込みと日次系列に使う） */
export async function runScoutFunnelReport(reporter: Ga4Reporter, startDate: string, endDate: string): Promise<ScoutFunnelReport> {
    // ---- DDB: スカウト送信リクエスト（+ scoutId→企業のマップ）----
    const scanInput: ScanCommandInput = {
        TableName: DDB_TABLES.scoutHistories,
        ProjectionExpression: 'pk, companyId, jobId, attempts, scoutId, companyName',
    }
    const items = await scanAll<ScoutHistoryItem>(scanInput)

    const companyNameById = new Map<string, string>()
    const scoutMeta = new Map<string, { companyId: string | null; companyName: string | null }>()
    // ScoutPageData（pk=SCOUT#...）: scoutId→companyName
    for (const item of items) {
        if (item.pk?.startsWith('SCOUT#') && item.scoutId) {
            scoutMeta.set(item.scoutId.toLowerCase(), { companyId: item.companyId ?? null, companyName: item.companyName ?? null })
        }
    }

    const requestedDaily = new Map<string, number>()
    const companyDailyMap = new Map<string, Map<string, number>>()
    // status は requested/sent/failed 以外の値も入りうるため、総数は別カウントする
    const statusTotal: Record<string, number> = { requested: 0, sent: 0, failed: 0 }
    let totalAttempts = 0
    // 時間別（JST時刻0-23）: 送達数・閲覧数・最多送信企業。閲覧判定は下でGA4の閲覧scoutId集合を使うため一旦attemptを溜める
    const sentByHour: Array<{ hour: number; scoutId: string | null; companyId: string | null }> = []
    const companyAgg = new Map<string, { companyName: string | null; requested: number; sent: number; viewed: number; applied: number }>()
    const companyOf = (companyId: string | null, companyName: string | null) => {
        const key = companyId ?? 'unknown'
        let row = companyAgg.get(key)
        if (!row) {
            row = { companyName: companyName ?? null, requested: 0, sent: 0, viewed: 0, applied: 0 }
            companyAgg.set(key, row)
        }
        if (!row.companyName && companyName) row.companyName = companyName
        return row
    }

    for (const item of items) {
        if (item.pk?.startsWith('SCOUT#')) continue
        const companyId = item.companyId ?? null
        for (const attempt of item.attempts ?? []) {
            if (!attempt.requestedAt) continue
            const d = jstDate(attempt.requestedAt)
            if (d < startDate || d > endDate) continue
            const status = attempt.status ?? 'requested'
            statusTotal[status] = (statusTotal[status] ?? 0) + 1
            totalAttempts += 1
            requestedDaily.set(d, (requestedDaily.get(d) ?? 0) + 1)
            if (status === 'sent') {
                const hour = new Date(new Date(attempt.requestedAt).getTime() + JST_MS).getUTCHours()
                sentByHour.push({ hour, scoutId: attempt.scoutId?.toLowerCase() ?? null, companyId })
            }
            const meta = attempt.scoutId ? scoutMeta.get(attempt.scoutId.toLowerCase()) : undefined
            const row = companyOf(companyId, meta?.companyName ?? null)
            row.requested += 1
            const cKey = companyId ?? 'unknown'
            let cDaily = companyDailyMap.get(cKey)
            if (!cDaily) {
                cDaily = new Map()
                companyDailyMap.set(cKey, cDaily)
            }
            cDaily.set(d, (cDaily.get(d) ?? 0) + 1)
            if (status === 'sent') row.sent += 1
            if (attempt.scoutId && !scoutMeta.has(attempt.scoutId.toLowerCase())) {
                scoutMeta.set(attempt.scoutId.toLowerCase(), { companyId, companyName: meta?.companyName ?? null })
            } else if (attempt.scoutId) {
                const m = scoutMeta.get(attempt.scoutId.toLowerCase())!
                if (!m.companyId) m.companyId = companyId
            }
        }
    }
    for (const [, meta] of scoutMeta) {
        if (meta.companyId && meta.companyName && !companyNameById.has(meta.companyId)) {
            companyNameById.set(meta.companyId, meta.companyName)
        }
    }

    // ---- GA4: 閲覧・応募 ----
    const scoutPageFilter = beginsWith('pagePath', '/scout/')
    const applyClickFilter = and(
        beginsWith('customEvent:click_label', 'EF__'),
        contains('customEvent:click_label', '__Btn__'),
        contains('pageLocation', 'scoutId='),
    )
    // 応募フォーム到達: scoutId付きURLで EF__ 表示（view_label）— applyClickFilter の view 版
    const formReachedFilter = and(beginsWith('customEvent:view_label', 'EF__'), contains('pageLocation', 'scoutId='))

    const [viewDailyRes, viewByScoutRes, applyDailyRes, applyByUrlRes, viewTotalRes, applyTotalRes, viewDailyByScoutRes, applyDailyByUrlRes, formReachedRes] = await reporter.runAll([
        { dimensions: ['date'], metrics: ['totalUsers'], dimensionFilter: scoutPageFilter, limit: 1000 },
        { dimensions: ['pagePath'], metrics: ['totalUsers'], dimensionFilter: scoutPageFilter, limit: 10000 },
        { dimensions: ['date'], metrics: ['totalUsers'], dimensionFilter: applyClickFilter, limit: 1000 },
        { dimensions: ['pageLocation'], metrics: ['totalUsers'], dimensionFilter: applyClickFilter, limit: 10000 },
        // 期間全体のユニークユーザー・セッション（日次ユニークの合計は期間ユニークと一致しないため別クエリ）
        { metrics: ['totalUsers', 'sessions'], dimensionFilter: scoutPageFilter, limit: 10 },
        { metrics: ['totalUsers'], dimensionFilter: applyClickFilter, limit: 10 },
        // 企業別チャート用: 日付×スカウトページの閲覧、日付×URLの応募クリック
        { dimensions: ['date', 'pagePath'], metrics: ['totalUsers'], dimensionFilter: scoutPageFilter, limit: 10000 },
        { dimensions: ['date', 'pageLocation'], metrics: ['totalUsers'], dimensionFilter: applyClickFilter, limit: 10000 },
        // 応募フォーム到達（scoutId付きEF__表示のユニークユーザー）
        { metrics: ['totalUsers'], dimensionFilter: formReachedFilter, limit: 10 },
    ])

    const viewedDaily = new Map<string, number>()
    for (const row of rowsOf(viewDailyRes)) viewedDaily.set(ymd(dim(row)), metricInt(row))
    const viewTotalRow = rowsOf(viewTotalRes)[0]
    const viewedUsers = viewTotalRow ? metricInt(viewTotalRow, 0) : 0
    const viewedSessions = viewTotalRow ? metricInt(viewTotalRow, 1) : 0
    const formReachedRow = rowsOf(formReachedRes)[0]
    const formReachedUsers = formReachedRow ? metricInt(formReachedRow) : 0

    // 閲覧された scoutId 集合（時間別クリック率の判定に使う）
    const viewedScoutIdSet = new Set<string>()
    let viewedScoutIds = 0
    for (const row of rowsOf(viewByScoutRes)) {
        const scoutId = scoutIdFromPagePath(dim(row))
        if (!scoutId) continue
        const users = metricInt(row)
        if (users > 0) {
            viewedScoutIds += 1
            viewedScoutIdSet.add(scoutId)
        }
        const meta = scoutMeta.get(scoutId)
        if (meta?.companyId) companyOf(meta.companyId, meta.companyName).viewed += users
    }

    const appliedDaily = new Map<string, number>()
    for (const row of rowsOf(applyDailyRes)) appliedDaily.set(ymd(dim(row)), metricInt(row))
    const applyTotalRow = rowsOf(applyTotalRes)[0]
    const appliedUsers = applyTotalRow ? metricInt(applyTotalRow) : 0

    for (const row of rowsOf(applyByUrlRes)) {
        const scoutId = extractScoutIdFromUrl(dim(row))
        if (!scoutId) continue
        const meta = scoutMeta.get(scoutId)
        if (meta?.companyId) companyOf(meta.companyId, meta.companyName).applied += metricInt(row)
    }

    // ---- 企業別×日別の閲覧・応募（scoutId経由で企業に紐付け）----
    const addDaily = (map: Map<string, Map<string, number>>, companyId: string, d: string, n: number) => {
        let m = map.get(companyId)
        if (!m) {
            m = new Map()
            map.set(companyId, m)
        }
        m.set(d, (m.get(d) ?? 0) + n)
    }
    const companyViewedDaily = new Map<string, Map<string, number>>()
    for (const row of rowsOf(viewDailyByScoutRes)) {
        const scoutId = scoutIdFromPagePath(dim(row, 1))
        if (!scoutId) continue
        const meta = scoutMeta.get(scoutId)
        if (!meta?.companyId) continue
        addDaily(companyViewedDaily, meta.companyId, ymd(dim(row, 0)), metricInt(row))
    }
    const companyAppliedDaily = new Map<string, Map<string, number>>()
    for (const row of rowsOf(applyDailyByUrlRes)) {
        const scoutId = extractScoutIdFromUrl(dim(row, 1))
        if (!scoutId) continue
        const meta = scoutMeta.get(scoutId)
        if (!meta?.companyId) continue
        addDaily(companyAppliedDaily, meta.companyId, ymd(dim(row, 0)), metricInt(row))
    }

    // ---- 日次系列（対象期間の全日）----
    const daily: ScoutFunnelReport['daily'] = []
    for (let t = new Date(`${startDate}T00:00:00Z`).getTime(); t <= new Date(`${endDate}T00:00:00Z`).getTime(); t += 86400000) {
        const d = new Date(t).toISOString().split('T')[0]
        daily.push({ date: d, requested: requestedDaily.get(d) ?? 0, viewed: viewedDaily.get(d) ?? 0, applied: appliedDaily.get(d) ?? 0 })
    }

    const companies = [...companyAgg.entries()]
        .map(([companyId, row]) => ({
            companyId,
            companyName: row.companyName ?? companyNameById.get(companyId) ?? null,
            requested: row.requested,
            sent: row.sent,
            viewed: row.viewed,
            applied: row.applied,
        }))
        .sort((a, b) => b.requested - a.requested)

    // ---- 企業別×日別の送信・閲覧・応募（企業クリック時の個別チャート用）----
    const dates = daily.map((d) => d.date)
    const companyDaily = companies.map((c) => ({
        companyId: c.companyId,
        companyName: c.companyName,
        requested: dates.map((d) => companyDailyMap.get(c.companyId)?.get(d) ?? 0),
        viewed: dates.map((d) => companyViewedDaily.get(c.companyId)?.get(d) ?? 0),
        applied: dates.map((d) => companyAppliedDaily.get(c.companyId)?.get(d) ?? 0),
    }))

    // ---- 時間別（JST 0-23）: 送達・閲覧(scoutId一致)・最多送信企業 ----
    const hourAgg = Array.from({ length: 24 }, (_, hour) => ({ hour, sent: 0, viewed: 0, company: new Map<string, number>() }))
    for (const s of sentByHour) {
        const h = hourAgg[s.hour]
        h.sent += 1
        if (s.scoutId && viewedScoutIdSet.has(s.scoutId)) h.viewed += 1
        if (s.companyId) h.company.set(s.companyId, (h.company.get(s.companyId) ?? 0) + 1)
    }
    const hourly = hourAgg.map((h) => {
        let topId: string | null = null
        let topN = 0
        for (const [cid, n] of h.company) if (n > topN) { topN = n; topId = cid }
        const topCompanyName = topId ? (companyAgg.get(topId)?.companyName ?? companyNameById.get(topId) ?? null) : null
        return { hour: h.hour, sent: h.sent, viewed: h.viewed, topCompanyName }
    })

    return {
        summary: {
            requested: totalAttempts,
            sent: statusTotal.sent,
            failed: statusTotal.failed,
            skipped: statusTotal.skipped ?? 0,
            viewedUsers,
            viewedSessions,
            viewedScoutIds,
            formReachedUsers,
            appliedUsers,
        },
        hourly,
        daily,
        companies,
        companyDaily,
    }
}
