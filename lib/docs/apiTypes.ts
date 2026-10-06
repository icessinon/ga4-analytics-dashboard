/**
 * docs/api ページ用の型定義
 */

export interface ApiParam {
    name: string
    type: string
    required: boolean
    description: string
}

export interface ApiEndpoint {
    path: string
    method: string
    name: string
    description: string
    params?: ApiParam[]
    responseNote?: string
}
