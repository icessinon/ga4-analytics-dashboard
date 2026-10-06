import { NextResponse } from 'next/server'
import { getGA4AccessToken } from '@/lib/api/ga4/client'
import { createGa4Reporter } from '@/lib/api/ga4/report'
import { HttpError, errorResponse } from '@/lib/http/errorResponse'
import { runLabelCatalog } from '@/lib/services/ga4Catalog/labelCatalogService'

/** click_label / view_label の値一覧（直近 90 日）。LabelContext が補完候補に使う */
export async function GET(request: Request) {
    try {
        const propertyId = new URL(request.url).searchParams.get('propertyId')
        if (!propertyId) throw new HttpError(400, 'propertyId is required')

        const reporter = createGa4Reporter({
            propertyId,
            accessToken: await getGA4AccessToken(),
            dateRanges: [{ startDate: '90daysAgo', endDate: 'yesterday' }],
        })
        const labels = await runLabelCatalog(reporter)
        return NextResponse.json({ labels })
    } catch (error) {
        return errorResponse(error, 'Failed to fetch labels', 'GA4 labels API error', { withMessage: true })
    }
}
