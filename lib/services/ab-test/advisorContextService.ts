import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { CV_UNIT_VALUE_YEN, CV_UNIT_VALUE_ASOF } from '@/lib/constants/cvUnitValue'

/**
 * 施策壁打ちAIに渡す「事業の実測データパック」。
 * 過去ABテスト実績だけでは金額換算・規模感・検出力の議論ができないため、
 * CV単価係数（静的）と直近30日のGA4実測（ファネル・チャネル・主要面の規模）を
 * プロンプトに注入できるテキストとして組み立てる。GA4が落ちていても壁打ち自体は
 * 成立するよう、実測部分はfail-softにする。
 */

const JOB_TYPES = [
    { key: 'JobR', label: '人材紹介', btn: '話を聞いてみる' },
    { key: 'JobA', label: '求人広告', btn: '応募する' },
    { key: 'JobH', label: 'ハローワーク', btn: '話を聞いてみる' },
] as const

const LIST_PATHS = [
    'search', 'driver', 'sekokan', 'sekkei', 'soko', 'shokunin', 'seibi', 'hoshu',
    'setsubi-sagyo', 'keibi', 'unkan', 'kojo-sagyo', 'food', 'unyu-sagyo', 'others',
]

interface GA4Row { dimensionValues: Array<{ value?: string }>; metricValues: Array<{ value?: string }> }

function unitPriceSection(): string {
    return [
        `【CV単価（1件あたり期待売上・${CV_UNIT_VALUE_ASOF}にSalesforce実測から算出）】`,
        `- 会員登録（応募を伴わない単独登録）: ¥${CV_UNIT_VALUE_YEN.signup.toLocaleString()}`,
        `- 人材紹介 応募: ¥${CV_UNIT_VALUE_YEN.JobR.toLocaleString()}`,
        `- 求人広告 応募: ¥${CV_UNIT_VALUE_YEN.JobA.toLocaleString()}（紹介パスアップ成約分のみ）`,
        `- ハローワーク 応募: ¥${CV_UNIT_VALUE_YEN.JobH.toLocaleString()}`,
        `※期待値（平均）。施策比較は「増やせるCV件数 × 単価」で金額換算する`,
    ].join('\n')
}

async function ga4Section(propertyId: string): Promise<string> {
    const accessToken = await getGA4AccessToken()
    const dateRanges = [{ startDate: '30daysAgo', endDate: 'yesterday' }]

    const viewLabels = JOB_TYPES.flatMap((t) => [`DL__Media__Area__${t.key}`, `EF__${t.key}__Area__Header`])
    const clickLabels = JOB_TYPES.map((t) => `EF__${t.key}__Btn__${t.btn}`)

    const [viewReport, clickReport, signupReport, listReport, channelReport] = await Promise.all([
        fetchGA4Data({
            propertyId, dateRanges,
            dimensions: [{ name: 'customEvent:view_label' }],
            metrics: [{ name: 'totalUsers' }],
            dimensionFilter: { filter: { fieldName: 'customEvent:view_label', inListFilter: { values: viewLabels } } },
            limit: 20,
        }, accessToken),
        fetchGA4Data({
            propertyId, dateRanges,
            dimensions: [{ name: 'customEvent:click_label' }],
            metrics: [{ name: 'totalUsers' }],
            dimensionFilter: {
                andGroup: {
                    expressions: [
                        { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'data_click_label' } } },
                        { filter: { fieldName: 'customEvent:click_label', inListFilter: { values: clickLabels } } },
                    ],
                },
            },
            limit: 20,
        }, accessToken),
        fetchGA4Data({
            propertyId, dateRanges,
            dimensions: [{ name: 'pagePath' }],
            metrics: [{ name: 'totalUsers' }],
            dimensionFilter: { filter: { fieldName: 'pagePath', inListFilter: { values: ['/members/signup', '/members/signup/thanks'] } } },
            limit: 10,
        }, accessToken),
        fetchGA4Data({
            propertyId, dateRanges,
            metrics: [{ name: 'totalUsers' }],
            dimensionFilter: {
                andGroup: {
                    expressions: [
                        { orGroup: { expressions: LIST_PATHS.map((p) => ({ filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: `/${p}` } } })) } },
                        { notExpression: { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'CONTAINS', value: '/media_' } } } },
                    ],
                },
            },
            limit: 1,
        }, accessToken),
        fetchGA4Data({
            propertyId, dateRanges,
            dimensions: [{ name: 'sessionDefaultChannelGroup' }],
            metrics: [{ name: 'sessions' }],
            orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
            limit: 6,
        }, accessToken),
    ])

    const users = new Map<string, number>()
    for (const r of [...(viewReport.rows ?? []), ...(clickReport.rows ?? []), ...(signupReport.rows ?? [])] as GA4Row[]) {
        users.set(r.dimensionValues[0]?.value ?? '', parseInt(r.metricValues[0]?.value ?? '0', 10))
    }
    const listUsers = parseInt((listReport.rows as GA4Row[] | undefined)?.[0]?.metricValues[0]?.value ?? '0', 10)

    const funnelLines = JOB_TYPES.map((t) => {
        const detail = users.get(`DL__Media__Area__${t.key}`) ?? 0
        const form = users.get(`EF__${t.key}__Area__Header`) ?? 0
        const done = users.get(`EF__${t.key}__Btn__${t.btn}`) ?? 0
        const rate = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '-')
        return `- ${t.label}: 求人詳細閲覧${detail.toLocaleString()} → 応募フォーム${form.toLocaleString()}（${rate(form, detail)}） → 応募完了${done.toLocaleString()}（詳細→完了 ${rate(done, detail)}）`
    })
    const signupForm = users.get('/members/signup') ?? 0
    const signupDone = users.get('/members/signup/thanks') ?? 0

    const channelTotal = ((channelReport.rows ?? []) as GA4Row[]).reduce((s, r) => s + parseInt(r.metricValues[0]?.value ?? '0', 10), 0)
    const channelLines = ((channelReport.rows ?? []) as GA4Row[]).map((r) => {
        const n = parseInt(r.metricValues[0]?.value ?? '0', 10)
        return `${r.dimensionValues[0]?.value}: ${channelTotal > 0 ? ((n / channelTotal) * 100).toFixed(0) : 0}%`
    }).join(' / ')

    return [
        '【直近30日の実測（GA4・ユニークユーザー）】',
        ...funnelLines,
        `- 会員登録: フォーム${signupForm.toLocaleString()} → 完了${signupDone.toLocaleString()}（${signupForm > 0 ? ((signupDone / signupForm) * 100).toFixed(1) : '-'}%）`,
        `- 求人一覧（検索・職種一覧）の閲覧: ${listUsers.toLocaleString()}`,
        `- 流入チャネル構成（セッション）: ${channelLines}`,
        '※2026-08-11以降Unassignedが膨らむ計測インシデントがあり、チャネル構成は参考値',
    ].join('\n')
}

/** 壁打ちプロンプトに注入する事業コンテキスト（GA4失敗時は単価のみ） */
export async function buildBusinessContext(propertyId: string | null): Promise<string> {
    const parts = [unitPriceSection()]
    if (propertyId) {
        try {
            parts.push(await ga4Section(propertyId))
        } catch (err) {
            console.error('[advisorContext] GA4実測の取得失敗（単価のみで続行）:', err instanceof Error ? err.message : err)
        }
    }
    return parts.join('\n\n')
}
