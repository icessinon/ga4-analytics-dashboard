/**
 * スカウト送信先「求職者属性」スナップショット生成。
 * ダッシュボード /scout の属性ブレイクダウン用（persona/lineDeliverySnapshot と同方式の焼き込み）。
 * 出典結合:
 *   - 送信: DynamoDB ScoutHistories（scripts/_scout_dump.json に事前ダンプ）
 *   - 属性: Salesforce CustomObject1__c（scripts/_scout_attrs.json = candidateId→属性, MCP経由で取得, PIIなし）
 *   - 成果: GA4 (/scout/{scoutId} 閲覧, scoutId= 付き応募クリック)
 * 出力: lib/constants/scoutRecipientSnapshot.ts（集計値のみ・個人情報なし）
 * 実行: docker exec ga4-dashboard-app-local npx tsx scripts/build-scout-snapshot.ts
 */
import { readFileSync, writeFileSync } from 'fs'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { DDB_TABLES, scanAll } from '@/lib/aws/dynamoClient'

const DUMP = '/app/scripts/_scout_dump.json'
const ATTRS = '/app/scripts/_scout_attrs.json'
const OUT = '/app/lib/constants/scoutRecipientSnapshot.ts'
const PROPERTY = '534098180'
const WINDOW_START = '2026-06-01' // 送信は2026-06-09開始。閲覧/応募を取りこぼさないよう前寄せ
const n = (v?: string) => parseInt(v ?? '0', 10)

interface Attr { ageBand: string; age: number | null; pref: string; emp: string; timing: string; licenses: string[] }
type Counter = Map<string, number>
const inc = (m: Counter, k: string, by = 1) => m.set(k, (m.get(k) ?? 0) + by)
const topN = (m: Counter, k: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k)
const asArr = (m: Counter, k?: number) => (k ? topN(m, k) : [...m.entries()].sort((a, b) => b[1] - a[1]))

