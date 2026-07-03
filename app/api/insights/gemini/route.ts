import { NextResponse } from 'next/server'
import { generateWeeklyInsightWithGemini } from '@/lib/api/gemini/weeklyInsight'
import { prisma } from '@/lib/db/client'
import { insertMonthlyInsightLog, nowIso } from '@/lib/bq/write'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { current, previous, propertyId, weeklyBreakdown } = body

        let productId: number | null = null
        let productName: string | null = null
        if (propertyId) {
            const product = await prisma.product.findFirst({
                where: { ga4PropertyId: String(propertyId) },
                select: { id: true, name: true },
            }).catch(() => null)
            if (product) { productId = product.id; productName = product.name }
        }

        const analysis = await generateWeeklyInsightWithGemini({ current, previous, productId: productId ?? undefined })
        if (analysis === null) return NextResponse.json({ error: '環境変数 GEMINI_API_KEY が設定されていません' }, { status: 500 })

        // target_month は current.startDate (YYYY-MM-DD) から抽出
        const targetMonth = typeof current?.startDate === 'string' ? current.startDate.slice(0, 7) : ''
        if (targetMonth) {
            const createdAt = nowIso()
            void insertMonthlyInsightLog({
                insight_id:                `${propertyId ?? 'unknown'}-${targetMonth}-${createdAt}`,
                property_id:               propertyId ? String(propertyId) : null,
                product_id:                productId,
                product_name:              productName,
                target_month:              targetMonth,
                current_snapshot:          current ? JSON.stringify(current) : null,
                previous_snapshot:         previous ? JSON.stringify(previous) : null,
                weekly_breakdown_current:  weeklyBreakdown?.current ? JSON.stringify(weeklyBreakdown.current) : null,
                weekly_breakdown_previous: weeklyBreakdown?.previous ? JSON.stringify(weeklyBreakdown.previous) : null,
                ai_report:                 analysis,
                created_at:                createdAt,
                synced_at:                 createdAt,
            })
        }

        return NextResponse.json({ analysis })
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
    }
}
