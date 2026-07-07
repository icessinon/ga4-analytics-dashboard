import { NextResponse } from 'next/server'
import { analyzeOccupationWithGemini } from '@/lib/api/gemini/occupationAnalysis'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { occupations, lpApplies, noOccSignupCv, totalSessions, overallSignupRate, startDate, endDate, productId } = body
        if (!Array.isArray(occupations) || occupations.length === 0) {
            return NextResponse.json({ error: 'occupations が必要です' }, { status: 400 })
        }
        const analysis = await analyzeOccupationWithGemini({
            startDate: startDate ?? '',
            endDate: endDate ?? '',
            occupations,
            noOccSignupCv: noOccSignupCv ?? 0,
            totalSessions,
            overallSignupRate,
            lpApplies: Array.isArray(lpApplies) ? lpApplies : [],
        }, productId)
        if (!analysis) {
            return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 })
        }
        return NextResponse.json({ analysis })
    } catch (error) {
        console.error('Occupation Gemini API Error:', error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'AI分析に失敗しました' },
            { status: 500 }
        )
    }
}
