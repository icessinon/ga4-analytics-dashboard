import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/http/errorResponse'
import { deleteProductGoal, listProductGoals, parseProductId, saveProductGoals } from '@/lib/services/kpi/productGoalsService'
import type { ProductGoalInput } from '@/lib/services/kpi/productGoalsTypes'

/** プロダクト目標の一覧。目標が無ければ初期テンプレートを入れて返す */
export async function GET(request: Request) {
    try {
        const productId = parseProductId(new URL(request.url).searchParams.get('productId'))
        const { goals, seeded } = await listProductGoals(productId)
        return NextResponse.json({ success: true, goals, seeded })
    } catch (error) {
        return errorResponse(error, 'プロダクト目標の取得に失敗しました', 'Product Goals API Error', { withMessage: true })
    }
}

/** プロダクト目標の保存（id があれば更新、無ければ新規） */
export async function PUT(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as { productId?: unknown; goals?: unknown }
        const productId = parseProductId(body.productId)
        const goals = Array.isArray(body.goals) ? (body.goals as ProductGoalInput[]) : []
        return NextResponse.json({ success: true, goals: await saveProductGoals(productId, goals) })
    } catch (error) {
        return errorResponse(error, 'プロダクト目標の保存に失敗しました', 'Product Goals API Error', { withMessage: true })
    }
}

/** プロダクト目標の削除（論理削除） */
export async function DELETE(request: Request) {
    try {
        const params = new URL(request.url).searchParams
        const productId = parseProductId(params.get('productId'))
        await deleteProductGoal(productId, Number(params.get('id')))
        return NextResponse.json({ success: true })
    } catch (error) {
        return errorResponse(error, 'プロダクト目標の削除に失敗しました', 'Product Goals API Error', { withMessage: true })
    }
}
