/**
 * 実行履歴一覧（レポート・ABテスト・ファネルを1本の時系列で返す）
 */

import { NextResponse } from 'next/server'
import { listHistory } from '@/lib/services/history/historyService'
import { HISTORY_KINDS, type HistoryKind } from '@/lib/services/history/historyTypes'
import { errorResponse } from '@/lib/http/errorResponse'

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const productIdParam = searchParams.get('productId')
        const kindParam = searchParams.get('kind')
        const kind = HISTORY_KINDS.some((k) => k.id === kindParam) ? (kindParam as HistoryKind) : undefined

        const result = await listHistory({
            productId: productIdParam ? parseInt(productIdParam, 10) : undefined,
            kind,
            search: searchParams.get('search')?.trim() || undefined,
            page: Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1),
            limit: Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20)),
        })

        return NextResponse.json({ success: true, ...result })
    } catch (error) {
        return errorResponse(error, '履歴の取得に失敗しました', 'History API Error', { withMessage: true })
    }
}
