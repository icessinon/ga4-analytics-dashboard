/**
 * GA4メトリクスとディメンションの日本語説明
 */

export const METRIC_DESCRIPTIONS: Record<string, string> = {
    'eventCount': 'イベントの発生回数',
    'totalUsers': 'ユーザー数（重複なし）',
    'activeUsers': 'アクティブユーザー数',
    'sessions': 'セッション数',
    'screenPageViews': 'ページビュー数',
    'conversions': 'コンバージョン数',
    'totalRevenue': '総収益',
    'purchaseRevenue': '購入収益',
    'averageSessionDuration': '平均セッション時間',
    'bounceRate': '直帰率',
    'engagementRate': 'エンゲージメント率',
    'newUsers': '新規ユーザー数',
    'engagedSessions': 'エンゲージメントセッション数',
    'eventValue': 'イベント値',
    'userEngagementDuration': 'ユーザーエンゲージメント時間',
}

export const DIMENSION_DESCRIPTIONS: Record<string, string> = {
    'date': '日付',
    'eventName': 'イベント名',
    'country': '国',
    'city': '都市',
    'deviceCategory': 'デバイスカテゴリ（デスクトップ、モバイル、タブレット）',
    'operatingSystem': 'オペレーティングシステム',
    'browser': 'ブラウザ',
    'pagePath': 'ページパス',
    'pageTitle': 'ページタイトル',
    'source': 'トラフィックソース',
    'medium': 'メディア',
    'campaign': 'キャンペーン',
    'sessionDefaultChannelGroup': 'デフォルトチャネルグループ',
    'sessionSource': 'セッションのトラフィックソース',
    'sessionMedium': 'セッションのメディア',
    'sessionCampaign': 'セッションのキャンペーン',
    'userAgeBracket': 'ユーザーの年齢層',
    'userGender': 'ユーザーの性別',
    'newVsReturning': '新規ユーザー/リピーター',
    'landingPage': 'ランディングページ',
    'pageReferrer': '参照元ページ',
    'language': '言語',
    'languageCode': '言語コード',
    'region': '地域',
    'continent': '大陸',
    'platform': 'プラットフォーム',
    'screenResolution': '画面解像度',
    'customEvent:view_label': 'カスタムイベント: データビューラベル',
    'customEvent:click_label': 'カスタムイベント: データクリックラベル',
    'customEvent:data_time_label': 'カスタムイベント: データタイムラベル',
}

/**
 * メトリクスまたはディメンションの説明を日本語で取得
 */
export function getJapaneseDescription(
    apiName: string,
    englishDescription: string,
    type: 'metric' | 'dimension'
): string {
    const translations = type === 'metric' ? METRIC_DESCRIPTIONS : DIMENSION_DESCRIPTIONS
    
    if (translations[apiName]) {
        return translations[apiName]
    }
    
    if (apiName.startsWith('customEvent:')) {
        const customEventName = apiName.replace('customEvent:', '')
        if (translations[apiName]) {
            return translations[apiName]
        }
        return `カスタムイベント: ${customEventName}`
    }
    
    if (!englishDescription || englishDescription.trim() === '') {
        return '説明なし'
    }
    
    return englishDescription
}
