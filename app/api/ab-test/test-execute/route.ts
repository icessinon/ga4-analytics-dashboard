import { NextResponse } from 'next/server'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { calculateCVR, type CvrConfig } from '@/lib/services/analytics/cvrService'
import { splitLabels, VARIANT_KEYS, type GA4Config, type GA4CvrConfig } from '@/lib/services/ab-test/ga4ConfigTypes'
import { buildAbTestGa4Request } from '@/lib/services/ab-test/execution/ga4Report'
import { parseDateString } from '@/lib/utils/date'

/**
 * ABテストテスト実行API
 * フォーム入力値で実際にGA4データを取得してCVRを計算し、問題がないか確認
 * データベースには保存しない
 */
export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { ga4Config, startDate, endDate } = body

        if (!ga4Config || !ga4Config.propertyId) {
            return NextResponse.json(
                { error: 'GA4設定が不完全です' },
                { status: 400 }
            )
        }

        if (!startDate || !endDate) {
            return NextResponse.json(
                { error: '開始日と終了日が必要です' },
                { status: 400 }
            )
        }

        // アクセストークンを取得（通常のレポート実行と同じ方法）
        const accessToken = await getGA4AccessToken()

        // 期間を決定
        const parsedStartDate = parseDateString(startDate)
        const parsedEndDate = parseDateString(endDate)

        const config = ga4Config as GA4Config
        const ga4Request = buildAbTestGa4Request(config, { startDate: parsedStartDate, endDate: parsedEndDate })

        const ga4Response = await fetchGA4Data(ga4Request, accessToken)

        if (!ga4Response || !ga4Response.rows || ga4Response.rows.length === 0) {
            return NextResponse.json({
                success: true,
                warning: 'GA4データが取得できませんでした。期間やフィルタ設定を確認してください。',
                cvrResults: {},
            })
        }

        // CVRを計算。フォーム入力なので空ラベルを落とし、metric 未指定は totalUsers にする
        const toStrictCvrConfig = (c: GA4CvrConfig): CvrConfig => ({
            metric: c.metric || 'totalUsers',
            numeratorDimension: c.numeratorDimension ?? '',
            denominatorDimension: c.denominatorDimension ?? '',
            numeratorLabels: splitLabels(c.numeratorLabels, { dropEmpty: true }),
            denominatorLabels: splitLabels(c.denominatorLabels, { dropEmpty: true }),
        })
        const cvrResults: Record<string, unknown> = {}
        for (const key of VARIANT_KEYS) {
            const cvrConfig = config[`cvr${key}`]
            if (!cvrConfig) continue
            try {
                const r = calculateCVR(ga4Response, toStrictCvrConfig(cvrConfig), ga4Response.dimensionHeaders || [], ga4Response.metricHeaders || [])
                cvrResults[`cvr${key}`] = { cv: r.cv, pv: r.pv, cvr: r.cvr, pvByLabel: r.pvByLabel, cvByLabel: r.cvByLabel }
            } catch (error) {
                cvrResults[`cvr${key}`] = { error: error instanceof Error ? error.message : 'CVR計算エラー' }
            }
        }

        const truncated = ga4Response.rows.length >= (ga4Request.limit ?? 0)
        return NextResponse.json({
            success: true,
            cvrResults,
            rowCount: ga4Response.rows.length,
            ...(truncated && {
                warning: `GA4の取得行数が上限（${ga4Request.limit}行）に達しています。集計に欠測がある可能性があるため、期間を短くするかフィルタで絞り込んでください。`,
            }),
        })
    } catch (error) {
        console.error('AB Test Test Execute API Error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        
        // 認証エラーの場合はより詳細な情報を提供
        if (errorMessage.includes('authentication') || errorMessage.includes('認証')) {
            return NextResponse.json(
                {
                    error: 'GA4認証エラー',
                    message: errorMessage,
                    details: 'GA4 APIの認証に失敗しました。以下の点を確認してください：\n' +
                        '1. アクセストークンが有効期限内であること\n' +
                        '2. サービスアカウントがGA4プロパティへのアクセス権限を持っていること\n' +
                        '3. 環境変数が正しく設定されていること\n' +
                        '詳細は .env または .env.local（Docker の場合は .env）の設定を確認してください。'
                },
                { status: 401 }
            )
        }
        
        return NextResponse.json(
            {
                error: 'テスト実行に失敗しました',
                message: errorMessage,
            },
            { status: 500 }
        )
    }
}
