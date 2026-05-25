export interface FeatureDoc {
    name: string
    href: string
    category: string
    description: string
    capabilities: string[]
    metrics?: string[]
    ai?: boolean
    apiRoute?: string
}

export const FEATURE_CATEGORIES = [
    'ユーザー分析',
    '経路・離脱分析',
    'コンバージョン・ファネル',
    'ABテスト',
    'レポート・データ',
] as const

export const FEATURE_LIST: FeatureDoc[] = [
    // ── ユーザー分析 ──
    {
        name: 'ユーザー行動タイムライン',
        href: '/user',
        category: 'ユーザー分析',
        description: 'user_pseudo_id を指定すると、そのユーザーが「いつ・どのページを見て・何を操作したか」を時系列で表示します。施策後の個別確認や CS 対応に活用できます。',
        capabilities: [
            'user_pseudo_id によるユーザー絞り込み',
            '日付グループ別イベントタイムライン',
            'ページビュー・クリック・セッション開始などのイベント種別表示',
            'ページタイトル・パラメータの確認',
        ],
        metrics: ['activeUsers', 'eventName', 'pagePath', 'pageTitle'],
        apiRoute: 'POST /api/user/timeline',
    },
    {
        name: 'ユーザーリスト・セグメントビルダー',
        href: '/user/segment-builder',
        category: 'ユーザー分析',
        description: 'デバイス・流入元・PV数などの条件を組み合わせてユーザーをフィルタリングし、該当ユーザー数と行動傾向を確認します。CRM 連携やリターゲティング施策の対象絞り込みに使います。',
        capabilities: [
            '複数条件の AND 絞り込み',
            'デバイス / OS / ブラウザ / 流入元 / 国 での絞り込み',
            'セッション数・PV数 の範囲指定',
            '該当ユーザー数と行動サマリの確認',
        ],
        metrics: ['activeUsers', 'sessions', 'screenPageViews', 'deviceCategory', 'sessionSource'],
        apiRoute: 'POST /api/user/segment-builder',
    },
    {
        name: 'コホートリテンション',
        href: '/user/cohort',
        category: 'ユーザー分析',
        description: '週別の初回訪問コホートごとに、その後の継続率をマトリクス形式で表示します。「登録後フォローメール施策の前後でDay7継続率が変わったか」などの施策評価に使います。',
        capabilities: [
            '初回訪問週ごとのコホート分類',
            'Week0〜Week8+ の継続率マトリクス',
            '期間全体の平均継続率チャート',
            '全体継続率 vs 直近コホートの比較',
        ],
        metrics: ['cohortActiveUsers', 'cohortRetentionRate'],
        apiRoute: 'POST /api/user/cohort',
    },
    {
        name: '活動スコアリング',
        href: '/user/scoring',
        category: 'ユーザー分析',
        description: 'デバイス・流入元などのセグメント軸ごとに、直近性(Recency)・頻度(Frequency)・熱量(Engagement)・深度(Depth) の4軸でスコアリングし、活性 / 休眠 / 離脱リスクに分類します。',
        capabilities: [
            '6種類のセグメント軸（デバイス・流入元・流入経路・OS・ブラウザ・国）',
            '0〜100点の正規化スコア',
            '活性（70+）/ 休眠（30-69）/ 離脱リスク（0-29）の自動分類',
            'Recency / Frequency / Engagement / Depth の詳細ブレイクダウン',
            'AI によるセグメント間の差異分析と改善施策提案',
        ],
        metrics: ['activeUsers', 'sessions', 'screenPageViews', 'engagementRate'],
        ai: true,
        apiRoute: 'POST /api/user/scoring',
    },
    {
        name: 'スティッキネス分析',
        href: '/user/stickiness',
        category: 'ユーザー分析',
        description: 'DAU / WAU / MAU の推移を可視化し、DAU/MAU 比（スティッキネス）でユーザーエンゲージメントの深さを測定します。2期間比較モードで施策前後の変化を定量評価できます。',
        capabilities: [
            'DAU / WAU / MAU の日次推移グラフ',
            'DAU/MAU スティッキネス（20%以上: 高、10-20%: 中、10%未満: 低）',
            '期間比較モード（期間A vs 期間B の指標比較と変化率）',
            '相対日数での DAU / MAU オーバーレイグラフ',
            'AI によるエンゲージメント評価と改善提案',
        ],
        metrics: ['activeUsers', 'active7DayUsers', 'active28DayUsers', 'sessions'],
        ai: true,
        apiRoute: 'POST /api/user/stickiness',
    },

    // ── 経路・離脱分析 ──
    {
        name: 'ユーザー経路分析',
        href: '/journey',
        category: '経路・離脱分析',
        description: 'GA4 の pageReferrer × sessionDefaultChannelGroup を使い、訪問からフォーム到達までの遷移フローを Sankey ダイアグラムで可視化します。フォーム到達率・離脱経路パターンも集計します。',
        capabilities: [
            'Sankey ダイアグラムによる遷移フロー（チャネル → ページカテゴリ → ゴール）',
            '上位ページ遷移パターン（カテゴリ / URL パス 切り替え）',
            '離脱経路パターン（チャネル → N-2 → N-1 → 離脱）',
            'フォーム別到達率テーブル（会員登録 / 応募 / featured）',
            'デバイス・チャネルフィルター',
            'AI による離脱要因分析と改善提案',
        ],
        metrics: ['activeUsers', 'screenPageViews', 'sessionDefaultChannelGroup', 'pageReferrer'],
        ai: true,
        apiRoute: 'POST /api/journey',
    },
    {
        name: '離脱分析',
        href: '/exit',
        category: '経路・離脱分析',
        description: 'ファネル各ステップの離脱数・離脱率と、離脱率の高いページを特定します。どのページで最も多くユーザーが離脱しているかを把握するための起点となります。',
        capabilities: [
            'ファネルステップ別の離脱数・離脱率',
            '離脱率ランキング',
            'ページ別の詳細離脱指標',
        ],
        metrics: ['sessions', 'screenPageViews', 'exitRate'],
        apiRoute: 'POST /api/exit',
    },

    // ── コンバージョン・ファネル ──
    {
        name: 'エントリーフォームファネル',
        href: '/funnel',
        category: 'コンバージョン・ファネル',
        description: 'フォームの各ステップ（表示→入力→確認→完了）の通過率と離脱率を測定します。期間比較で施策前後の CVR 変化を定量評価できます。',
        capabilities: [
            'ステップ別ユーザー数・CVR・離脱率',
            '期間比較ファネル（A/B 期間の並列表示）',
            'ステップ間の落ち込み可視化',
            'AI によるファネル評価・期間比較インサイト',
        ],
        metrics: ['activeUsers', 'eventCount'],
        ai: true,
        apiRoute: 'GET /api/funnel/entry-form',
    },
    {
        name: 'エンゲージメントファネル',
        href: '/funnel/engagement',
        category: 'コンバージョン・ファネル',
        description: 'ページ滞在時間の長さ（10秒 / 30秒 / 60秒 / 3分以上）をファネル形式で可視化し、コンテンツへの深いエンゲージメントを測定します。',
        capabilities: [
            '滞在時間しきい値別の到達率（10s / 30s / 60s / 180s）',
            '複数ページの比較',
            'AI によるエンゲージメント傾向分析',
        ],
        metrics: ['userEngagementDuration', 'activeUsers'],
        ai: true,
        apiRoute: 'GET /api/funnel/engagement',
    },

    // ── ABテスト ──
    {
        name: 'ABテスト',
        href: '/ab-test',
        category: 'ABテスト',
        description: 'GA4 データをソースとした A/B テストの管理・実行・評価を行います。統計的有意差検定（Z検定）・サンプルサイズ・改善率の判定基準を設定し、AI が勝者の推奨を補足します。',
        capabilities: [
            'テスト作成・編集・ステータス管理（running / paused / completed）',
            'Z検定による統計的有意差判定',
            'サンプルサイズ・テスト期間・改善率の合否チェック',
            'スケジュール実行・Webhook 通知',
            '勝者判定後の AI 評価コメント',
            'セグメント別（デバイス / チャネルなど）の内訳確認',
        ],
        ai: true,
        apiRoute: 'GET /api/ab-test, POST /api/ab-test/evaluate',
    },

    // ── レポート・データ ──
    {
        name: '月次インサイトレポート',
        href: '/insights',
        category: 'レポート・データ',
        description: '今月と先月の主要 KPI（アクティブユーザー・セッション・エンゲージメント率・PV など）を自動集計し、AI がサマリー・改善点・来月の推奨アクションを生成します。',
        capabilities: [
            '今月 vs 先月の KPI 比較テーブル（前月比%付き）',
            '今月の上位ページ（PV順）',
            'AI による月次インサイトレポート生成（サマリー / 良い点 / 注意点 / 推奨アクション）',
        ],
        metrics: ['activeUsers', 'newUsers', 'sessions', 'engagementRate', 'averageSessionDuration', 'screenPageViews'],
        ai: true,
        apiRoute: 'POST /api/insights',
    },
    {
        name: 'トレンド分析',
        href: '/trend',
        category: 'レポート・データ',
        description: '月次・週次の PV / CV / CVR 推移をレポートテンプレートごとに集計します。AI が月による傾向・落ち込み期間・改善期間を分析します。',
        capabilities: [
            '月次 CVR トレンドグラフ',
            '週次内訳での詳細推移',
            'AI による月別傾向分析（落ち込み月・好調月の特定）',
        ],
        metrics: ['sessions', 'eventCount', 'cvr'],
        ai: true,
        apiRoute: 'GET /api/trend/monthly',
    },
    {
        name: 'GA4分析',
        href: '/analytics',
        category: 'レポート・データ',
        description: 'GA4 のデータをレポートテンプレートに基づいて集計します。セッション・PV・CVR・エンゲージメント率・直帰率などを表示します。',
        capabilities: [
            'テンプレート別のGA4レポート集計',
            'A/B テストとのデータ連動',
            'エクスポート対応',
        ],
        apiRoute: 'GET /api/analytics/report',
    },
    {
        name: 'ヒートマップ',
        href: '/heatmap',
        category: 'レポート・データ',
        description: 'GTM 経由で収集したクリック座標・スクロール深度をヒートマップとして可視化します。ページのどの要素が注目されているかを視覚的に把握できます。',
        capabilities: [
            'クリックヒートマップ（座標密度表示）',
            'スクロール深度マップ',
            'ビュー別ラベル管理',
        ],
        apiRoute: 'GET /api/heatmap/view-labels',
    },
]
