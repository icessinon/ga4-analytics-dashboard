/** SEOモニタ（/api/seo-report、Search Console）の型 */

export interface SeoTotalStat {
    clicks: number
    impressions: number
    ctr: number | null
    position: number | null
    prevClicks: number
    prevImpressions: number
    prevPosition: number | null
}

export interface SeoCategoryStat extends SeoTotalStat {
    key: string
    label: string
}

export interface SeoDailyRow { date: string; clicks: number; impressions: number; position: number | null }
export interface SeoQueryRow { query: string; clicks: number; impressions: number; position: number | null }
export interface SeoPageRow { path: string; clicks: number; impressions: number; position: number | null; prevClicks: number; prevPosition: number | null }
export interface SeoAppearanceRow { type: string; label: string; clicks: number; impressions: number; position: number | null; prevClicks: number; prevImpressions: number }

export interface SeoReportReport {
    range: { startDate: string; endDate: string }
    prevRange: { startDate: string; endDate: string }
    pathFilter: string | null
    topPages: SeoPageRow[]
    searchAppearance: SeoAppearanceRow[]
    total: SeoTotalStat
    daily: SeoDailyRow[]
    categories: SeoCategoryStat[]
    topQueries: SeoQueryRow[]
}

export interface SeoReportResponse extends SeoReportReport {
    success: true
    fetchedAt: string
}
