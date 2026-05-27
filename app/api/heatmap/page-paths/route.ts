import { NextResponse } from 'next/server'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { parseDateString } from '@/lib/utils/date'
import { prisma } from '@/lib/db/client'
import { createErrorResponse } from '@/lib/utils/error'

// view_label パラメータが存在するページパス一覧を返す
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}))
        const { productId, propertyId: propertyIdParam, startDate: startParam, endDate: endParam, accessToken: customToken } = body

        let propertyId = propertyIdParam
        if (!propertyId && productId != null) {
            const product = await prisma.product.findUnique({
                where: { id: Number(productId) },
                select: { ga4PropertyId: true },
            })
            if (!product?.ga4PropertyId) {
                return NextResponse.json({ error: 'プロダクトに GA4 プロパティが設定されていません。' }, { status: 400 })
            }
            propertyId = product.ga4PropertyId
        }
        if (!propertyId) return NextResponse.json({ error: 'propertyId または productId を指定してください。' }, { status: 400 })

        const startDate = parseDateString(startParam || '28daysAgo')
        const endDate = parseDateString(endParam || 'yesterday')
        const accessToken = await getGA4AccessToken(customToken)

        // pagePath + customEvent:view_label を取得し、ラベルが存在するパスだけ抽出
        const report = await fetchGA4Data({
            propertyId: String(propertyId),
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: 'pagePath' }, { name: 'customEvent:view_label' }],
            metrics: [{ name: 'eventCount' }],
            limit: 5000,
        }, accessToken)

        const pathSet = new Set<string>()
        for (const row of report.rows ?? []) {
            const path = row.dimensionValues[0]?.value ?? ''
            const label = row.dimensionValues[1]?.value ?? ''
            if (path && path !== '(not set)' && label && label !== '(not set)') {
                pathSet.add(path)
            }
        }

        const pagePaths = Array.from(pathSet).sort()

        return NextResponse.json({ success: true, pagePaths })
    } catch (error) {
        console.error('Heatmap page-paths API error:', error)
        return NextResponse.json(createErrorResponse(error, 'ページパス一覧の取得に失敗しました'), { status: 500 })
    }
}
