import { NextResponse } from 'next/server'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { parseDateString } from '@/lib/utils/date'

/**
 * 会員登録フォームの推移（職種別×全体）。
 * - 流入: 職種選択ボタンクリック（SU__Jobs__Btn__{職種名}）を日別×職種別に集計
 * - 完了: /members/signup/thanks の ?occ= パラメータで職種別に分解
 * - 全体フォーム到達: pagePath=/members/signup のユーザー数（参考値）
 * 完走率 = 完了 / 職種選択クリック。
 */

// 職種選択ボタンのラベル → フォームキー（/api/signup-funnel の JOBS_BTN_LABEL の逆引き）
const BTN_LABEL_TO_FORM: Record<string, string> = {
    'ドライバー・運転手': 'Driver',
    '運行管理・車両管理': 'Unkan',
    '倉庫・フォークリフト': 'Soko',
    'タクシードライバー': 'Taxi',
    'バスドライバー': 'Bus',
    '施工管理': 'Sekokan',
    '設計・積算・測量': 'Sekkei',
    '建物保守・点検': 'Hoshu',
    '設備工事作業員': 'SetsubiSagyo',
    '職人': 'Shokunin',
    '自動車整備士・検査員': 'Seibi',
    '製造': 'KojoSagyo',
    '警備員': 'Keibi',
    '飲食': 'Food',
    '営業・事務職その他': 'Others',
}

const FORM_LABELS: Record<string, string> = Object.fromEntries(
    Object.entries(BTN_LABEL_TO_FORM).map(([label, key]) => [key, label])
)

interface GA4Row { dimensionValues: Array<{ value?: string }>; metricValues: Array<{ value?: string }> }

export async function POST(request: Request) {
    try {
        const { propertyId, startDate = '30daysAgo', endDate = 'yesterday' } = await request.json()
        if (!propertyId) {
            return NextResponse.json({ error: 'propertyId が必要です' }, { status: 400 })
        }
        const accessToken = await getGA4AccessToken()
        const dateRanges = [{ startDate: parseDateString(startDate), endDate: parseDateString(endDate) }]

        const [clicksReport, thanksReport, formReport] = await Promise.all([
            fetchGA4Data({
                propertyId, dateRanges,
                dimensions: [{ name: 'date' }, { name: 'customEvent:click_label' }],
                metrics: [{ name: 'totalUsers' }],
                dimensionFilter: {
                    filter: { fieldName: 'customEvent:click_label', stringFilter: { matchType: 'BEGINS_WITH', value: 'SU__Jobs__Btn__' } },
                },
                limit: 5000,
            }, accessToken),
            fetchGA4Data({
                propertyId, dateRanges,
                dimensions: [{ name: 'date' }, { name: 'pagePathPlusQueryString' }],
                metrics: [{ name: 'totalUsers' }],
                dimensionFilter: {
                    filter: { fieldName: 'pagePathPlusQueryString', stringFilter: { matchType: 'BEGINS_WITH', value: '/members/signup/thanks' } },
                },
                limit: 5000,
            }, accessToken),
            fetchGA4Data({
                propertyId, dateRanges,
                dimensions: [{ name: 'date' }],
                metrics: [{ name: 'totalUsers' }],
                dimensionFilter: {
                    filter: { fieldName: 'pagePath', stringFilter: { matchType: 'EXACT', value: '/members/signup' } },
                },
                limit: 400,
            }, accessToken),
        ])

        // 日付の全集合（イベントがない日も0で埋めるため昇順ソート）
        const dateSet = new Set<string>()
        for (const r of [...(clicksReport.rows ?? []), ...(thanksReport.rows ?? []), ...(formReport.rows ?? [])] as GA4Row[]) {
            const d = r.dimensionValues[0]?.value
            if (d) dateSet.add(d)
        }
        const dates = [...dateSet].sort()
        const dateIndex = new Map(dates.map((d, i) => [d, i]))
        const zeros = () => dates.map(() => 0)

        const clicksByForm = new Map<string, number[]>()
        const completedByForm = new Map<string, number[]>()
        const overallClicks = zeros()
        const overallCompleted = zeros()
        const overallFormUsers = zeros()

        for (const r of (clicksReport.rows ?? []) as GA4Row[]) {
            const i = dateIndex.get(r.dimensionValues[0]?.value ?? '')
            const btnLabel = (r.dimensionValues[1]?.value ?? '').replace('SU__Jobs__Btn__', '')
            const users = parseInt(r.metricValues[0]?.value ?? '0', 10)
            if (i == null) continue
            const form = BTN_LABEL_TO_FORM[btnLabel]
            overallClicks[i] += users
            if (form) {
                if (!clicksByForm.has(form)) clicksByForm.set(form, zeros())
                clicksByForm.get(form)![i] += users
            }
        }

        for (const r of (thanksReport.rows ?? []) as GA4Row[]) {
            const i = dateIndex.get(r.dimensionValues[0]?.value ?? '')
            const path = r.dimensionValues[1]?.value ?? ''
            const users = parseInt(r.metricValues[0]?.value ?? '0', 10)
            if (i == null) continue
            overallCompleted[i] += users
            const occ = path.match(/[?&]occ=([A-Za-z]+)/)?.[1]
            if (occ && FORM_LABELS[occ]) {
                if (!completedByForm.has(occ)) completedByForm.set(occ, zeros())
                completedByForm.get(occ)![i] += users
            }
        }

        for (const r of (formReport.rows ?? []) as GA4Row[]) {
            const i = dateIndex.get(r.dimensionValues[0]?.value ?? '')
            if (i != null) overallFormUsers[i] = parseInt(r.metricValues[0]?.value ?? '0', 10)
        }

        const formKeys = new Set([...clicksByForm.keys(), ...completedByForm.keys()])
        const forms = [...formKeys]
            .map((key) => ({
                key,
                label: FORM_LABELS[key] ?? key,
                clicks: clicksByForm.get(key) ?? zeros(),
                completed: completedByForm.get(key) ?? zeros(),
            }))
            .sort((a, b) => b.clicks.reduce((s, n) => s + n, 0) - a.clicks.reduce((s, n) => s + n, 0))

        return NextResponse.json({
            success: true,
            startDate: dateRanges[0].startDate,
            endDate: dateRanges[0].endDate,
            dates,
            overall: { clicks: overallClicks, completed: overallCompleted, formUsers: overallFormUsers },
            forms,
            fetchedAt: new Date().toISOString(),
        })
    } catch (error) {
        console.error('Signup Funnel Trend API Error:', error)
        return NextResponse.json(
            { error: '会員登録推移の集計に失敗しました', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
