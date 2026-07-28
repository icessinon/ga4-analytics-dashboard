import { NextResponse } from 'next/server'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'

/**
 * 求人種別CV分析。
 * drm-front の GTM ラベル規則（contractType 別の JobR/JobA/JobH セクション）を利用して
 * 「応募CV」を人材紹介 / 求人広告 / ハローワークに分解し、会員登録と並べて返す。
 * 注: ビューラベルは「50%表示×1秒」条件のため page_view ベースの CV より少なく出る（構成比・比較用）。
 */

const JOB_TYPES = [
    { key: 'JobR', label: '人材紹介' },
    { key: 'JobA', label: '求人広告' },
    { key: 'JobH', label: 'ハローワーク' },
] as const

// 完了 = 応募フォームの送信ボタンクリック（クリック基準）。
// 送信ボタンは入力完了までdisabledのため「クリック=応募実行」であり、
// DynamoDBの実応募数と一致することを確認済み（2026-07-22、求人広告54件で完全一致）。
// 視認条件がなくbotの影響も受けない。
const completeClickLabel = (key: string) => `EF__${key}__Btn__${key === 'JobA' ? '応募する' : '話を聞いてみる'}`
const formLabel = (key: string) => `EF__${key}__Area__Header`
const detailLabel = (key: string) => `DL__Media__Area__${key}`

// 一覧ページ（検索・大職種一覧）。一覧経由の詳細到達を pageReferrer で近似判定する
const LIST_PATHS = [
    'search', 'driver', 'sekokan', 'sekkei', 'soko', 'shokunin', 'seibi', 'hoshu',
    'setsubi-sagyo', 'keibi', 'unkan', 'kojo-sagyo', 'food', 'unyu-sagyo', 'others',
]
// チャネルの表示グルーピング（GA4 sessionDefaultChannelGroup → 表示用キー）
function channelKey(group: string): 'organic' | 'direct' | 'crm' | 'paid' | 'other' {
    if (group === 'Organic Search') return 'organic'
    if (group === 'Direct') return 'direct'
    if (group === 'SMS' || group === 'Email' || group === 'Mobile Push Notifications') return 'crm'
    if (group.startsWith('Paid')) return 'paid'
    return 'other'
}

