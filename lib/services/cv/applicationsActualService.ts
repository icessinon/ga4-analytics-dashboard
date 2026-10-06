import type { ScanCommandInput } from '@aws-sdk/lib-dynamodb'
import { BatchGetCommand } from '@aws-sdk/lib-dynamodb'
import { beginsWith } from '@/lib/api/ga4/filters'
import type { Ga4Reporter } from '@/lib/api/ga4/report'
import { firstMetricInt } from '@/lib/api/ga4/rows'
import { DDB_TABLES, getDdbDocClient, scanAll } from '@/lib/aws/dynamoClient'
import type { ApplicationCell, ApplicationLayer, ApplicationsActualReport } from './applicationsActualTypes'

/**
 * 応募の全体像（DB実数）。
 * GA4のサイト内フォーム計測では見えないfeatured/CRM配信経由・CA紹介・ゲスト応募を含む、
 * 本体DynamoDBベースの実応募数を種別×流入レイヤー×会員/ゲストで返す。
 * あわせて会員登録の内訳（応募と同時の登録 vs 登録のみ）を判定する。
 * 同時登録 = 会員応募の応募時刻とユーザー作成時刻の差が10分以内（実測で二峰性を確認済み）。
 */

const JOB_TYPE_LABELS: Record<string, string> = {
    人材紹介: '人材紹介',
    求人広告: '求人広告',
    ハローワーク: 'ハローワーク',
}

function layerOf(source: string | undefined | null): ApplicationLayer {
    if (!source) return 'natural'
    if (source.startsWith('featured')) return 'featured'
    if (source.startsWith('scout')) return 'scout'
    if (source === 'ca_referral') return 'caReferral'
    return 'other'
}

interface MemberApp {
    createdAt?: string
    userId?: string
    source?: string
    jobDescription?: { contractType?: string }
}

interface GuestApp {
    createdAt?: string
    articleId?: string
    source?: string
}

const SIMUL_THRESHOLD_MS = 10 * 60 * 1000

// JSTの日付(YYYY-MM-DD)をUTC ISOに（その日のJST 0時）
function jstDateToIso(date: string): string {
    return new Date(`${date}T00:00:00+09:00`).toISOString()
}

/**
 * @param reporter 単独登録（GA4 thanks 到達）の取得に使う。null なら standalone は null
 * @param start / end 'YYYY-MM-DD'
 */
