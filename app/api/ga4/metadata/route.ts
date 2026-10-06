import { NextResponse } from 'next/server'
import { getGA4AccessToken } from '@/lib/api/ga4/client'
import { HttpError, errorResponse } from '@/lib/http/errorResponse'
import { fetchGa4Metadata } from '@/lib/services/ga4Catalog/metadataService'

/** プロパティで使えるメトリクス・ディメンション一覧（GA4 メタデータページ） */
export async function GET(request: Request) {
    try {
        const propertyId = new URL(request.url).searchParams.get('propertyId')
        if (!propertyId) throw new HttpError(400, 'propertyId is required')
        const metadata = await fetchGa4Metadata(propertyId, await getGA4AccessToken())
        return NextResponse.json(metadata)
    } catch (error) {
        return errorResponse(error, 'Failed to fetch GA4 metadata', 'GA4 Metadata API Error', { withMessage: true })
    }
}
