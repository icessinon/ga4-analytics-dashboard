/** GET /api/ga4/metadata（GA4 Data API の properties.getMetadata）。クライアントは import type でここを参照する */

export interface Ga4Metric {
    apiName: string
    uiName: string
    description: string
    type: string
    category: string
}

export interface Ga4Dimension {
    apiName: string
    uiName: string
    description: string
    category: string
}

export interface Ga4MetadataResponse {
    metrics: Ga4Metric[]
    dimensions: Ga4Dimension[]
}
