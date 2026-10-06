import { NextResponse } from 'next/server'
import { readGa4Body } from '@/lib/http/ga4Request'
import { errorResponse } from '@/lib/http/errorResponse'
import { runUserSegmentList } from '@/lib/services/user/userSegmentsService'
import { parseDateString } from '@/lib/utils/date'

/** セグメント一覧（既定期間 30daysAgo〜today、limit 既定 10000） */
export async function POST(request: Request) {
    try {
        const { reporter, raw } = await readGa4Body(request, {
            propertyIdMissingMessage: 'propertyId is required',
            defaultEndDate: 'today',
            resolveDates: (s, e) => ({ startDate: parseDateString(s), endDate: parseDateString(e) }),
        })
        const limit = typeof raw.limit === 'number' ? raw.limit : 10000
        const segments = await runUserSegmentList(reporter, limit)
        return NextResponse.json({ success: true, segments, total: segments.length })
    } catch (error) {
        return errorResponse(error, 'Failed to fetch user list', 'User List API Error', { withMessage: true })
    }
}
