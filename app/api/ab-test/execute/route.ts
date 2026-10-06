import { NextResponse } from 'next/server'
import { executeAbTests } from '@/lib/services/ab-test/execution/executeAbTests'
import { createErrorResponse } from '@/lib/utils/error'

/**
 * ABテスト自動実行API
 * 期間終了後のABテストに対してGA4分析を実行する。abTestId 指定で 1 件だけ手動実行（force で同日スキップを無視）。
 * 処理本体は lib/services/ab-test/execution/executeAbTests.ts
 */
export async function POST(request: Request) {
    try {
        const body = (await request.json()) as { abTestId?: number | string | null; force?: boolean }
        const summary = await executeAbTests({ abTestId: body.abTestId, force: body.force })
        return NextResponse.json({ success: true, ...summary })
    } catch (error) {
        console.error('AB Test Execute API Error:', error)
        return NextResponse.json(createErrorResponse(error, 'Failed to execute AB tests'), { status: 500 })
    }
}