export async function POST(request: Request) {
    try {
        const {
            propertyId,
            startDate = '30daysAgo',
            endDate = 'yesterday',
            accessToken: customToken,
        } = await request.json()

        if (!propertyId) {
            return NextResponse.json({ error: 'propertyId が必要です' }, { status: 400 })
        }

        const accessToken = await getGA4AccessToken(customToken)
        const dateRanges = [{ startDate, endDate }]

        const viewLabels = JOB_TYPES.flatMap((t) => [formLabel(t.key), detailLabel(t.key)])
        const viewLabelFilter = {
            orGroup: {
                expressions: viewLabels.map((v) => ({
                    filter: { fieldName: 'customEvent:view_label', stringFilter: { matchType: 'EXACT', value: v } },
                })),
            },
        }
        const clickLabelFilter = {
            orGroup: {
                expressions: JOB_TYPES.map((t) => ({
                    filter: { fieldName: 'customEvent:click_label', stringFilter: { matchType: 'EXACT', value: completeClickLabel(t.key) } },
                })),
            },
        }

        const detailLabelFilter = {
            orGroup: {
                expressions: JOB_TYPES.map((t) => ({
                    filter: { fieldName: 'customEvent:view_label', stringFilter: { matchType: 'EXACT', value: detailLabel(t.key) } },
                })),
            },
        }
        const listReferrerFilter = {
            orGroup: {
                expressions: LIST_PATHS.map((p) => ({
                    filter: { fieldName: 'pageReferrer', stringFilter: { matchType: 'CONTAINS', value: `x-work.jp/${p}` } },
                })),
            },
        }

        const [labelReport, clickReport, clickDaily, signupForm, signupThanks, signupDaily, channelReport, viaListReport, listPagesReport] = await Promise.all([
            // 種別×ステージ（詳細・フォーム）のユーザー数（ビューラベル別）
            fetchGA4Data({
                propertyId, dateRanges,
                dimensions: [{ name: 'customEvent:view_label' }],
                metrics: [{ name: 'totalUsers' }],
                dimensionFilter: viewLabelFilter,
                limit: 50,
            }, accessToken),
            // 完了（送信ボタンクリック）のユーザー数
            fetchGA4Data({
                propertyId, dateRanges,
                dimensions: [{ name: 'customEvent:click_label' }],
                metrics: [{ name: 'totalUsers' }],
                dimensionFilter: clickLabelFilter,
                limit: 50,
            }, accessToken),
            // 完了クリックの日別推移
            fetchGA4Data({
                propertyId, dateRanges,
                dimensions: [{ name: 'date' }, { name: 'customEvent:click_label' }],
                metrics: [{ name: 'totalUsers' }],
                dimensionFilter: clickLabelFilter,
                limit: 1000,
            }, accessToken),
            // 会員登録: フォーム到達
            fetchGA4Data({
                propertyId, dateRanges,
                dimensions: [],
                metrics: [{ name: 'totalUsers' }],
                dimensionFilter: {
                    filter: { fieldName: 'pagePath', stringFilter: { matchType: 'EXACT', value: '/members/signup' } },
                },
                limit: 1,
            }, accessToken),
            // 会員登録: 完了
            fetchGA4Data({
                propertyId, dateRanges,
                dimensions: [],
                metrics: [{ name: 'totalUsers' }],
                dimensionFilter: {
                    filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: '/members/signup/thanks' } },
                },
                limit: 1,
            }, accessToken),
            // 会員登録: 完了の日別推移
            fetchGA4Data({
                propertyId, dateRanges,
                dimensions: [{ name: 'date' }],
                metrics: [{ name: 'totalUsers' }],
                dimensionFilter: {
                    filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: '/members/signup/thanks' } },
                },
                limit: 200,
            }, accessToken),
            // 詳細閲覧の流入チャネル内訳（種別×チャネル）
            fetchGA4Data({
                propertyId, dateRanges,
                dimensions: [{ name: 'customEvent:view_label' }, { name: 'sessionDefaultChannelGroup' }],
                metrics: [{ name: 'totalUsers' }],
                dimensionFilter: detailLabelFilter,
                limit: 200,
            }, accessToken),
            // 一覧（検索・職種一覧）経由で詳細に到達したユーザー（referrer近似）
            fetchGA4Data({
                propertyId, dateRanges,
                dimensions: [{ name: 'customEvent:view_label' }],
                metrics: [{ name: 'totalUsers' }],
                dimensionFilter: { andGroup: { expressions: [detailLabelFilter, listReferrerFilter] } },
                limit: 50,
            }, accessToken),
            // 一覧（検索・職種一覧）ページ自体の閲覧UU（詳細/media_を除く）
            fetchGA4Data({
                propertyId, dateRanges,
                metrics: [{ name: 'totalUsers' }],
                dimensionFilter: {
                    andGroup: {
                        expressions: [
                            {
                                orGroup: {
                                    expressions: LIST_PATHS.map((p) => ({
                                        filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: `/${p}` } },
                                    })),
                                },
                            },
                            { notExpression: { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'CONTAINS', value: '/media_' } } } },
                        ],
                    },
                },
                limit: 1,
            }, accessToken),
        ])

        const labelUsers = new Map<string, number>()
        for (const r of labelReport.rows ?? []) {
            labelUsers.set(r.dimensionValues[0]?.value ?? '', parseInt(r.metricValues[0]?.value ?? '0', 10))
        }
        for (const r of clickReport.rows ?? []) {
            labelUsers.set(r.dimensionValues[0]?.value ?? '', parseInt(r.metricValues[0]?.value ?? '0', 10))
        }

        // 種別×チャネル（organic/direct/crm/paid/other）
        const channelByType = new Map<string, Record<string, number>>()
        for (const r of channelReport.rows ?? []) {
            const label = r.dimensionValues[0]?.value ?? ''
            const group = r.dimensionValues[1]?.value ?? ''
            const users = parseInt(r.metricValues[0]?.value ?? '0', 10)
            const type = JOB_TYPES.find((t) => label === detailLabel(t.key))
            if (!type) continue
            const entry = channelByType.get(type.key) ?? {}
            const k = channelKey(group)
            entry[k] = (entry[k] ?? 0) + users
            channelByType.set(type.key, entry)
        }
        const viaListByType = new Map<string, number>()
        for (const r of viaListReport.rows ?? []) {
            const label = r.dimensionValues[0]?.value ?? ''
            const type = JOB_TYPES.find((t) => label === detailLabel(t.key))
            if (type) viaListByType.set(type.key, parseInt(r.metricValues[0]?.value ?? '0', 10))
        }

        const jobTypes = JOB_TYPES.map((t) => {
            const detail = labelUsers.get(detailLabel(t.key)) ?? 0
            const form = labelUsers.get(formLabel(t.key)) ?? 0
            const completed = labelUsers.get(completeClickLabel(t.key)) ?? 0
            const ch = channelByType.get(t.key) ?? {}
            const viaList = viaListByType.get(t.key) ?? 0
            return {
                key: t.key,
                label: t.label,
                detailViews: detail,
                formViews: form,
                completed,
                detailToForm: detail > 0 ? form / detail : null,
                formToComplete: form > 0 ? completed / form : null,
                overallRate: detail > 0 ? completed / detail : null,
                channels: {
                    organic: ch.organic ?? 0,
                    direct: ch.direct ?? 0,
                    crm: ch.crm ?? 0,
                    paid: ch.paid ?? 0,
                    other: ch.other ?? 0,
                },
                viaList,
                viaListRate: detail > 0 ? viaList / detail : null,
            }
        })

        // 日別推移（種別ごと・完了クリック）
        const dailyMap = new Map<string, Record<string, number>>()
        for (const r of clickDaily.rows ?? []) {
            const date = r.dimensionValues[0]?.value ?? ''
            const label = r.dimensionValues[1]?.value ?? ''
            const users = parseInt(r.metricValues[0]?.value ?? '0', 10)
            const type = JOB_TYPES.find((t) => label === completeClickLabel(t.key))
            if (!type || !date) continue
            if (!dailyMap.has(date)) dailyMap.set(date, {})
            const entry = dailyMap.get(date) as Record<string, number>
            entry[type.key] = (entry[type.key] ?? 0) + users
        }
        for (const r of signupDaily.rows ?? []) {
            const date = r.dimensionValues[0]?.value ?? ''
            if (!date) continue
            if (!dailyMap.has(date)) dailyMap.set(date, {})
            const entry = dailyMap.get(date) as Record<string, number>
            entry.signup = parseInt(r.metricValues[0]?.value ?? '0', 10)
        }
        const daily = [...dailyMap.entries()]
            .map(([date, values]) => ({ date, ...values }))
            .sort((a, b) => a.date.localeCompare(b.date))

        const signupFormUsers = parseInt(signupForm.rows?.[0]?.metricValues[0]?.value ?? '0', 10)
        const signupCompleted = parseInt(signupThanks.rows?.[0]?.metricValues[0]?.value ?? '0', 10)

        const listViews = parseInt(listPagesReport.rows?.[0]?.metricValues[0]?.value ?? '0', 10)

        return NextResponse.json({
            jobTypes,
            listViews,
            signup: {
                formViews: signupFormUsers,
                completed: signupCompleted,
                formToComplete: signupFormUsers > 0 ? signupCompleted / signupFormUsers : null,
            },
            daily,
            startDate,
            endDate,
        })
    } catch (error) {
        console.error('CV Types API Error:', error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch cv types' },
            { status: 500 }
        )
    }
}