export async function runApplicationsActualReport(reporter: Ga4Reporter | null, start: string, end: string): Promise<ApplicationsActualReport> {
    const sinceIso = jstDateToIso(start)
    // endの翌日JST0時を上限に
    const untilIso = new Date(new Date(`${end}T00:00:00+09:00`).getTime() + 86400000).toISOString()

    const client = getDdbDocClient()

    // ---- 会員応募 ----
    const memberScan: ScanCommandInput = {
        TableName: DDB_TABLES.jobApplications,
        FilterExpression: 'createdAt >= :s AND createdAt < :u',
        ExpressionAttributeValues: { ':s': sinceIso, ':u': untilIso },
        ProjectionExpression: 'createdAt, userId, #src, jobDescription.contractType',
        ExpressionAttributeNames: { '#src': 'source' },
    }
    // ---- ゲスト応募 ----
    const guestScan: ScanCommandInput = {
        TableName: DDB_TABLES.guestJobApplications,
        FilterExpression: 'createdAt >= :s AND createdAt < :u',
        ExpressionAttributeValues: { ':s': sinceIso, ':u': untilIso },
        ProjectionExpression: 'createdAt, articleId, #src',
        ExpressionAttributeNames: { '#src': 'source' },
    }
    const [memberApps, guestApps] = await Promise.all([scanAll<MemberApp>(memberScan), scanAll<GuestApp>(guestScan)])

    // ゲスト応募の contractType を JobDescriptions から突合
    const articleIds = [...new Set(guestApps.map((g) => g.articleId).filter(Boolean))] as string[]
    const typeOfArticle = new Map<string, string>()
    for (let i = 0; i < articleIds.length; i += 100) {
        const keys = articleIds.slice(i, i + 100).map((pk) => ({ pk, sk: 'info' }))
        const res = await client.send(new BatchGetCommand({
            RequestItems: { [DDB_TABLES.jobDescriptions]: { Keys: keys, ProjectionExpression: 'pk, contractType' } },
        }))
        for (const item of res.Responses?.[DDB_TABLES.jobDescriptions] ?? []) {
            typeOfArticle.set(item.pk as string, item.contractType as string)
        }
    }

    // 会員応募ユーザーの登録時刻（同時登録判定用）
    const userIds = [...new Set(memberApps.map((a) => a.userId).filter(Boolean))] as string[]
    const userCreatedAt = new Map<string, string>()
    for (let i = 0; i < userIds.length; i += 100) {
        const keys = userIds.slice(i, i + 100).map((id) => ({ pk: `USER#${id}`, sk: `USER#${id}` }))
        const res = await client.send(new BatchGetCommand({
            RequestItems: { [DDB_TABLES.memberUsers]: { Keys: keys, ProjectionExpression: 'pk, createdAt' } },
        }))
        for (const item of res.Responses?.[DDB_TABLES.memberUsers] ?? []) {
            userCreatedAt.set(String(item.pk).replace('USER#', ''), item.createdAt as string)
        }
    }

    // ---- 集計: 種別×レイヤー×会員/ゲスト ----
    const emptyLayers = (): Record<ApplicationLayer, ApplicationCell> => ({
        natural: { member: 0, guest: 0 },
        featured: { member: 0, guest: 0 },
        scout: { member: 0, guest: 0 },
        caReferral: { member: 0, guest: 0 },
        other: { member: 0, guest: 0 },
    })
    const byType = new Map<string, Record<ApplicationLayer, ApplicationCell>>()
    const typeOf = (ct: string | undefined) => JOB_TYPE_LABELS[ct ?? ''] ?? 'その他/不明'

    for (const a of memberApps) {
        const t = typeOf(a.jobDescription?.contractType)
        if (!byType.has(t)) byType.set(t, emptyLayers())
        byType.get(t)![layerOf(a.source)].member += 1
    }
    for (const g of guestApps) {
        const t = typeOf(typeOfArticle.get(g.articleId ?? ''))
        if (!byType.has(t)) byType.set(t, emptyLayers())
        byType.get(t)![layerOf(g.source)].guest += 1
    }

    // ---- 会員登録の内訳: 応募と同時の登録（種別つき） ----
    // 同一ユーザーは最初の応募で1回だけ数える
    const simulUsers = new Map<string, string>() // userId -> 種別
    let unknownUserApps = 0
    for (const a of memberApps) {
        if (!a.userId || !a.createdAt) { unknownUserApps++; continue }
        const uc = userCreatedAt.get(a.userId)
        if (!uc) { unknownUserApps++; continue }
        const diff = Math.abs(new Date(a.createdAt).getTime() - new Date(uc).getTime())
        if (diff < SIMUL_THRESHOLD_MS && !simulUsers.has(a.userId)) {
            simulUsers.set(a.userId, typeOf(a.jobDescription?.contractType))
        }
    }
    const simulByType: Record<string, number> = {}
    for (const [, t] of simulUsers) simulByType[t] = (simulByType[t] ?? 0) + 1

    // 単独登録（登録のみ）: GA4のsignup thanks到達UU（同時登録ユーザーはthanksを経由しない）
    let standaloneSignup: number | null = null
    if (reporter) {
        try {
            const res = await reporter.run({ metrics: ['totalUsers'], dimensionFilter: beginsWith('pagePath', '/members/signup/thanks'), limit: 1 })
            standaloneSignup = firstMetricInt(res)
        } catch (e) {
            console.error('signup thanks query failed:', e)
        }
    }

    const order = ['人材紹介', '求人広告', 'ハローワーク', 'その他/不明']
    const types = [...byType.entries()]
        .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
        .map(([label, layers]) => {
            const total = (Object.values(layers) as ApplicationCell[]).reduce((s, c) => s + c.member + c.guest, 0)
            return { label, layers, total }
        })

    return {
        types,
        grandTotal: types.reduce((s, t) => s + t.total, 0),
        memberTotal: memberApps.length,
        guestTotal: guestApps.length,
        signup: {
            withApplication: simulUsers.size,
            withApplicationByType: simulByType,
            standalone: standaloneSignup,
            unknownUserApps,
        },
    }
}
