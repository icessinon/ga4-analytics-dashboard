/**
 * エンゲージメントファネルで取得しているページパス一覧を返す
 * ダッシュボードのページ選択などで利用
 */

import { NextResponse } from 'next/server'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { parseDateString } from '@/lib/utils/date'
import { createErrorResponse } from '@/lib/utils/error'

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}))
        const { propertyId, startDate, endDate, accessToken: customToken } = body

        if (!propertyId) {
            return NextResponse.json(
                { error: 'propertyId is required' },
                { status: 400 }
            )
        }

        const accessToken = await getGA4AccessToken(customToken)
        const parsedStart = parseDateString(startDate || '28daysAgo')
        const parsedEnd = parseDateString(endDate || 'yesterday')

        // time_on_page イベントが存在するページパスだけを取得（軽量クエリ）
        const report = await fetchGA4Data(
            {
                propertyId,
                dateRanges: [{ startDate: parsedStart, endDate: parsedEnd }],
                dimensions: [{ name: 'pagePath' }],
                metrics: [{ name: 'eventCount' }],
                dimensionFilter: {
                    filter: {
                        fieldName: 'eventName',
                        stringFilter: { matchType: 'EXACT', value: 'time_on_page' },
                    },
                },
                limit: 500,
            },
            accessToken
        )

        const pagePaths = (report.rows ?? [])
            .map((r) => r.dimensionValues[0]?.value ?? '')
            .filter((p) => p && p !== '(not set)')

        return NextResponse.json({
            success: true,
            pagePaths,
            startDate: parsedStart,
            endDate: parsedEnd,
        })
    } catch (error) {
        console.error('Engagement page-paths API error:', error)
        return NextResponse.json(
            createErrorResponse(error, 'ページパス一覧の取得に失敗しました'),
            { status: 500 }
        )
    }
}
