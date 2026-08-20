import { NextResponse } from 'next/server'
import { ScanCommandInput } from '@aws-sdk/lib-dynamodb'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { DDB_TABLES, scanAll } from '@/lib/aws/dynamoClient'
import { parseDateString } from '@/lib/utils/date'

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

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const propertyId: string = body.propertyId
        if (!propertyId) {
            return NextResponse.json({ error: 'propertyId が必要です' }, { status: 400 })
        }
        const startDate = parseDateString(body.startDate || '30daysAgo')
        const endDate = parseDateString(body.endDate || 'yesterday')
        const dateRanges = [{ startDate, endDate }]

        const accessToken = await getGA4AccessToken()

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
                scoutMeta.set(item.scoutId.toLowerCase(), {
                    companyId: item.companyId ?? null,
                    companyName: item.companyName ?? null,
                })
            }
        }

        const requestedDaily = new Map<string, number>()
        const companyDailyMap = new Map<string, Map<string, number>>()
        // status は requested/sent/failed 以外の値も入りうるため、総数は別カウントする
        const statusTotal: Record<string, number> = { requested: 0, sent: 0, failed: 0 }
        let totalAttempts = 0
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
        const applyClickFilter = {
            andGroup: {
                expressions: [
                    { filter: { fieldName: 'customEvent:click_label', stringFilter: { matchType: 'BEGINS_WITH', value: 'EF__' } } },
                    { filter: { fieldName: 'customEvent:click_label', stringFilter: { matchType: 'CONTAINS', value: '__Btn__' } } },
                    { filter: { fieldName: 'pageLocation', stringFilter: { matchType: 'CONTAINS', value: 'scoutId=' } } },
                ],
            },
        }
        const [viewDailyRes, viewByScoutRes, applyDailyRes, applyByUrlRes, viewTotalRes, applyTotalRes, viewDailyByScoutRes, applyDailyByUrlRes] = await Promise.all([
            fetchGA4Data({
                propertyId, dateRanges,
                dimensions: [{ name: 'date' }],
                metrics: [{ name: 'totalUsers' }],
                dimensionFilter: { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: '/scout/' } } },
                limit: 1000,
            }, accessToken),
            fetchGA4Data({
                propertyId, dateRanges,
                dimensions: [{ name: 'pagePath' }],
                metrics: [{ name: 'totalUsers' }],
                dimensionFilter: { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: '/scout/' } } },
                limit: 10000,
            }, accessToken),
            fetchGA4Data({
                propertyId, dateRanges,
                dimensions: [{ name: 'date' }],
                metrics: [{ name: 'totalUsers' }],
                dimensionFilter: applyClickFilter,
                limit: 1000,
            }, accessToken),
            fetchGA4Data({
                propertyId, dateRanges,
                dimensions: [{ name: 'pageLocation' }],
                metrics: [{ name: 'totalUsers' }],
                dimensionFilter: applyClickFilter,
                limit: 10000,
            }, accessToken),
            // 期間全体のユニークユーザー（日次ユニークの合計は期間ユニークと一致しないため別クエリ）
            fetchGA4Data({
                propertyId, dateRanges,
                metrics: [{ name: 'totalUsers' }],
                dimensionFilter: { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: '/scout/' } } },
                limit: 10,
            }, accessToken),
            fetchGA4Data({
                propertyId, dateRanges,
                metrics: [{ name: 'totalUsers' }],
                dimensionFilter: applyClickFilter,
                limit: 10,
            }, accessToken),
            // 企業別チャート用: 日付×スカウトページの閲覧、日付×URLの応募クリック
            fetchGA4Data({
                propertyId, dateRanges,
                dimensions: [{ name: 'date' }, { name: 'pagePath' }],
                metrics: [{ name: 'totalUsers' }],
                dimensionFilter: { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: '/scout/' } } },
                limit: 10000,
            }, accessToken),
            fetchGA4Data({
                propertyId, dateRanges,
                dimensions: [{ name: 'date' }, { name: 'pageLocation' }],
                metrics: [{ name: 'totalUsers' }],
                dimensionFilter: applyClickFilter,
                limit: 10000,
            }, accessToken),
        ])

        const viewedDaily = new Map<string, number>()
        for (const row of viewDailyRes.rows ?? []) {
            const raw = row.dimensionValues?.[0]?.value ?? ''
            const d = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
            viewedDaily.set(d, parseInt(row.metricValues?.[0]?.value ?? '0', 10))
        }
        const viewedUsers = parseInt(viewTotalRes.rows?.[0]?.metricValues?.[0]?.value ?? '0', 10)

        let viewedScoutIds = 0
        for (const row of viewByScoutRes.rows ?? []) {
            const scoutId = scoutIdFromPagePath(row.dimensionValues?.[0]?.value ?? '')
            if (!scoutId) continue
            viewedScoutIds += 1
            const users = parseInt(row.metricValues?.[0]?.value ?? '0', 10)
            const meta = scoutMeta.get(scoutId)
            if (meta?.companyId) {
                companyOf(meta.companyId, meta.companyName).viewed += users
            }
        }

        const appliedDaily = new Map<string, number>()
        for (const row of applyDailyRes.rows ?? []) {
            const raw = row.dimensionValues?.[0]?.value ?? ''
            const d = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
            appliedDaily.set(d, parseInt(row.metricValues?.[0]?.value ?? '0', 10))
        }
        const appliedUsers = parseInt(applyTotalRes.rows?.[0]?.metricValues?.[0]?.value ?? '0', 10)

        for (const row of applyByUrlRes.rows ?? []) {
            const scoutId = extractScoutIdFromUrl(row.dimensionValues?.[0]?.value ?? '')
            if (!scoutId) continue
            const users = parseInt(row.metricValues?.[0]?.value ?? '0', 10)
            const meta = scoutMeta.get(scoutId)
            if (meta?.companyId) {
                companyOf(meta.companyId, meta.companyName).applied += users
            }
        }

        // ---- 企業別×日別の閲覧・応募（scoutId経由で企業に紐付け）----
        const ymd = (raw: string) => `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
        const addDaily = (map: Map<string, Map<string, number>>, companyId: string, d: string, n: number) => {
            let m = map.get(companyId)
            if (!m) {
                m = new Map()
                map.set(companyId, m)
            }
            m.set(d, (m.get(d) ?? 0) + n)
        }
        const companyViewedDaily = new Map<string, Map<string, number>>()
        for (const row of viewDailyByScoutRes.rows ?? []) {
            const scoutId = scoutIdFromPagePath(row.dimensionValues?.[1]?.value ?? '')
            if (!scoutId) continue
            const meta = scoutMeta.get(scoutId)
            if (!meta?.companyId) continue
            addDaily(companyViewedDaily, meta.companyId, ymd(row.dimensionValues?.[0]?.value ?? ''), parseInt(row.metricValues?.[0]?.value ?? '0', 10))
        }
        const companyAppliedDaily = new Map<string, Map<string, number>>()
        for (const row of applyDailyByUrlRes.rows ?? []) {
            const scoutId = extractScoutIdFromUrl(row.dimensionValues?.[1]?.value ?? '')
            if (!scoutId) continue
            const meta = scoutMeta.get(scoutId)
            if (!meta?.companyId) continue
            addDaily(companyAppliedDaily, meta.companyId, ymd(row.dimensionValues?.[0]?.value ?? ''), parseInt(row.metricValues?.[0]?.value ?? '0', 10))
        }

        // ---- 日次系列（対象期間の全日）----
        const daily: Array<{ date: string; requested: number; viewed: number; applied: number }> = []
        for (let t = new Date(`${startDate}T00:00:00Z`).getTime(); t <= new Date(`${endDate}T00:00:00Z`).getTime(); t += 86400000) {
            const d = new Date(t).toISOString().split('T')[0]
            daily.push({
                date: d,
                requested: requestedDaily.get(d) ?? 0,
                viewed: viewedDaily.get(d) ?? 0,
                applied: appliedDaily.get(d) ?? 0,
            })
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

        return NextResponse.json({
            success: true,
            startDate,
            endDate,
            summary: {
                requested: totalAttempts,
                sent: statusTotal.sent,
                failed: statusTotal.failed,
                skipped: statusTotal.skipped ?? 0,
                viewedUsers,
                viewedScoutIds,
                appliedUsers,
            },
            daily,
            companies,
            companyDaily,
            fetchedAt: new Date().toISOString(),
        })
    } catch (error) {
        console.error('Scout Funnel API Error:', error)
        return NextResponse.json(
            { error: 'スカウトファネルの集計に失敗しました', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
