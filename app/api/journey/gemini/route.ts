import { NextResponse } from 'next/server'
import { analyzeDropoutPathsWithGemini } from '@/lib/api/gemini/dropoutAnalysis'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { paths, totalUsers, goalUsers, startDate, endDate } = body
        const analysis = await analyzeDropoutPathsWithGemini({ paths, totalUsers, goalUsers, startDate, endDate })
        if (analysis === null) return NextResponse.json({ error: '環境変数 GEMINI_API_KEY が設定されていません' }, { status: 500 })
        return NextResponse.json({ analysis })
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
    }
}
