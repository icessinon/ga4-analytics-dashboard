import { NextResponse } from 'next/server'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { calculateCVR } from '@/lib/services/analytics/cvrService'
import { buildGa4ConfigDimensionFilter } from '@/lib/services/ab-test/ga4ConfigFilter'
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

        const dimensions = Array.isArray(ga4Config.dimensions)
            ? ga4Config.dimensions
            : typeof ga4Config.dimensions === 'string'
            ? ga4Config.dimensions.split(',').map((d: string) => ({ name: d.trim() }))
            : []

        const metrics = Array.isArray(ga4Config.metrics)
            ? ga4Config.metrics
            : typeof ga4Config.metrics === 'string'
            ? ga4Config.metrics.split(',').map((m: string) => ({ name: m.trim() }))
            : []

        // GA4データを取得
        const ga4Request: any = {
            propertyId: ga4Config.propertyId,
            dateRanges: [{ startDate: parsedStartDate, endDate: parsedEndDate }],
            dimensions: dimensions,
            metrics: metrics,
            limit: ga4Config.limit || 10000,
        }
        
        if (!ga4Request.propertyId) {
            return NextResponse.json(
                { error: 'プロパティIDが設定されていません' },
                { status: 400 }
            )
        }

        // フィルタを適用（空の場合は適用しない）
        ga4Request.dimensionFilter = buildGa4ConfigDimensionFilter(ga4Config)

        const ga4Response = await fetchGA4Data(ga4Request, accessToken)

        if (!ga4Response || !ga4Response.rows || ga4Response.rows.length === 0) {
            return NextResponse.json({
                success: true,
                warning: 'GA4データが取得できませんでした。期間やフィルタ設定を確認してください。',
                cvrResults: {},
            })
        }

        // CVRを計算
        const cvrResults: any = {}

        // CVR A
        if (ga4Config.cvrA) {
            const cvrConfigA = {
                metric: ga4Config.cvrA.metric || 'totalUsers',
                numeratorDimension: ga4Config.cvrA.numeratorDimension,
                denominatorDimension: ga4Config.cvrA.denominatorDimension,
                numeratorLabels: Array.isArray(ga4Config.cvrA.numeratorLabels)
                    ? ga4Config.cvrA.numeratorLabels
                    : typeof ga4Config.cvrA.numeratorLabels === 'string'
                    ? ga4Config.cvrA.numeratorLabels.split(',').map((l: string) => l.trim()).filter((l: string) => l.length > 0)
                    : [],
                denominatorLabels: Array.isArray(ga4Config.cvrA.denominatorLabels)
                    ? ga4Config.cvrA.denominatorLabels
                    : typeof ga4Config.cvrA.denominatorLabels === 'string'
                    ? ga4Config.cvrA.denominatorLabels.split(',').map((l: string) => l.trim()).filter((l: string) => l.length > 0)
                    : [],
            }

            try {
                const cvrA = calculateCVR(
                    ga4Response,
                    cvrConfigA,
                    ga4Response.dimensionHeaders || [],
                    ga4Response.metricHeaders || []
                )
                cvrResults.cvrA = {
                    cv: cvrA.cv,
                    pv: cvrA.pv,
                    cvr: cvrA.cvr,
                    pvByLabel: cvrA.pvByLabel,
                    cvByLabel: cvrA.cvByLabel,
                }
            } catch (error) {
                cvrResults.cvrA = {
                    error: error instanceof Error ? error.message : 'CVR計算エラー',
                }
            }
        }

        // CVR B
        if (ga4Config.cvrB) {
            const cvrConfigB = {
                metric: ga4Config.cvrB.metric || 'totalUsers',
                numeratorDimension: ga4Config.cvrB.numeratorDimension,
                denominatorDimension: ga4Config.cvrB.denominatorDimension,
                numeratorLabels: Array.isArray(ga4Config.cvrB.numeratorLabels)
                    ? ga4Config.cvrB.numeratorLabels
                    : typeof ga4Config.cvrB.numeratorLabels === 'string'
                    ? ga4Config.cvrB.numeratorLabels.split(',').map((l: string) => l.trim()).filter((l: string) => l.length > 0)
                    : [],
                denominatorLabels: Array.isArray(ga4Config.cvrB.denominatorLabels)
                    ? ga4Config.cvrB.denominatorLabels
                    : typeof ga4Config.cvrB.denominatorLabels === 'string'
                    ? ga4Config.cvrB.denominatorLabels.split(',').map((l: string) => l.trim()).filter((l: string) => l.length > 0)
                    : [],
            }

            try {
                const cvrB = calculateCVR(
                    ga4Response,
                    cvrConfigB,
                    ga4Response.dimensionHeaders || [],
                    ga4Response.metricHeaders || []
                )
                cvrResults.cvrB = {
                    cv: cvrB.cv,
                    pv: cvrB.pv,
                    cvr: cvrB.cvr,
                    pvByLabel: cvrB.pvByLabel,
                    cvByLabel: cvrB.cvByLabel,
                }
            } catch (error) {
                cvrResults.cvrB = {
                    error: error instanceof Error ? error.message : 'CVR計算エラー',
                }
            }
        }

        // CVR C
        if (ga4Config.cvrC) {
            const cvrConfigC = {
                metric: ga4Config.cvrC.metric || 'totalUsers',
                numeratorDimension: ga4Config.cvrC.numeratorDimension,
                denominatorDimension: ga4Config.cvrC.denominatorDimension,
                numeratorLabels: Array.isArray(ga4Config.cvrC.numeratorLabels)
                    ? ga4Config.cvrC.numeratorLabels
                    : typeof ga4Config.cvrC.numeratorLabels === 'string'
                    ? ga4Config.cvrC.numeratorLabels.split(',').map((l: string) => l.trim()).filter((l: string) => l.length > 0)
                    : [],
                denominatorLabels: Array.isArray(ga4Config.cvrC.denominatorLabels)
                    ? ga4Config.cvrC.denominatorLabels
                    : typeof ga4Config.cvrC.denominatorLabels === 'string'
                    ? ga4Config.cvrC.denominatorLabels.split(',').map((l: string) => l.trim()).filter((l: string) => l.length > 0)
                    : [],
            }

            try {
                const cvrC = calculateCVR(
                    ga4Response,
                    cvrConfigC,
                    ga4Response.dimensionHeaders || [],
                    ga4Response.metricHeaders || []
                )
                cvrResults.cvrC = {
                    cv: cvrC.cv,
                    pv: cvrC.pv,
                    cvr: cvrC.cvr,
                    pvByLabel: cvrC.pvByLabel,
                    cvByLabel: cvrC.cvByLabel,
                }
            } catch (error) {
                cvrResults.cvrC = {
                    error: error instanceof Error ? error.message : 'CVR計算エラー',
                }
            }
        }

        // CVR D
        if (ga4Config.cvrD) {
            const cvrConfigD = {
                metric: ga4Config.cvrD.metric || 'totalUsers',
                numeratorDimension: ga4Config.cvrD.numeratorDimension,
                denominatorDimension: ga4Config.cvrD.denominatorDimension,
                numeratorLabels: Array.isArray(ga4Config.cvrD.numeratorLabels)
                    ? ga4Config.cvrD.numeratorLabels
                    : typeof ga4Config.cvrD.numeratorLabels === 'string'
                    ? ga4Config.cvrD.numeratorLabels.split(',').map((l: string) => l.trim()).filter((l: string) => l.length > 0)
                    : [],
                denominatorLabels: Array.isArray(ga4Config.cvrD.denominatorLabels)
                    ? ga4Config.cvrD.denominatorLabels
                    : typeof ga4Config.cvrD.denominatorLabels === 'string'
                    ? ga4Config.cvrD.denominatorLabels.split(',').map((l: string) => l.trim()).filter((l: string) => l.length > 0)
                    : [],
            }

            try {
                const cvrD = calculateCVR(
                    ga4Response,
                    cvrConfigD,
                    ga4Response.dimensionHeaders || [],
                    ga4Response.metricHeaders || []
                )
                cvrResults.cvrD = {
                    cv: cvrD.cv,
                    pv: cvrD.pv,
                    cvr: cvrD.cvr,
                    pvByLabel: cvrD.pvByLabel,
                    cvByLabel: cvrD.cvByLabel,
                }
            } catch (error) {
                cvrResults.cvrD = {
                    error: error instanceof Error ? error.message : 'CVR計算エラー',
                }
            }
        }

        return NextResponse.json({
            success: true,
            cvrResults,
            rowCount: ga4Response.rows.length,
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
