/**
 * GA4 API クライアント
 * 元のGASコードのfetchData関数を参考に実装
 */

export interface GA4ReportRequest {
    propertyId: string;
    dateRanges: Array<{ startDate: string; endDate: string }>;
    dimensions?: string[] | Array<{ name: string }>;
    metrics: string[] | Array<{ name: string }>;
    dimensionFilter?: Record<string, unknown>;
    limit?: number;
}

export interface GA4ReportResponse {
    dimensionHeaders: Array<{ name: string }>;
    metricHeaders: Array<{ name: string; type: string }>;
    rows: Array<{
        dimensionValues: Array<{ value: string }>;
        metricValues: Array<{ value: string }>;
    }>;
    rowCount: number;
}

/**
 * GA4 Data APIからデータを取得
 * @param request - GA4レポートリクエスト（プロパティID、日付範囲、ディメンション、メトリクスなど）
 * @param accessToken - GA4アクセストークン
 * @returns GA4レポートレスポンス（ディメンション、メトリクス、行データ）
 * @throws {Error} APIリクエストが失敗した場合
 */
export async function fetchGA4Data(
    request: GA4ReportRequest,
    accessToken: string
): Promise<GA4ReportResponse> {
    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${request.propertyId}:runReport`;

    /**
     * dimensionsを正しい形式に変換
     */
    const formatDimensions = (dims?: string[] | Array<{ name: string }>) => {
        if (!dims || dims.length === 0) return undefined
        const isObjectFormat = dims.length > 0 && typeof dims[0] === 'object' && 'name' in dims[0]
        if (isObjectFormat) {
            return dims as Array<{ name: string }>
        }
        return (dims as string[]).map((dim) => ({ name: dim }))
    }

    /**
     * metricsを正しい形式に変換
     */
    const formatMetrics = (mets: string[] | Array<{ name: string }>) => {
        if (!mets || mets.length === 0) return []
        const isObjectFormat = mets.length > 0 && typeof mets[0] === 'object' && 'name' in mets[0]
        if (isObjectFormat) {
            return mets as Array<{ name: string }>
        }
        return (mets as string[]).map((met) => ({ name: met }))
    }

    const body: {
        dateRanges: typeof request.dateRanges
        dimensionFilter?: typeof request.dimensionFilter
        limit: number
        dimensions?: Array<{ name: string }>
        metrics: Array<{ name: string }>
    } = {
        dateRanges: request.dateRanges,
        dimensionFilter: request.dimensionFilter,
        limit: request.limit || 10000,
        metrics: [],
    }

    // dimensionsが存在する場合のみ追加
    const formattedDimensions = formatDimensions(request.dimensions)
    if (formattedDimensions && formattedDimensions.length > 0) {
        body.dimensions = formattedDimensions
    }

    // metricsは必須
    body.metrics = formatMetrics(request.metrics)

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`GA4 API Error: ${error.error?.message || response.statusText}`);
    }

    return response.json();
}

/**
 * GA4 API認証（OAuth2）
 * GASコードのAnalyticsDataサービスと同じように動作するように実装
 * 
 * GASでは、Apps Scriptエディタで「サービス」→「Google Analytics Data API」を有効化すると
 * 自動的にOAuth2認証が行われ、アクセストークンの管理はGoogle側で行われます。
 * ユーザーは最初に一度だけ認証を許可するだけで、その後は自動的に認証されます。
 * 
 * @param customToken - カスタムアクセストークン（フォームから入力された場合）
 * @returns GA4アクセストークン
 * @throws {Error} 認証情報が設定されていない場合
 */
export async function getGA4AccessToken(customToken?: string): Promise<string> {
    // カスタムトークンが提供されている場合はそれを使用（フォームから入力）
    // 空文字列の場合は undefined として扱う
    if (customToken && customToken.trim() !== '') {
        if (typeof customToken !== 'string') {
            throw new Error('Custom token must be a string')
        }
        return customToken
    }
    
    // 環境変数から直接アクセストークンを取得（一時的）
    const token = process.env.GA4_ACCESS_TOKEN
    if (token && token !== '') {
        if (typeof token !== 'string') {
            throw new Error('GA4_ACCESS_TOKEN must be a string')
        }
        return token
    }

    // OAuth2認証を試行（サービスアカウントまたはOAuth2）
    try {
        const { getGA4AccessTokenAuto } = await import('./oauth')
        const autoToken = await getGA4AccessTokenAuto()
        if (typeof autoToken !== 'string') {
            throw new Error(`Expected string token but got ${typeof autoToken}: ${String(autoToken)}`)
        }
        return autoToken
    } catch (error) {
        throw new Error(
            'GA4認証情報が設定されていません。\n\n' +
            '以下のいずれかで認証してください（設定は .env または .env.local に記載。Docker の場合は .env）：\n' +
            '1. 画面上のフォームからアクセストークンを直接入力\n' +
            '2. GA4_ACCESS_TOKEN を設定\n' +
            '3. GA4_SERVICE_ACCOUNT_KEY（サービスアカウントのJSONを1行の文字列で）を設定\n' +
            '4. GA4_SERVICE_ACCOUNT_KEY_PATH（キーファイルのパス。Docker の場合はファイルをマウントするか 3 を推奨）\n' +
            '5. GA4_CLIENT_ID / GA4_CLIENT_SECRET / GA4_REFRESH_TOKEN（OAuth2）を設定\n\n' +
            'Google Cloud で「Google Analytics Data API」を有効化し、上記のいずれかの認証情報を用意してください。'
        )
    }
}
