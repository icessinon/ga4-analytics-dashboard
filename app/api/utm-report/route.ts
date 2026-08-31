import { NextResponse } from 'next/server'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { parseDateString } from '@/lib/utils/date'

/**
 * UTM別集計レポート:
 *  GA4 Data API で utm_source × utm_medium × utm_campaign 別に
 *  セッション・ユーザー・CV（応募 / LP応募 / 会員登録）を集計する汎用ビュー。
 *  各行の「意味・発行タイミング」注記はフロント側で lib/constants/utmCatalog.ts が付与。
 *
 * 注: GA4 は UTM をセッション開始時のみ読むため、サイト内リンクUTM（フッター等）は
 *  ここにはほぼ出ない（＝流入UTMのみが対象）。詳細は docs/utm-naming-convention.md。
 */

const CV_PAGES = [
    { key: 'applyCv', label: '応募CV', prefix: '/entry/thanks' },
    { key: 'lpApplyCv', label: 'LP応募CV', prefix: '/lp-thanks' },
    { key: 'signupCv', label: '会員登録CV', prefix: '/members/signup/thanks' },
] as const

interface GA4Row { dimensionValues: Array<{ value?: string }>; metricValues: Array<{ value?: string }> }

const num = (v?: string) => parseInt(v ?? '0', 10)
const key = (s: string, m: string, c: string) => `${s}${m}${c}`

export async function POST(request: Request) {
    try {
        const { propertyId, startDate = '30daysAgo', endDate = 'yesterday' } = await request.json()
        if (!propertyId) {
            return NextResponse.json({ error: 'propertyId が必要です' }, { status: 400 })
        }
        const accessToken = await getGA4AccessToken()
        const dateRanges = [{ startDate: parseDateString(startDate), endDate: parseDateString(endDate) }]
        const utmDims = [
            { name: 'sessionSource' },
            { name: 'sessionMedium' },
            { name: 'sessionCampaignName' },
        ]

        const [main, cvRows] = await Promise.all([
            // UTM別のセッション・ユーザー
            fetchGA4Data({
                propertyId, dateRanges,
                dimensions: utmDims,
                metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
                orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
                limit: 300,
            }, accessToken),
            // UTM×CVページ別の到達ユーザー（CVを3種に分解）
            fetchGA4Data({
                propertyId, dateRanges,
                dimensions: [...utmDims, { name: 'pagePath' }],
                metrics: [{ name: 'activeUsers' }],
                dimensionFilter: {
                    orGroup: {
                        expressions: CV_PAGES.map((p) => ({
                            filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: p.prefix } },
                        })),
                    },
                },
                limit: 2000,
            }, accessToken),
        ])

        // CVをUTMキー別に集計
        const cvByUtm = new Map<string, { applyCv: number; lpApplyCv: number; signupCv: number }>()
        for (const r of (cvRows.rows ?? []) as GA4Row[]) {
            const s = r.dimensionValues[0]?.value ?? '(not set)'
            const m = r.dimensionValues[1]?.value ?? '(not set)'
            const c = r.dimensionValues[2]?.value ?? '(not set)'
            const path = r.dimensionValues[3]?.value ?? ''
            const users = num(r.metricValues[0]?.value)
            const bucket = cvByUtm.get(key(s, m, c)) ?? { applyCv: 0, lpApplyCv: 0, signupCv: 0 }
            for (const p of CV_PAGES) {
                if (path.startsWith(p.prefix)) { bucket[p.key] += users; break }
            }
            cvByUtm.set(key(s, m, c), bucket)
        }

        const rows = ((main.rows ?? []) as GA4Row[]).map((r) => {
            const source = r.dimensionValues[0]?.value ?? '(not set)'
            const medium = r.dimensionValues[1]?.value ?? '(not set)'
            const campaign = r.dimensionValues[2]?.value ?? '(not set)'
            const cv = cvByUtm.get(key(source, medium, campaign)) ?? { applyCv: 0, lpApplyCv: 0, signupCv: 0 }
            return {
                source, medium, campaign,
                sessions: num(r.metricValues[0]?.value),
                users: num(r.metricValues[1]?.value),
                ...cv,
            }
        })

        return NextResponse.json({
            success: true,
            startDate: dateRanges[0].startDate,
            endDate: dateRanges[0].endDate,
            rows,
            fetchedAt: new Date().toISOString(),
        })
    } catch (error) {
        console.error('UTM Report API Error:', error)
        return NextResponse.json(
            { error: 'UTMレポートの集計に失敗しました', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
