/**
 * プロパティで使えるメトリクス・ディメンションの一覧（GA4 Data API の metadata エンドポイント）。
 * runReport ではないので fetchGA4Data を通さず直接叩く。
 * ※ サーバー専用
 */

import type { Ga4MetadataResponse } from './metadataTypes'

export async function fetchGa4Metadata(propertyId: string, accessToken: string): Promise<Ga4MetadataResponse> {
    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}/metadata`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        throw new Error(`GA4 Metadata API Error: ${error.error?.message || res.statusText}`)
    }
    const metadata = await res.json()
    return { metrics: metadata.metrics || [], dimensions: metadata.dimensions || [] }
}
