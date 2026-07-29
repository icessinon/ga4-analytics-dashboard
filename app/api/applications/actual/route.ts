import { NextResponse } from 'next/server'
import { ScanCommandInput } from '@aws-sdk/lib-dynamodb'
import { BatchGetCommand } from '@aws-sdk/lib-dynamodb'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { DDB_TABLES, getDdbDocClient, scanAll } from '@/lib/aws/dynamoClient'
import { parseDateString } from '@/lib/utils/date'

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

type Layer = 'natural' | 'featured' | 'scout' | 'caReferral' | 'other'

function layerOf(source: string | undefined | null): Layer {
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

export async function POST(request: Request) {
    try {
        const {
            propertyId,
            startDate = '30daysAgo',
            endDate = 'yesterday',
        } = await request.json()

        const start = parseDateString(startDate)
        const end = parseDateString(endDate)
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
        const [memberApps, guestApps] = await Promise.all([
            scanAll<MemberApp>(memberScan),
            scanAll<GuestApp>(guestScan),
        ])

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
        type Cell = { member: number; guest: number }
        const emptyLayers = (): Record<Layer, Cell> => ({
            natural: { member: 0, guest: 0 },
            featured: { member: 0, guest: 0 },
            scout: { member: 0, guest: 0 },
            caReferral: { member: 0, guest: 0 },
            other: { member: 0, guest: 0 },
        })
        const byType = new Map<string, Record<Layer, Cell>>()
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
        if (propertyId) {
            try {
                const accessToken = await getGA4AccessToken()
                const res = await fetchGA4Data({
                    propertyId,
                    dateRanges: [{ startDate: start, endDate: end }],
                    metrics: [{ name: 'totalUsers' }],
                    dimensionFilter: {
                        filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: '/members/signup/thanks' } },
                    },
                    limit: 1,
                }, accessToken)
                standaloneSignup = parseInt(res.rows?.[0]?.metricValues[0]?.value ?? '0', 10)
            } catch (e) {
                console.error('signup thanks query failed:', e)
            }
        }

        const order = ['人材紹介', '求人広告', 'ハローワーク', 'その他/不明']
        const types = [...byType.entries()]
            .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
            .map(([label, layers]) => {
                const sum = (c: Cell) => c.member + c.guest
                const total = (Object.values(layers) as Cell[]).reduce((s, c) => s + sum(c), 0)
                return { label, layers, total }
            })
        const grandTotal = types.reduce((s, t) => s + t.total, 0)

        return NextResponse.json({
            success: true,
            startDate: start,
            endDate: end,
            types,
            grandTotal,
            memberTotal: memberApps.length,
            guestTotal: guestApps.length,
            signup: {
                withApplication: simulUsers.size,
                withApplicationByType: simulByType,
                standalone: standaloneSignup,
                unknownUserApps,
            },
            fetchedAt: new Date().toISOString(),
        })
    } catch (error) {
        console.error('Applications Actual API Error:', error)
        return NextResponse.json(
            { error: '応募実数の集計に失敗しました', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
