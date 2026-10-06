import { NextResponse } from 'next/server'
import { runGA4FunnelReport, type GA4FunnelStepInput } from '@/lib/api/ga4/client'
import { readGa4Body } from '@/lib/http/ga4Request'
import { HttpError, errorResponse } from '@/lib/http/errorResponse'

const VALID_TYPES = ['page', 'click']
const VALID_MATCH = ['EXACT', 'BEGINS_WITH', 'CONTAINS', 'PARTIAL_REGEXP', 'FULL_REGEXP']

/** ページ閲覧とクリックタグを自由に並べた順序付きクローズドファネル（GA4 v1alpha） */
export async function POST(request: Request) {
    try {
        const { propertyId, accessToken, startDate, endDate, raw } = await readGa4Body(request, { propertyIdMissingMessage: 'propertyId が必要です' })
        const steps = raw.steps
        if (!Array.isArray(steps) || steps.length < 2 || steps.length > 10) {
            throw new HttpError(400, 'ステップは2〜10個で指定してください')
        }
        const parsed: GA4FunnelStepInput[] = []
        for (const [i, s] of steps.entries()) {
            if (!s || !VALID_TYPES.includes(s.type) || !VALID_MATCH.includes(s.matchType) || typeof s.value !== 'string' || !s.value.trim()) {
                throw new HttpError(400, `ステップ${i + 1}の指定が不正です`)
            }
            parsed.push({
                name: typeof s.name === 'string' && s.name.trim() ? s.name.trim() : `${i + 1}. ${s.value}`,
                type: s.type,
                matchType: s.matchType,
                value: s.value.trim(),
            })
        }

        const results = await runGA4FunnelReport(propertyId, [{ startDate, endDate }], parsed, accessToken)
        return NextResponse.json({ steps: results, startDate, endDate })
    } catch (error) {
        return errorResponse(error, 'ファネル集計に失敗しました', 'Path Funnel API Error')
    }
}
