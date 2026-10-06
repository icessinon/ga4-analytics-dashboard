import { NextResponse } from 'next/server'
import { createGa4Reporter } from '@/lib/api/ga4/report'
import { getGA4AccessToken } from '@/lib/api/ga4/client'
import { errorResponse } from '@/lib/http/errorResponse'
import { runApplicationsActualReport } from '@/lib/services/cv/applicationsActualService'
import { parseDateString } from '@/lib/utils/date'

/**
 * 応募の全体像（DynamoDB 実数）。propertyId は任意で、あれば単独登録（GA4）も返す。
 * 集計は lib/services/cv/applicationsActualService.ts
 */
export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
        const start = parseDateString(typeof body.startDate === 'string' && body.startDate ? body.startDate : '30daysAgo')
        const end = parseDateString(typeof body.endDate === 'string' && body.endDate ? body.endDate : 'yesterday')
        const propertyId = body.propertyId != null && body.propertyId !== '' ? String(body.propertyId) : null
        const reporter = propertyId
            ? createGa4Reporter({ propertyId, accessToken: await getGA4AccessToken(), dateRanges: [{ startDate: start, endDate: end }] })
            : null
        const report = await runApplicationsActualReport(reporter, start, end)
        return NextResponse.json({ success: true, startDate: start, endDate: end, ...report, fetchedAt: new Date().toISOString() })
    } catch (error) {
        return errorResponse(error, '応募実数の集計に失敗しました', 'Applications Actual API Error', { withMessage: true })
    }
}