async function main() {
    const end = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10)
    const dump = JSON.parse(readFileSync(DUMP, 'utf8')) as {
        sends: Array<{ candidateId: string; companyId: string; companyName: string | null; jobId: string; attempts: Array<{ status?: string; scoutId?: string; requestedAt?: string }> }>
        scoutMap: Array<{ scoutId: string; candidateId: string; companyId: string; jobId: string }>
    }
    const attrs = JSON.parse(readFileSync(ATTRS, 'utf8')) as Record<string, Attr>

    // 企業名解決: ScoutHistories の SCOUT#（ScoutPageData）に companyName がある
    const companyNameById = new Map<string, string>()
    const shAll = await scanAll<{ pk?: string; companyId?: string; companyName?: string }>({ TableName: DDB_TABLES.scoutHistories, ProjectionExpression: 'pk, companyId, companyName' }, 200000)
    for (const it of shAll) {
        if (it.pk?.startsWith('SCOUT#') && it.companyId && it.companyName && !companyNameById.has(it.companyId)) companyNameById.set(it.companyId, it.companyName)
    }

    // ---- GA4: scoutId別 閲覧・応募 ----
    const token = await getGA4AccessToken()
    const dateRanges = [{ startDate: WINDOW_START, endDate: 'today' }]
    const applyClickFilter = {
        andGroup: {
            expressions: [
                { filter: { fieldName: 'customEvent:click_label', stringFilter: { matchType: 'BEGINS_WITH', value: 'EF__' } } },
                { filter: { fieldName: 'customEvent:click_label', stringFilter: { matchType: 'CONTAINS', value: '__Btn__' } } },
                { filter: { fieldName: 'pageLocation', stringFilter: { matchType: 'CONTAINS', value: 'scoutId=' } } },
            ],
        },
    }
    const [viewRes, applyRes] = await Promise.all([
        fetchGA4Data({ propertyId: PROPERTY, dateRanges, dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'totalUsers' }], dimensionFilter: { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: '/scout/' } } }, limit: 20000 }, token),
        fetchGA4Data({ propertyId: PROPERTY, dateRanges, dimensions: [{ name: 'pageLocation' }], metrics: [{ name: 'totalUsers' }], dimensionFilter: applyClickFilter, limit: 20000 }, token),
    ])
    const viewedScouts = new Set<string>()
    for (const r of (viewRes.rows ?? []) as Array<{ dimensionValues: { value?: string }[]; metricValues: { value?: string }[] }>) {
        const m = (r.dimensionValues[0]?.value ?? '').match(/^\/scout\/([0-9a-f-]{36})/i)
        if (m && n(r.metricValues[0]?.value) > 0) viewedScouts.add(m[1].toLowerCase())
    }
    const appliedScouts = new Set<string>()
    for (const r of (applyRes.rows ?? []) as Array<{ dimensionValues: { value?: string }[]; metricValues: { value?: string }[] }>) {
        const m = (r.dimensionValues[0]?.value ?? '').match(/[?&]scoutId=([0-9a-f-]{36})/i)
        if (m && n(r.metricValues[0]?.value) > 0) appliedScouts.add(m[1].toLowerCase())
    }

    // 送信ごとの成果（そのsendのいずれかのscoutIdが閲覧/応募されたか）
    const sendOutcome = (s: { attempts: Array<{ scoutId?: string }> }) => {
        let viewed = false, applied = false
        for (const a of s.attempts) {
            const sid = a.scoutId?.toLowerCase()
            if (!sid) continue
            if (viewedScouts.has(sid)) viewed = true
            if (appliedScouts.has(sid)) applied = true
        }
        return { viewed, applied }
    }

    // ---- 集計 ----
    const sends = dump.sends
    let matched = 0
    const overall = { ageBand: new Map(), pref: new Map(), emp: new Map(), timing: new Map(), lic: new Map() } as Record<string, Counter>
    const ages: number[] = []
    // 属性別ファネル: key -> {sends,viewed,applied}
    type F = { sends: number; viewed: number; applied: number }
    const mkF = () => new Map<string, F>()
    const bump = (m: Map<string, F>, k: string, o: { viewed: boolean; applied: boolean }) => { const r = m.get(k) ?? { sends: 0, viewed: 0, applied: 0 }; r.sends++; if (o.viewed) r.viewed++; if (o.applied) r.applied++; m.set(k, r) }
    const funnel = { ageBand: mkF(), pref: mkF(), emp: mkF(), timing: mkF(), license: mkF() } as Record<string, Map<string, F>>
    // 企業別・求人別
    const byCompany = new Map<string, { name: string | null; sends: number; viewed: number; applied: number; matched: number; ageBand: Counter; pref: Counter; lic: Counter; timing: Counter; emp: Counter; cand: Set<string>; job: Set<string>; days: Set<string>; sent: number; reqAttempts: number; firstAt: string; lastAt: string }>()
    const byJob = new Map<string, { sends: number; viewed: number; applied: number; ageBand: Counter; pref: Counter; lic: Counter; companyId: string }>()

    for (const s of sends) {
        const a = attrs[s.candidateId]
        const o = sendOutcome(s)
        // 企業集計（属性不明でも送信数はカウント）
        const c = byCompany.get(s.companyId) ?? { name: s.companyName, sends: 0, viewed: 0, applied: 0, matched: 0, ageBand: new Map(), pref: new Map(), lic: new Map(), timing: new Map(), emp: new Map(), cand: new Set<string>(), job: new Set<string>(), days: new Set<string>(), sent: 0, reqAttempts: 0, firstAt: '', lastAt: '' }
        c.sends++; if (o.viewed) c.viewed++; if (o.applied) c.applied++; if (!c.name && s.companyName) c.name = s.companyName
        c.cand.add(s.candidateId); c.job.add(s.jobId)
        for (const a of s.attempts) {
            c.reqAttempts++
            if (a.status === 'sent') c.sent++
            const ra = a.requestedAt
            if (ra) { c.days.add(ra.slice(0, 10)); if (!c.firstAt || ra < c.firstAt) c.firstAt = ra; if (ra > c.lastAt) c.lastAt = ra }
        }
        const j = byJob.get(s.jobId) ?? { sends: 0, viewed: 0, applied: 0, ageBand: new Map(), pref: new Map(), lic: new Map(), companyId: s.companyId }
        j.sends++; if (o.viewed) j.viewed++; if (o.applied) j.applied++
        if (a) {
            matched++
            inc(overall.ageBand, a.ageBand); inc(overall.pref, a.pref); inc(overall.emp, a.emp); inc(overall.timing, a.timing)
            for (const l of a.licenses) inc(overall.lic, l)
            if (typeof a.age === 'number') ages.push(a.age)
            bump(funnel.ageBand, a.ageBand, o); bump(funnel.pref, a.pref, o); bump(funnel.emp, a.emp, o); bump(funnel.timing, a.timing, o)
            const hasBig = a.licenses.some((l) => l.includes('大型'))
            bump(funnel.license, hasBig ? '大型免許あり' : '大型免許なし', o)
            c.matched++; inc(c.ageBand, a.ageBand); inc(c.pref, a.pref); inc(c.timing, a.timing); inc(c.emp, a.emp); for (const l of a.licenses) inc(c.lic, l)
            inc(j.ageBand, a.ageBand); inc(j.pref, a.pref); for (const l of a.licenses) inc(j.lic, l)
        }
        byCompany.set(s.companyId, c); byJob.set(s.jobId, j)
    }

    // ---- 利用状況（全体）----
    const distinctCandidates = new Set(sends.map((s) => s.candidateId)).size
    const allDays = new Set<string>()
    let firstAt = '', lastAt = ''
    for (const s of sends) for (const a of s.attempts) { const ra = a.requestedAt; if (ra) { allDays.add(ra.slice(0, 10)); if (!firstAt || ra < firstAt) firstAt = ra; if (ra > lastAt) lastAt = ra } }
    const compSendsSorted = [...byCompany.values()].map((c) => c.sends).sort((a, b) => a - b)
    const medianSendsPerCompany = compSendsSorted.length ? compSendsSorted[Math.floor(compSendsSorted.length / 2)] : 0
    const top2Sends = [...byCompany.values()].sort((a, b) => b.sends - a.sends).slice(0, 2).reduce((s, c) => s + c.sends, 0)
    const viewedSendsTotal = sends.filter((s) => sendOutcome(s).viewed).length
    const overallViewRate = +(viewedSendsTotal / sends.length * 100).toFixed(1)

    const ages2 = ages.slice().sort((x, y) => x - y)
    const fArr = (m: Map<string, F>, k = 8) => [...m.entries()].sort((a, b) => b[1].sends - a[1].sends).slice(0, k)
        .map(([key, v]) => ({ key, sends: v.sends, viewed: v.viewed, applied: v.applied, viewRate: +(v.viewed / v.sends * 100).toFixed(1), applyRate: +(v.applied / v.sends * 100).toFixed(1) }))

    const snapshot = {
        asof: end,
        windowStart: '2026-06-09',
        windowEnd: end,
        note: '送信=DDB ScoutHistories / 属性=Salesforce CustomObject1__c(candidateId結合) / 閲覧・応募=GA4(scoutId)。集計値のみ・個人情報なし。属性は送信時点でSFに存在した候補者のみ結合。',
        totals: { sends: sends.length, matchedAttrs: matched, companies: byCompany.size, jobs: byJob.size, viewedSends: viewedSendsTotal, appliedSends: sends.filter((s) => sendOutcome(s).applied).length },
        usageOverall: {
            sends: sends.length, companies: byCompany.size, candidates: distinctCandidates, jobs: byJob.size,
            viewRate: overallViewRate,
            sendsPerCandidate: +(sends.length / distinctCandidates).toFixed(2),
            medianSendsPerCompany, top2Share: +(top2Sends / sends.length * 100).toFixed(1),
            activeDays: allDays.size, firstAt: firstAt.slice(0, 10), lastAt: lastAt.slice(0, 10),
        },
        overall: {
            ageBand: asArr(overall.ageBand), employment: asArr(overall.emp), timing: asArr(overall.timing),
            prefecture: asArr(overall.pref, 12), licenses: asArr(overall.lic, 15),
            ageStats: ages2.length ? { mean: +(ages2.reduce((a, b) => a + b, 0) / ages2.length).toFixed(1), median: ages2[Math.floor(ages2.length / 2)], n: ages2.length } : null,
        },
        byCompany: [...byCompany.entries()].sort((a, b) => b[1].sends - a[1].sends).slice(0, 12).map(([companyId, c]) => ({
            companyId, companyName: c.name ?? companyNameById.get(companyId) ?? null, sends: c.sends, viewed: c.viewed, applied: c.applied, matched: c.matched,
            usage: {
                sharePct: +(c.sends / sends.length * 100).toFixed(1),
                candidates: c.cand.size, sendsPerCandidate: +(c.sends / Math.max(1, c.cand.size)).toFixed(2),
                jobs: c.job.size, sendsPerJob: +(c.sends / Math.max(1, c.job.size)).toFixed(1),
                activeDays: c.days.size, sendsPerActiveDay: +(c.sends / Math.max(1, c.days.size)).toFixed(1),
                firstAt: c.firstAt.slice(0, 10), lastAt: c.lastAt.slice(0, 10),
                viewRate: +(c.viewed / c.sends * 100).toFixed(1),
                sentRate: c.reqAttempts ? +(c.sent / c.reqAttempts * 100).toFixed(1) : 0,
            },
            ageBand: asArr(c.ageBand), prefecture: asArr(c.pref, 8), employment: asArr(c.emp), timing: asArr(c.timing), licenses: asArr(c.lic, 10),
        })),
        byJob: [...byJob.entries()].sort((a, b) => b[1].sends - a[1].sends).slice(0, 8).map(([jobId, j]) => ({
            jobId, companyId: j.companyId, sends: j.sends, viewed: j.viewed, applied: j.applied,
            ageBand: asArr(j.ageBand, 3), prefecture: asArr(j.pref, 3), licenses: asArr(j.lic, 4),
        })),
        funnelByAttr: {
            ageBand: fArr(funnel.ageBand), prefecture: fArr(funnel.pref, 10), employment: fArr(funnel.emp), timing: fArr(funnel.timing), license: fArr(funnel.license),
        },
    }

    const header = `/**\n * スカウト送信先 求職者属性スナップショット（自動生成: scripts/build-scout-snapshot.ts）。\n * ダッシュボード /scout の属性ブレイクダウン用。集計値のみ・個人情報なし。\n * 送信=DDB / 属性=Salesforce CustomObject1__c / 閲覧・応募=GA4。更新はスクリプト再実行。\n */\n`
    writeFileSync(OUT, `${header}export const SCOUT_RECIPIENT_SNAPSHOT_ASOF = '${end}'\n\nexport const SCOUT_RECIPIENT_SNAPSHOT = ${JSON.stringify(snapshot, null, 2)} as const\n`)
    console.log(`書き出し: ${OUT}`)
    console.log(`sends=${snapshot.totals.sends} matchedAttrs=${matched} (${(matched / sends.length * 100).toFixed(0)}%) companies=${byCompany.size} jobs=${byJob.size}`)
    console.log(`viewedSends=${snapshot.totals.viewedSends} appliedSends=${snapshot.totals.appliedSends} / viewedScoutIds=${viewedScouts.size} appliedScoutIds=${appliedScouts.size}`)
    console.log('overall.ageBand=', JSON.stringify(snapshot.overall.ageBand))
    console.log('funnel.license=', JSON.stringify(snapshot.funnelByAttr.license))
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
