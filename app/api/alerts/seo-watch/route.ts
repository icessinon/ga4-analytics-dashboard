import { NextResponse } from 'next/server'
import { checkAbTestSeoAndNotify } from '@/lib/services/seo/abTestSeoWatchService'

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({})) as { weekly?: boolean }
        const { abTests, categories } = await checkAbTestSeoAndNotify(body.weekly === true)
        const alertCount = abTests.filter((r) => r.status === 'alert').length
            + categories.filter((r) => r.status === 'alert').length
        console.log(`[seoWatch] チェック完了: ABテスト${abTests.length}件 / カテゴリ${categories.length}件 / アラート${alertCount}件`)
        return NextResponse.json({ success: true, results: abTests, categories })
    } catch (e) {
        console.error('[seoWatch] チェック失敗:', e)
        return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
    }
}
