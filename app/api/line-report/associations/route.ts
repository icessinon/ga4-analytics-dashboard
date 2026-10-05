import { NextResponse } from 'next/server'
import { runLineAssociationReport } from '@/lib/services/lineAssociation/lineAssociationService'
import { parseDateString } from '@/lib/utils/date'

/**
 * サイト → LINE連携の導線別クリック（BigQuery events_* 直接集計）。
 * 同じ /line-report でも既存セクションはGA4 Data APIなので、重いBQクエリを巻き込まないよう
 * エンドポイントを分けている（ページ側で並列に叩く）。
 * データソースは x-work.jp のGA4 BQエクスポート固定のため propertyId は不要。
 */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}))
        const startDate = parseDateString(body?.startDate ?? '30daysAgo')
        const endDate = parseDateString(body?.endDate ?? 'yesterday')
        const report = await runLineAssociationReport(startDate, endDate)
        return NextResponse.json({ success: true, ...report, fetchedAt: new Date().toISOString() })
    } catch (error) {
        console.error('LINE Association API Error:', error)
        return NextResponse.json(
            { error: 'LINE連携導線の集計に失敗しました', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
