import { google } from 'googleapis'
import { getServiceAccountCredentials } from '@/lib/serviceAccount'

/**
 * Search Console API クライアント。
 * 統合SA（ga4-analytics-dashboard@xmile-drm）を使う。sc-domain:x-work.jp に
 * 制限付き権限でユーザー追加済み（2026-09-25。searchanalytics.query は制限付きで通る）。
 */

export const GSC_SITE = 'sc-domain:x-work.jp'

function getAuth() {
    return new google.auth.GoogleAuth({
        credentials: getServiceAccountCredentials(),
        scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    })
}

export interface GscRow {
    keys?: string[] | null
    clicks?: number | null
    impressions?: number | null
    ctr?: number | null
    position?: number | null
}

export interface GscFilter {
    dimension: 'page' | 'query' | 'country' | 'device'
    operator: 'contains' | 'equals' | 'notContains' | 'notEquals' | 'includingRegex' | 'excludingRegex'
    expression: string
}

export async function gscQuery(params: {
    startDate: string
    endDate: string
    dimensions?: string[]
    filters?: GscFilter[]
    rowLimit?: number
}): Promise<GscRow[]> {
    const client = await getAuth().getClient()
    const sc = google.searchconsole({ version: 'v1', auth: client as never })
    const res = await sc.searchanalytics.query({
        siteUrl: GSC_SITE,
        requestBody: {
            startDate: params.startDate,
            endDate: params.endDate,
            dimensions: params.dimensions ?? [],
            rowLimit: params.rowLimit ?? 1000,
            ...(params.filters && params.filters.length > 0
                ? { dimensionFilterGroups: [{ groupType: 'and', filters: params.filters }] }
                : {}),
        },
    })
    return (res.data.rows ?? []) as GscRow[]
}
