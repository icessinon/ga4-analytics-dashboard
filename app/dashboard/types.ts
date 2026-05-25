export interface DailyStat {
    date: string
    reportExecutions: number
    funnelExecutions: number
    sessions: number
    heatmapEvents: number
}

export interface AbTestCountByStatus {
    running: number
    paused: number
    completed: number
}

export interface AbTestCompletedOutcome {
    victory: number
    defeat: number
}

export interface DashboardStats {
    month: string
    productCount: number
    abTestCount: number
    abTestVictoryCount: number
    abTestAddedThisMonth: number
    abTestCountByStatus: AbTestCountByStatus
    abTestCompletedOutcome: AbTestCompletedOutcome
    funnelConfigCount: number
    recentSessionCount: number
    recentHeatmapEventCount: number
    recentReportExecutionCount: number
    funnelExecutionCount: number
    dailyStats: DailyStat[]
}

export interface PageMetrics {
    pv: number
    cv: number
    cvr: number
    sessions: number
    newUsers: number
    newUserRate: number
    bounceRate: number
    bounceCount: number
    exitRate: number | null
    exitRateNote?: string
    averageSessionDurationSeconds: number
    averageSessionDurationLabel: string
    engagementRate: number
    cvEventName?: string
    cvDimension?: string
}

export interface MonthOption {
    value: string
    label: string
}

/** ページ指標の時系列1点（API series の要素）。グラフ用に t を付与したものが SeriesDataPoint */
export interface SeriesDataPoint {
    period: string
    label: string
    t: number
    pv: number
    cv: number
    sessions: number
    cvr?: number
    newUsers?: number
    newUserRate?: number
    bounceRate?: number
    bounceCount?: number
    averageSessionDuration?: number
    engagementRate?: number
    exitRate?: number
}

/** API から返る series 1件（t なし） */
export type PageMetricsSeriesPoint = Omit<SeriesDataPoint, 't'>

/** 推移グラフで選択可能なメトリクス */
export type ChartMetric =
    | 'pv'
    | 'cv'
    | 'cvr'
    | 'sessions'
    | 'exitRate'
    | 'newUserRate'
    | 'bounceRate'
    | 'bounceCount'
    | 'averageSessionDuration'
    | 'engagementRate'

export const CV_DIMENSION_OPTIONS: { value: string; label: string }[] = [
    { value: 'eventName', label: 'イベント名 (eventName)' },
    { value: 'customEvent:click_label', label: 'クリックラベル (click_label)' },
    { value: 'customEvent:view_label', label: 'ビューラベル (view_label)' },
]

export interface QuickAccessItem {
    title: string
    subtitle: string
    getHref: (productId?: number) => string
    productPrefix?: boolean
}

export interface QuickAccessGroup {
    label: string
    items: QuickAccessItem[]
}

export const QUICK_ACCESS_GROUPS: QuickAccessGroup[] = [
    {
        label: '設定',
        items: [
            { title: 'プロダクト管理', subtitle: 'プロダクトの設定と管理', getHref: () => '/products' },
        ],
    },
    {
        label: '分析・レポート',
        items: [
            { title: 'GA4分析', subtitle: 'GA4データの分析とレポート', getHref: () => '/analytics', productPrefix: true },
            { title: 'トレンド', subtitle: '月次トレンドレポート（PV/CV/CVR推移）', getHref: (id) => id ? `/trend?productId=${id}` : '/trend', productPrefix: true },
            { title: 'ABテスト', subtitle: 'ABテスト結果の分析と評価', getHref: (id) => id ? `/ab-test?productId=${id}` : '/ab-test', productPrefix: true },
            { title: '月次インサイトレポート', subtitle: '今月のKPIサマリーと前月比較・AIインサイト', getHref: () => '/insights', productPrefix: true },
        ],
    },
    {
        label: 'ファネル',
        items: [
            { title: 'エントリーフォームファネル', subtitle: 'フォーム完了までの導線分析', getHref: (id) => id ? `/funnel?productId=${id}` : '/funnel', productPrefix: true },
            { title: 'エンゲージメント', subtitle: 'エンゲージメントファネル分析', getHref: (id) => id ? `/funnel/engagement?productId=${id}` : '/funnel/engagement', productPrefix: true },
        ],
    },
    {
        label: '可視化',
        items: [
            { title: 'ヒートマップ', subtitle: 'クリック位置とスクロール深度の可視化', getHref: (id) => id ? `/heatmap?productId=${id}` : '/heatmap', productPrefix: true },
            { title: 'ユーザー経路分析', subtitle: '来訪から会員登録完了までのフロー可視化', getHref: () => '/journey', productPrefix: true },
            { title: '離脱分析', subtitle: 'ファネルの各ステップの離脱数・離脱率の高いページを特定', getHref: () => '/exit', productPrefix: true },
        ],
    },
    {
        label: 'ユーザー分析',
        items: [
            { title: 'セグメント行動分析', subtitle: 'デバイス・ブラウザ・流入元別の行動タイムライン', getHref: () => '/user', productPrefix: true },
            { title: 'コホートリテンション', subtitle: '初回訪問週ごとの継続率マトリクス', getHref: () => '/user/cohort', productPrefix: true },
            { title: 'ユーザーリスト抽出', subtitle: '条件を組み合わせてセグメントのユーザー数・行動傾向を確認', getHref: () => '/user/segment-builder', productPrefix: true },
            { title: '活動スコアリング', subtitle: 'セグメントごとの活性度を0〜100点でスコアリング（活性/休眠/離脱リスク分類）', getHref: () => '/user/scoring', productPrefix: true },
            { title: 'スティッキネス分析', subtitle: 'DAU/WAU/MAUの推移とエンゲージメント深度', getHref: () => '/user/stickiness', productPrefix: true },
        ],
    },
    {
        label: 'データ・履歴',
        items: [
            { title: 'ABテスト完了一覧', subtitle: '完了したABテストの勝利・負けと改善率', getHref: (id) => id ? `/ab-test/completed?productId=${id}` : '/ab-test/completed', productPrefix: true },
            { title: '履歴一覧', subtitle: 'レポートとファネル分析の履歴を確認', getHref: (id) => id ? `/history?productId=${id}` : '/history', productPrefix: true },
            { title: 'GA4データ閲覧', subtitle: 'GA4の生データを期間別で閲覧', getHref: () => '/data', productPrefix: true },
            { title: 'GA4メタデータ', subtitle: '利用可能なメトリクスとディメンション一覧', getHref: () => '/ga4-metadata', productPrefix: true },
            { title: 'AI利用状況', subtitle: 'AI API使用量・コスト確認', getHref: () => '/ai-usage' },
        ],
    },
    {
        label: 'ドキュメント',
        items: [
            { title: 'API ドキュメント', subtitle: 'API エンドポイント一覧と説明', getHref: () => '/docs/api' },
            { title: '機能ドキュメント', subtitle: '全機能の概要・使い方・GA4メトリクス一覧', getHref: () => '/docs/features' },
        ],
    },
]
