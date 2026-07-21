import { NextResponse } from 'next/server'
import { getGA4AccessToken, runGA4FunnelReport, type GA4FunnelStepInput } from '@/lib/api/ga4/client'

const VALID_TYPES = ['page', 'click']
const VALID_MATCH = ['EXACT', 'BEGINS_WITH', 'CONTAINS', 'PARTIAL_REGEXP', 'FULL_REGEXP']

export async function POST(request: Request) {
    try {
        const {
            propertyId,
            steps,
            startDate = '30daysAgo',
            endDate = 'yesterday',
            accessToken: customToken,
        } = await request.json()

        if (!propertyId) {
            return NextResponse.json({ error: 'propertyId が必要です' }, { status: 400 })
        }
        if (!Array.isArray(steps) || steps.length < 2 || steps.length > 10) {
            return NextResponse.json({ error: 'ステップは2〜10個で指定してください' }, { status: 400 })
        }
        const parsed: GA4FunnelStepInput[] = []
        for (const [i, s] of steps.entries()) {
            if (!s || !VALID_TYPES.includes(s.type) || !VALID_MATCH.includes(s.matchType) ||
                typeof s.value !== 'string' || !s.value.trim()) {
                return NextResponse.json({ error: `ステップ${i + 1}の指定が不正です` }, { status: 400 })
            }
            parsed.push({
                name: typeof s.name === 'string' && s.name.trim() ? s.name.trim() : `${i + 1}. ${s.value}`,
                type: s.type,
                matchType: s.matchType,
                value: s.value.trim(),
            })
        }

        const accessToken = await getGA4AccessToken(customToken)
        const results = await runGA4FunnelReport(
            propertyId,
            [{ startDate, endDate }],
            parsed,
            accessToken
        )

        return NextResponse.json({ steps: results, startDate, endDate })
    } catch (error) {
        console.error('Path Funnel API Error:', error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'ファネル集計に失敗しました' },
            { status: 500 }
        )
    }
}
