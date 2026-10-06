import { NextResponse } from 'next/server'
import { readGa4Body } from '@/lib/http/ga4Request'
import { errorResponse } from '@/lib/http/errorResponse'
import { runUserTimeline } from '@/lib/services/user/userSegmentsService'
import type { UserSegmentFilter } from '@/lib/services/user/userSegmentsTypes'
import { parseDateString } from '@/lib/utils/date'

const FILTER_KEYS: Array<keyof UserSegmentFilter> = ['deviceCategory', 'browser', 'operatingSystem', 'country', 'sessionSource', 'sessionMedium']

/** セグメント条件に一致するイベントのタイムライン（既定期間 30daysAgo〜today） */
export async function POST(request: Request) {
    try {
        const { reporter, raw } = await readGa4Body(request, {
            propertyIdMissingMessage: 'propertyId is required',
            defaultEndDate: 'today',
            resolveDates: (s, e) => ({ startDate: parseDateString(s), endDate: parseDateString(e) }),
        })
        const filter: UserSegmentFilter = {}
        for (const k of FILTER_KEYS) if (typeof raw[k] === 'string') filter[k] = raw[k] as string
        const events = await runUserTimeline(reporter, filter)
        return NextResponse.json({ success: true, events, total: events.length })
    } catch (error) {
        return errorResponse(error, 'Failed to fetch timeline', 'User Timeline API Error', { withMessage: true })
    }
}
