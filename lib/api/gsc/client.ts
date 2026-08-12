import { google } from 'googleapis'

/**
 * Search Console API クライアント。
 * BQ書き込み用と同じSA（ai-product-dashboard@hrs-div）を使う。
 * SAは sc-domain:x-work.jp にユーザー追加済み（2026-08-12、フル権限・読み取り用途のみで使用）。
 */

export const GSC_SITE = 'sc-domain:x-work.jp'

function getAuth() {
    const key = process.env.BQ_WRITE_SERVICE_ACCOUNT_KEY
    if (!key) throw new Error('BQ_WRITE_SERVICE_ACCOUNT_KEY is not set')
    return new google.auth.GoogleAuth({
        credentials: JSON.parse(key),
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
