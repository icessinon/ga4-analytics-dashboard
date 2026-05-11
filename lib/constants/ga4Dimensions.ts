/**
 * GA4ディメンションの定数
 * 選択可能なディメンションのリスト
 */

export const GA4_CVR_DIMENSIONS = [
    { value: 'customEvent:view_label', label: 'view_label' },
    { value: 'customEvent:click_label', label: 'click_label' },
]

export const GA4_FILTER_DIMENSIONS = [
    // 日付・時間
    { value: 'date', label: '日付' },
    { value: 'dateHour', label: '日付と時刻（時まで）' },
    { value: 'dateHourMinute', label: '日付と時刻（時・分）' },
    { value: 'day', label: '日（1〜31）' },
    { value: 'dayOfWeek', label: '曜日（0=日曜〜6=土曜）' },
    { value: 'dayOfWeekName', label: '曜日（月曜・火曜…）' },
    { value: 'hour', label: '時（0〜23）' },
    { value: 'minute', label: '分' },
    { value: 'month', label: '月（1〜12）' },
    { value: 'week', label: '週（日曜始まり）' },
    { value: 'year', label: '年' },
    { value: 'yearMonth', label: '年と月' },
    { value: 'yearWeek', label: '年と週' },
    { value: 'isoWeek', label: '週番号（1年の何週目か・月曜始まり）' },
    { value: 'isoYear', label: '週の属する年（年末年始の週用）' },
    { value: 'isoYearIsoWeek', label: '年と週番号' },
    // イベント関連
    { value: 'eventName', label: 'イベント名' },
    { value: 'isKeyEvent', label: 'コンバージョンかどうか' },
    // 地理関連
    { value: 'country', label: '国' },
    { value: 'countryId', label: '国（ID）' },
    { value: 'city', label: '市区町村' },
    { value: 'cityId', label: '市区町村（ID）' },
    { value: 'region', label: '都道府県・地域' },
    { value: 'continent', label: '大陸' },
    { value: 'continentId', label: '大陸（ID）' },
    // デバイス関連
    { value: 'deviceCategory', label: 'デバイス種別（PC/スマホ/タブレット）' },
    { value: 'deviceModel', label: '端末モデル名' },
    { value: 'mobileDeviceBranding', label: 'スマホ・タブレットのブランド' },
    { value: 'mobileDeviceMarketingName', label: 'スマホ・タブレットの機種名' },
    { value: 'mobileDeviceModel', label: 'スマホ・タブレットのモデル' },
    { value: 'operatingSystem', label: 'OS（Windows / iOS など）' },
    { value: 'operatingSystemVersion', label: 'OSのバージョン' },
    { value: 'operatingSystemWithVersion', label: 'OSとバージョン' },
    { value: 'browser', label: 'ブラウザ（Chrome / Safari など）' },
    { value: 'screenResolution', label: '画面の解像度' },
    { value: 'platform', label: 'プラットフォーム' },
    { value: 'platformDeviceCategory', label: 'プラットフォームとデバイス種別' },
    // ページ関連
    { value: 'pagePath', label: 'ページのパス（URLのパス部分）' },
    { value: 'pagePathPlusQueryString', label: 'ページパス（?以降のクエリ含む）' },
    { value: 'pageTitle', label: 'ページのタイトル' },
    { value: 'pageLocation', label: '閲覧したページのURL' },
    { value: 'pageReferrer', label: 'どのページから来たか（参照元URL）' },
    { value: 'landingPage', label: '最初に開いたページのパス' },
    { value: 'landingPagePlusQueryString', label: '最初に開いたページ（クエリ含む）' },
    { value: 'fullPageUrl', label: 'ページの完全なURL' },
    { value: 'hostName', label: 'サイトのドメイン（ホスト名）' },
    { value: 'unifiedPagePathScreen', label: 'ページ/画面パス（Web・アプリ共通）' },
    { value: 'unifiedPageScreen', label: '画面（Web・アプリ共通）' },
    // トラフィックソース関連
    { value: 'source', label: '流入元（どこから来たか）' },
    { value: 'medium', label: 'メディア（organic / cpc など）' },
    { value: 'sourceMedium', label: '流入元とメディア' },
    { value: 'sourcePlatform', label: '流入元のプラットフォーム' },
    { value: 'campaign', label: 'キャンペーン名' },
    { value: 'campaignId', label: 'キャンペーンID' },
    { value: 'campaignName', label: 'キャンペーン名' },
    { value: 'sessionSource', label: 'セッションの流入元' },
    { value: 'sessionMedium', label: 'セッションのメディア' },
    { value: 'sessionSourceMedium', label: 'セッションの流入元・メディア' },
    { value: 'sessionSourcePlatform', label: 'セッションの流入元プラットフォーム' },
    { value: 'sessionCampaign', label: 'セッションのキャンペーン' },
    { value: 'sessionCampaignId', label: 'セッションのキャンペーンID' },
    { value: 'sessionCampaignName', label: 'セッションのキャンペーン名' },
    { value: 'sessionDefaultChannelGroup', label: '流入チャネル（Organic / Paid など）' },
    { value: 'sessionPrimaryChannelGroup', label: '主要な流入チャネル' },
    { value: 'defaultChannelGroup', label: 'チャネルグループ' },
    { value: 'primaryChannelGroup', label: '主要チャネルグループ' },
    // ユーザー関連
    { value: 'userAgeBracket', label: '年齢層' },
    { value: 'userGender', label: '性別' },
    { value: 'newVsReturning', label: '新規ユーザーかリピーターか' },
    { value: 'firstSessionDate', label: '初めて訪問した日' },
    { value: 'signedInWithUserId', label: 'ログインしているユーザーID' },
    // 言語関連
    { value: 'language', label: '言語' },
    { value: 'languageCode', label: '言語コード（ja / en など）' },
    // その他
    { value: 'streamId', label: 'データストリームのID' },
    { value: 'streamName', label: 'データストリーム名' },
    { value: 'contentGroup', label: 'コンテンツのグループ名' },
    { value: 'contentId', label: 'コンテンツのID' },
    { value: 'contentType', label: 'コンテンツの種類' },
]

