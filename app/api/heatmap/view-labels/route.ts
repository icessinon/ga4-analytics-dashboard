/**
 * GA4 の customEvent:view_label ごとのイベント数を取得
 * ヒートマップ（view ラベルベース）のデータソース
 * deviceCategory ディメンションを追加し、SP/PC 別に分割して返す
 */

import { NextResponse } from 'next/server'
import { fetchGA4Data } from '@/lib/api/ga4/client'
import { getGA4AccessToken } from '@/lib/api/ga4/client'
import { parseDateString } from '@/lib/utils/date'
import { prisma } from '@/lib/db/client'
import { createErrorResponse } from '@/lib/utils/error'

export interface ViewLabelRow {
    viewLabel: string
    count: number
}

export interface ViewLabelsByDevice {
    mobile: ViewLabelRow[]
    desktop: ViewLabelRow[]
    tablet: ViewLabelRow[]
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}))
        const {
            productId,
            propertyId: propertyIdParam,
            startDate: startParam,
            endDate: endParam,
            pagePath,
            accessToken: customToken,
        } = body

        let propertyId = propertyIdParam
        if (!propertyId && productId != null) {
            const product = await prisma.product.findUnique({
                where: { id: Number(productId) },
                select: { ga4PropertyId: true },
            })
            if (!product?.ga4PropertyId) {
                return NextResponse.json(
                    { error: 'プロダクトに GA4 プロパティが設定されていません。' },
                    { status: 400 }
                )
            }
            propertyId = product.ga4PropertyId
        }

        if (!propertyId) {
            return NextResponse.json(
                { error: 'propertyId または productId を指定してください。' },
                { status: 400 }
            )
        }

        const startDate = parseDateString(startParam || '28daysAgo')
        const endDate = parseDateString(endParam || 'yesterday')

        const accessToken = await getGA4AccessToken(customToken)

        const ga4Request: Parameters<typeof fetchGA4Data>[0] = {
            propertyId: String(propertyId),
            dateRanges: [{ startDate, endDate }],
            dimensions: [
                { name: 'deviceCategory' },
                { name: 'customEvent:view_label' },
            ],
            metrics: [{ name: 'eventCount' }],
            limit: 1500,
        }

        if (pagePath != null && String(pagePath).trim() !== '') {
            ga4Request.dimensionFilter = {
                filter: {
                    fieldName: 'pagePath',
                    stringFilter: { matchType: 'EXACT', value: String(pagePath).trim() },
                },
            }
        }

        const report = await fetchGA4Data(ga4Request, accessToken)

        const dimensionHeaders = report.dimensionHeaders || []
        const metricHeaders = report.metricHeaders || []
        const deviceIdx = dimensionHeaders.findIndex((h) => h.name === 'deviceCategory')
        const viewLabelIdx = dimensionHeaders.findIndex((h) => h.name === 'customEvent:view_label')
        const countIdx = metricHeaders.findIndex((h) => h.name === 'eventCount')

        const byDevice: Record<string, Record<string, number>> = {
            mobile: {},
            desktop: {},
            tablet: {},
        }

        for (const row of report.rows || []) {
            const device = deviceIdx >= 0 ? String(row.dimensionValues[deviceIdx]?.value ?? '').toLowerCase() : ''
            const viewLabel = viewLabelIdx >= 0 ? String(row.dimensionValues[viewLabelIdx]?.value ?? '').trim() : ''
            const count = countIdx >= 0 ? parseInt(String(row.metricValues[countIdx]?.value ?? '0'), 10) || 0 : 0

            if (!viewLabel || viewLabel === '(not set)') continue
            if (!byDevice[device]) continue

            byDevice[device][viewLabel] = (byDevice[device][viewLabel] ?? 0) + count
        }

        const toSortedRows = (map: Record<string, number>): ViewLabelRow[] =>
            Object.entries(map)
                .map(([viewLabel, count]) => ({ viewLabel, count }))
                .sort((a, b) => b.count - a.count)

        return NextResponse.json({
            success: true,
            byDevice: {
                mobile: toSortedRows(byDevice.mobile),
                desktop: toSortedRows(byDevice.desktop),
                tablet: toSortedRows(byDevice.tablet),
            },
            startDate,
            endDate,
        })
    } catch (error) {
        console.error('Heatmap view-labels API error:', error)
        return NextResponse.json(
            createErrorResponse(error, 'view ラベルデータの取得に失敗しました'),
            { status: 500 }
        )
    }
}
