/**
 * エンゲージメントファネルで取得しているページパス一覧を返す
 * ダッシュボードのページ選択などで利用
 */

import { NextResponse } from 'next/server'
import { exact } from '@/lib/api/ga4/filters'
import { dim, rowsOf } from '@/lib/api/ga4/rows'
import { readGa4Body } from '@/lib/http/ga4Request'
import { errorResponse } from '@/lib/http/errorResponse'
import { parseDateString } from '@/lib/utils/date'

export async function POST(request: Request) {
    try {
        const { reporter, startDate, endDate } = await readGa4Body(request, {
            propertyIdMissingMessage: 'propertyId is required',
            defaultStartDate: '28daysAgo',
            resolveDates: (s, e) => ({ startDate: parseDateString(s), endDate: parseDateString(e) }),
        })

        // time_on_page イベントが存在するページパスだけを取得（軽量クエリ）
        const report = await reporter.run({
            dimensions: ['pagePath'],
            metrics: ['eventCount'],
            dimensionFilter: exact('eventName', 'time_on_page'),
            limit: 500,
        })
        const pagePaths = rowsOf(report).map((r) => dim(r)).filter((p) => p && p !== '(not set)')

        return NextResponse.json({ success: true, pagePaths, startDate, endDate })
    } catch (error) {
        return errorResponse(error, 'ページパス一覧の取得に失敗しました', 'Engagement page-paths API error', { withMessage: true })
    }
}