// 全ディメンション（後方互換性のため）
export const GA4_DIMENSIONS = [
    ...GA4_CVR_DIMENSIONS,
    ...GA4_FILTER_DIMENSIONS,
]

export const GA4_METRICS = [
    { value: 'eventCount', label: 'eventCount' },
    { value: 'totalUsers', label: 'totalUsers' },
    { value: 'activeUsers', label: 'activeUsers' },
    { value: 'sessions', label: 'sessions' },
    { value: 'screenPageViews', label: 'screenPageViews' },
    { value: 'conversions', label: 'conversions' },
    { value: 'totalRevenue', label: 'totalRevenue' },
    { value: 'purchaseRevenue', label: 'purchaseRevenue' },
    { value: 'averageSessionDuration', label: 'averageSessionDuration' },
    { value: 'bounceRate', label: 'bounceRate' },
    { value: 'engagementRate', label: 'engagementRate' },
]

export const GA4_FILTER_OPERATORS = [
    { value: 'EXACT', label: '完全に一致' },
    { value: 'BEGINS_WITH', label: '前方一致' },
    { value: 'ENDS_WITH', label: '後方一致' },
    { value: 'CONTAINS', label: '部分一致（正規表現は使用不可）' },
    { value: 'FULL_REGEXP', label: '完全一致（正規表現）' },
    { value: 'PARTIAL_REGEXP', label: '部分一致（正規表現）' },
]

/**
 * ディメンション名を表示用に変換
 * customEvent:view_label → view_label
 */
export function formatDimensionLabel(dimension: string): string {
    if (dimension.startsWith('customEvent:')) {
        return dimension.replace('customEvent:', '')
    }
    return dimension
}

/**
 * 表示用ラベルから実際のディメンション値を取得
 * view_label → customEvent:view_label
 */
export function getDimensionValue(label: string): string {
    // 既に customEvent: が含まれている場合はそのまま返す
    if (label.startsWith('customEvent:')) {
        return label
    }
    // カスタムイベントの可能性が高い場合は customEvent: を付ける
    if (label.includes('_label') || label.includes('_dimension')) {
        return `customEvent:${label}`
    }
    return label
}
