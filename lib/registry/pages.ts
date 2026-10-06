import { CATEGORY_IDS, CATEGORIES, type CategoryId } from './categories'

/**
 * ページの正。サイドバー・トップのクイックアクセス・機能ドキュメント・AI Q&A・
 * ページヘッダ・関連導線はすべてここから引く。
 *
 * - PAGE_IDS に足して PAGES に書き忘れる（逆も）と型エラー
 * - nav を省略したページは doc 必須（判別共用体）。サイドバーに載るのに機能ドキュメントに無い、を防ぐ
 * - scripts/check-page-registry.ts が app/**\/page.tsx と突合し、未登録を CI で落とす
 */

export const PAGE_IDS = [
    // settings
    'products',
    'alerts',
    // kpi
    'trend',
    'insights',
    'cvValue',
    // cv
    'cvTypes',
    'occupation',
    'applyFields',
    // channel
    'seoReport',
    'lineReport',
    'utmReport',
    'signupStepMails',
    // abtest
    'abTest',
    'abTestAdvisor',
    'abTestCompleted',
    // funnel
    'signupFunnel',
    'funnel',
    'scout',
    'funnelEngagement',
    'funnelPath',
    // visual
    'heatmap',
    'journey',
    'exit',
    'pageflow',
    'listPerformance',
    // users
    'persona',
    'userFlow',
    'user',
    'userCohort',
    'userSegmentBuilder',
    'userScoring',
    'userStickiness',
    // tools
    'analytics',
    'data',
    'ga4Metadata',
    'history',
    'aiUsage',
    // docs
    'docsApi',
    'docsFeatures',
    'docsGlossary',
    // ナビ非表示（詳細・動的）
    'dashboard',
    'abTestDetail',
    'abTestDaily',
    'abTestSegment',
    'funnelHistory',
    'funnelExecution',
    'reportsHistory',
    'reportDetail',
] as const
export type PageId = (typeof PAGE_IDS)[number]

/** 関連導線の導出に使う分類タグ。1 ページ 1〜3 個 */
export const TAGS = [
    'cv', 'apply', 'signup', 'form', 'path', 'exit', 'channel', 'money', 'bq',
    'seo', 'line', 'scout', 'utm', 'occupation', 'engagement', 'retention', 'abtest', 'ai', 'rawdata',
] as const
export type Tag = (typeof TAGS)[number]

/** 機能ドキュメントの本文 */
export interface FeatureDocBody {
    description: string
    capabilities: readonly string[]
    /** 使用する GA4 メトリクス・ディメンション */
    metrics?: readonly string[]
    /** 数値を読むときの注意点（計測の限界・突合キーなど） */
    notes?: readonly string[]
    /** AI による分析・生成を含む */
    ai?: boolean
    apiRoute?: string
}

interface PageDefBase {
    /** 静的パス、または Next.js の動的セグメント記法（例 '/ab-test/[id]'） */
    href: string
    title: string
    subtitle: string
    category: CategoryId
    /** トップカードの説明に「{プロダクト名}の」を前置する */
    productScoped?: boolean
    /** href に ?productId= を付ける（従来 7 ページだけが付けていた挙動を維持） */
    productIdInHref?: boolean
    /** BackLink の戻り先。省略時はダッシュボード */
    parent?: PageId
    tags?: readonly Tag[]
    /** 明示の関連ページ（タグ導出より優先して先頭に並ぶ。最大 3） */
    related?: readonly PageId[]
}

/** サイドバーに載せるページ。機能ドキュメントが必須 */
interface NavPageDef extends PageDefBase {
    nav?: true
    doc: FeatureDocBody
}

/** 詳細・動的ページ。サイドバーに載せず、ドキュメントは任意 */
interface HiddenPageDef extends PageDefBase {
    nav: false
    doc?: FeatureDocBody
}

export type PageDef = NavPageDef | HiddenPageDef

export const PAGES: Record<PageId, PageDef> = {

    // ── settings ──
    products: {
        href: '/products',
        title: 'プロダクト管理',
        subtitle: 'プロダクトの設定と管理',
        category: 'settings',
        doc: {
            description: 'ダッシュボードが扱うプロダクト（GA4プロパティ）の登録・編集。各ページの「プロダクト」セレクタの選択肢になる。',
            capabilities: [
                'プロダクト名・GA4プロパティIDの登録・編集',
                'サイドバー上部のプロダクト切替の元データ',
            ],
        },
    },
    alerts: {
        href: '/alerts',
        title: 'アラート設定',
        subtitle: 'CV急落アラートのしきい値・監視対象指標の設定',
        category: 'settings',
        tags: ['cv'],
        doc: {
            description: '毎日 09:30 JST に前日の指標を過去8週の同一曜日の中央値と比較してSlack通知します。全体指標（セッション・CV・CVR）の急落に加え、セグメント別（ページカテゴリ別の閲覧、CV種別×チャネル別）は急増（スパイク）も検知します。SEO順位変動・キャンペーン・bot流入・タグ事故は全体値に埋もれてセグメント単位で先に現れるため。',
            capabilities: [
                '曜日変動対策（過去8週の同一曜日と比較）・スパイク対策（平均でなく中央値）',
                '全体指標の急落検知: セッション数 / 応募CV / LP応募CV / 会員登録CV / 全体CVR（しきい値デフォルト-30%）',
                'ページカテゴリ別の急増・急落検知: 求人詳細 / 検索・一覧 / TOP / コラム / 会員登録フォーム / 応募フォーム の閲覧ユーザー（急増はデフォルト+50%、CV_SPIKE_ALERT_THRESHOLDで変更可）。発火時は変動に効いた個別ページ上位5件を添付',
                'CV種別×チャネル別の急増・急落検知: 応募CV/LP応募CV/会員登録CV × sessionDefaultChannelGroup（例: 会員登録CV×Organic Searchの急増）',
                'しきい値未満のノイズ除去（ベースラインが小さすぎるセグメントは判定しない。急増側はベースラインほぼ0からの出現も拾う）',
                '統計ガード: %しきい値に加えて中央値からポアソン3σ以上の乖離を必須化。中央値が小さい指標・セグメントが日次ゆらぎ（±√n）で発火し続けるのを防ぐ（バックテスト実測で誤報75%削減: 2.8件/日→0.7件/日。全体指標側にも適用、CVRは期待CV数との乖離で判定）',
                '発火時の原因ドリルダウン（チャネル別・デバイス別・ページ別の下落幅内訳を自動集計）',
                'AI 原因仮説（内訳データと整合する原因候補と確認ポイントを生成）',
                'Slack 通知（📊セグメント変動は急増/急落をまとめて1メッセージ、🚨全体CV急落は従来どおり）',
                'プロダクト別設定画面（有効/無効・下落しきい値・最小ベースライン・監視対象の指標/セグメントのトグル）',
            ],
            metrics: ['sessions', 'totalUsers', 'sessionDefaultChannelGroup', 'deviceCategory'],
            ai: true,
            apiRoute: 'POST /api/alerts/cv-drop',
        },
    },

    // ── kpi ──
    trend: {
        href: '/trend',
        title: 'トレンド',
        subtitle: '月次トレンドレポート（PV/CV/CVR推移）',
        category: 'kpi',
        productScoped: true,
        productIdInHref: true,
        tags: ['cv'],
        doc: {
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
    },
    insights: {
        href: '/insights',
        title: '月次インサイトレポート',
        subtitle: '今月のKPIサマリーと前月比較・AIインサイト',
        category: 'kpi',
        productScoped: true,
        tags: ['cv', 'ai'],
        doc: {
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
    },
    cvValue: {
        href: '/cv-value',
        title: 'CV単価・お金まわり',
        subtitle: '応募・会員登録1件の期待売上と期間CVの金額換算（施策の価値比較用）',
        category: 'kpi',
        productScoped: true,
        tags: ['cv', 'money'],
        doc: {
            description: '応募・会員登録1件あたりの期待売上（CV単価）と、期間のCV数を金額換算した早見ページ。施策の価値比較・優先度判断の共通モノサシとして使います。係数はSalesforce実測（登録履歴→求職者→マッチング入社済の受注額−返金想定）から算出。',
            capabilities: [
                'CV単価カード: 会員登録（単独）約1.8万円・人材紹介応募 約5,300円・求人広告応募 約7,800円・ハローワーク応募 約2,800円。相互の倍率つき（例: 登録1件=ハロワ応募6.5件分）',
                '期間のCVを金額換算: DB実数ベース（featured/CRM配信込み・実態）とGA4サイト内フォームベース（施策試算用）の2表',
                '単価の算出根拠テーブル: コホート期間・CV件数・入社成約数・成約率・受注額−返金・備考（求人広告は紹介パスアップ分のみ等）を常設表示',
                '係数は lib/constants/cvUnitValue.ts で一元管理（四半期に1回程度の再算出を推奨。手順はメモリ project_cv_unit_value.md / ファイルコメント参照）',
            ],
            metrics: ['totalUsers', 'customEvent:click_label'],
            apiRoute: 'POST /api/cv-types, POST /api/applications/actual（既存APIを再利用）',
        },
    },

    // ── cv ──
    cvTypes: {
        href: '/cv-types',
        title: '求人種別CV分析',
        subtitle: '応募CVを人材紹介/求人広告/ハローワークに分解し会員登録と比較。チャネル構成比も',
        category: 'cv',
        productScoped: true,
        tags: ['cv', 'apply', 'channel'],
        doc: {
            description: '応募CVを契約種別（人材紹介 / 求人広告 / ハローワーク）に分解し、会員登録と並べて状況を確認します。drm-front の GTM ラベル規則（JobR / JobA / JobH、サンクスは ThxJob*）を利用しています。',
            capabilities: [
                '求人種別ごとの応募完了数と構成比（完了は送信ボタンクリック基準。DB実応募数との一致を確認済み・bot耐性あり）',
                'CVの期待売上換算（円）: 応募・会員登録1件あたりの期待売上係数（Salesforce入社済受注額−返金から算出。人材紹介約5,300円・求人広告約7,800円・ハロワ約2,800円/応募、会員登録約1.8万円/登録）でサマリーカードに金額表示。施策の価値比較用（lib/constants/cvUnitValue.ts）',
                '求人種別ファネル: 求人詳細閲覧 → 応募フォーム → 完了（各遷移率つき）',
                'サイト全体の流入チャネル構成比（セッション基準・構成比バーつき）。ラストタッチ基準のためオーガニックの価値は構成比より重い旨の注記つき',
                '求人詳細の流入内訳（種別×チャネル: Organic検索/Direct/CRM/広告 と 一覧経由率）。ハロワ=SEO直接着地が大半、人材紹介=Direct/CRM比重が高い等の構造を常設で確認できる',
                '応募の全体像（DB実数）: 本体DynamoDBの会員+ゲスト応募を種別×流入レイヤー（自然/featured=CRM配信/CA紹介/スカウト）で分解。GA4に乗らないfeatured経由（応募の約9割）を含む実数',
                '応募フォームの項目別ファネル: フォーム表示→各入力項目のタップ（着手）→送信を種別別に表示。どの項目で手が止まるかを特定（2026-07-28以降のデータ・ゲスト応募の行動）',
                '経路別ファネル（種別×経路）: GA4クローズドファネルで 一覧→詳細→フォーム→完了 を人材紹介/求人広告/ハローワーク×一覧経由/直接着地の6行に分解。ハロワは一覧経由2.3% vs 直接着地0.4%など、経路による応募力の差を常設表示',
                '会員登録の内訳: 登録のみ（GA4 thanks到達）と応募と同時の登録（応募時刻とユーザー作成時刻の近接判定・種別つき）を分解',
                '会員登録のフォーム→完了を参考行として併記',
                '完了数の日別推移チャート（4系列）',
                '期間切り替え（7 / 14 / 30 / 90日）',
            ],
            metrics: ['totalUsers', 'customEvent:view_label', 'pagePath'],
            apiRoute: 'POST /api/cv-types',
        },
    },
    occupation: {
        href: '/occupation',
        title: '職種別CV分析',
        subtitle: '職種（occ）別の会員登録CV・登録率と事業領域別LP応募CV',
        category: 'cv',
        productScoped: true,
        tags: ['signup', 'occupation', 'cv'],
        doc: {
            description: '会員登録フォームの職種パラメータ（occ）別の登録CVと職種ページ配下のセッションから、職種ごとの獲得状況を比較します。事業領域別のLP応募CV内訳も表示します。',
            capabilities: [
                '職種別の会員登録CV（サンクスページの ?occ= パラメータで分類）',
                '職種配下セッション（/{職種スラッグ} 配下ページの合計）と登録率',
                '職種行クリックでサブカテゴリ内訳を展開（例: /driver/chugata-truck 別セッション・一覧トップ・都道府県・求人詳細）',
                '事業領域別 LP応募CV（/lp-thanks/{slug} 別の内訳と構成比）',
                '期間切り替え（7 / 14 / 30 / 90日）',
                'AI 考察（伸びしろ職種・流入強化候補の特定と施策提案）',
            ],
            metrics: ['totalUsers', 'sessions', 'pagePathPlusQueryString'],
            ai: true,
            apiRoute: 'POST /api/occupation',
        },
    },
    applyFields: {
        href: '/apply-fields',
        title: '応募フォーム項目別タップ',
        subtitle: '応募種別ごとに各入力項目がどれだけタップ（着手）されているかの発火数',
        category: 'cv',
        productScoped: true,
        tags: ['apply', 'form'],
        doc: {
            description: '応募フォームの各入力項目が、応募種別（人材紹介/求人広告/ハローワーク）ごとにどれだけタップ（着手）されたかを data-click-label の発火数で集計する。どの項目で手が止まるかを見る。',
            capabilities: [
                '応募種別 × 入力項目のタップ数マトリクス',
                '項目別の着手率（フォーム表示に対する比率）',
                '期間切替',
            ],
            notes: [
                'JobR/ハローワークは3項目固定、JobA のみ最大8項目。項目数が違うので種別間で単純比較しない',
            ],
        },
    },

    // ── channel ──
    seoReport: {
        href: '/seo-report',
        title: 'SEOモニタ',
        subtitle: 'Search Consoleの順位・表示回数・CTRをページカテゴリ別・URL別に監視（施策のSEO影響判定）',
        category: 'channel',
        tags: ['seo', 'channel'],
        doc: {
            description: 'Search Console（sc-domain:x-work.jp）の掲載順位・表示回数・CTR・クリックをページカテゴリ別に常時監視。施策（モザイク・モーダル・FV変更等）のSEO影響を「対象カテゴリ vs 非対象カテゴリの前後比較（DiD）」で判定するための基盤。',
            capabilities: [
                '全体サマリー（クリック・表示回数・CTR・平均順位）と前期間比',
                'ページカテゴリ別（求人詳細/検索・一覧/資格条件/TOP/コラム）の前期間比較。施策を当てたカテゴリだけ悪化→施策影響、全カテゴリ一斉変動→アルゴリズム更新、の切り分けができる',
                '日別推移（クリックバー・表示回数・平均順位）と上位検索クエリ',
                'URL別表示: 上位20ページの前期間比つきテーブル＋パス正規表現フィルタ（例: /(driver)/media_.*）。フィルタ適用でサマリー・日別・クエリ・URL表すべてが対象URL群に絞られる',
                '検索タイプ別トレンド: Googleしごと検索枠（JOB_LISTING/JOB_DETAILS、クリックの約3割）の前期間比を常設表示。JobPosting構造化データの健全性監視用',
                'SEOカテゴリ急落の常設アラート: 毎日10:00にカテゴリ別クリックの前週比を判定（-25%超かつ前週200クリック以上で🚨即時Slack通知）、毎週月曜は全カテゴリの週次サマリーを配信。ABテストSEO監視と同じジョブで実行',
                'ABテストSEO監視（自動）: ABテスト設定の「SEO監視対象パス」に正規表現を入れると、テスト期間中毎日10:00に対象ページのGSC実績をサイト全体と対照比較（DiD、テスト開始前7日vs直近7日）。対照比クリック-20pt超 or 順位+1.0超悪化でSlack即日通知＋Gemini見立てコメント、毎週月曜は異常なしでもサマリー配信（POST /api/alerts/seo-watch）',
                'GSCデータの2〜3日ラグを考慮した期間設計（終端は3日前）。SEO反映は2〜6週かかる旨の注意書きつき',
                '統合SA（ga4-analytics-dashboard@xmile-drm）をSearch Consoleに制限付き権限でユーザー追加して接続（2026-09-25にSA統合）',
            ],
            metrics: ['clicks', 'impressions', 'ctr', 'position'],
            apiRoute: 'POST /api/seo-report',
        },
    },
    lineReport: {
        href: '/line-report',
        title: 'LINEレポート',
        subtitle: 'サイト内の連携導線・連携者の増え方・LINE経由の再訪CVと週次配信の実績',
        category: 'channel',
        productScoped: true,
        tags: ['line', 'channel', 'money'],
        doc: {
            description: 'サイト内のLINE連携導線（サイト→LINE）と、LINE経由（utm_medium=line）の再訪・CV・期待売上換算、おすすめ求人LINE配信（毎週火曜・連携者向けFlexカルーセル）の週次実績を常設表示。LINE施策（配信頻度AB・連携率改善等）の判定基盤。',
            capabilities: [
                'LINE連携者の増え方グラフ（累計 / 配信ごとの1日あたり / 月次純増 の3タブ。配信間隔が週1→週2と変わるため日割りで比較する。期間選択とは独立した長期推移）',
                'サイト→LINE連携の導線別ファネル（表示→連携→見送り）。会員登録/ログイン・サンクス離脱モーダル・サンクス滞在バナー（XWORK_PRODUCT-1862）・サンクス既存バナー・サイドバー。全指標ユニーク人数（BQ events_* 直読み・最大30日）',
                '詳細テーブル（導線別数値・日別内訳・未計測導線・週次配信・流入元・再訪日別）は既定で折りたたみ',
                'ラベル未配線でクリックを数えられない導線（フッター・SNSカード・lp-thanks 6種・会員登録完了メール）を一覧で明示。遷移先のinflow-routes共有も併記',
                'LINE経由の再訪ユーザー・セッション・CV（応募/LP応募/会員登録）と円換算（CV単価係数）',
                'utm_source別内訳（product=週次おすすめ配信 / ca / scout 等）',
                '週次配信実績（BQ xmile-drm.xwork.line_job_recommendation_unit_stats）: 連携者数の推移・配信成功・受取拒否率・求人マッチなし。※write SAにxmile-drmの閲覧権限が必要（未付与時は付与手順を画面に表示）',
                '日別再訪の簡易バーチャート（火曜配信ピークの確認・配信頻度ABの健全性監視用）',
                'クリック統計（LINE Insight）はdrm-front側でBQ未連携のため未対応（連携後に追加予定）',
            ],
            metrics: ['sessions', 'activeUsers', 'sessionSource', 'sessionMedium'],
            apiRoute: 'POST /api/line-report, POST /api/line-report/associations',
        },
    },
    utmReport: {
        href: '/utm-report',
        title: 'UTM別レポート',
        subtitle: 'utm_source×medium×campaign別のセッション・CV・円換算。各UTMの意味と発行タイミング注記つき',
        category: 'channel',
        productScoped: true,
        tags: ['utm', 'channel', 'money'],
        doc: {
            description: 'utm_source × utm_medium × utm_campaign × utm_content 別に、セッション・ユーザー・CV（応募/LP応募/会員登録）・期待売上換算を集計する汎用ビュー。各UTMが「どの施策のリンクで・いつ発行されるか」を lib/constants/utmCatalog.ts の辞書で注記する。完全な命名規則は docs/utm-naming-convention.md（用語集のUTM節と同期）。',
            capabilities: [
                'source×medium×campaign×content別のセッション・ユーザー・CV・CVR・期待売上換算（CV単価係数）',
                '各行に施策名・発行タイミング・区分バッジ（自社通知/LINE公式/CA配信/スカウト配信/広告/インフルエンサー等）を注記',
                'utm_content が何を分けているかも注記（自社メール=配信内のリンク位置、スカウトSMS=文面AB featured_a/featured_b、広告=クリエイティブID）。「utm_contentで分ける」トグルでcampaign粒度に畳める',
                'medium別フィルタ（email/line/social/sms/cpc/referral…）とサマリー（対象セッション・CV・円換算・UTM種類数）',
                'keep_remider（keep_reminderのタイポ）等のコード側既知の不具合を⚠️注記',
                '注: GA4はUTMをセッション開始時のみ読むため、サイト内リンクUTM（フッター等 utm_source=xwork/thanks）は表示されない（流入UTMのみが対象）',
            ],
            metrics: ['sessions', 'activeUsers', 'sessionSource', 'sessionMedium', 'sessionCampaignName', 'sessionManualAdContent'],
            apiRoute: 'POST /api/utm-report',
        },
    },
    signupStepMails: {
        href: '/signup-step-mails',
        title: '会員登録後ステップメール',
        subtitle: '登録から1/3/7/14/30日後に送る5通の送信数・開封率・クリック率。送達記録＋SESイベントが出典',
        category: 'channel',
        tags: ['signup', 'utm'],
        doc: {
            description: '会員登録から1/3/7/14/30日後に自動送信される5通のステップメール（drm-front PR#3659、2026-09-24稼働）の実績。送信数は通知基盤の送達記録 DeliveryRecords-prd（DynamoDB、topic=signup_step_mail）、開封・クリック・バウンスは SES イベントを BigQuery に落とした xmile-drm.xwork.ses_event_records が出典で、providerMessageId = message_id で突合します。',
            capabilities: [
                'ステップ別の送信数・配信成功・開封・クリック・バウンスと開封率／クリック率。未送信ステップは到達待ちの人数を表示',
                '配信スケジュール（SignupStepMails-prd）の状態別会員数: 配信中 / 完了 / 退会打ち切り / 猶予超過打ち切り',
                '日別の送信・開封推移',
            ],
            notes: [
                'ステップの識別は件名ではなく sentIdempotencyKey（signup_step_mail:<userId>:<stepKey>）で行う。day7/day14 は氏名・エリアを差し込む可変件名のため件名マッチでは突合できない',
                '開封率の分母は配信成功（Delivery）。同一メールで開封イベントが複数回立つため message_id で重複除去している',
                'SESの開封計測は画像読み込み依存で、ブロック環境では低く、Appleのメールプライバシー保護では高く出る。絶対水準ではなくステップ間の差と時系列で見る',
                'SESイベントのBigQuery連携に遅延があるため、直近の送信は開封が未反映になることがある（突合できなかった通数を画面に表示）',
                'status=skipped（配信停止・アドレス無しなど、そもそも送る対象でなかった人）は送信失敗と分けて「対象外スキップ」として理由別に表示する。送信数・開封率の分母には含めない',
            ],
        },
    },

    // ── abtest ──
    abTest: {
        href: '/ab-test',
        title: 'ABテスト',
        subtitle: 'ABテスト結果の分析と評価',
        category: 'abtest',
        productScoped: true,
        productIdInHref: true,
        tags: ['abtest'],
        doc: {
            description: 'GA4 データをソースとした A/B テストの管理・実行・評価を行います。統計的有意差検定（Z検定）・サンプルサイズ・改善率の判定基準を設定し、AI が勝者の推奨を補足します。',
            capabilities: [
                'テスト作成・編集・ステータス管理（running / paused / completed）',
                'CVR設定のGTMラベルは1行=1ラベルで複数指定（実ラベルのオートコンプリート付き）。複数指定時は途中経過・テスト実行結果にラベル別内訳（件数・構成比）を表示',
                'Backlog Issue欄（番号・課題キー・URLのいずれか）。一覧・詳細にリンク表示',
                'GA4フィルタ・除外フィルタ（例: pageLocation に userId= を含むイベントを除外し、LP経由ユーザーを除いた直接流入のみでCVR比較）',
                'フィルタ式を複数指定（カンマ区切りOR）した場合、途中経過・最終結果で「全体⇔フィルタ式別」を切り替えて内訳（PV/CV/CVR・有意差）を表示',
                'Z検定による統計的有意差判定',
                'サンプルサイズ・テスト期間・改善率の合否チェック',
                'スケジュール実行・Webhook 通知',
                '勝者判定後の AI 評価コメント',
                'セグメント別（デバイス / チャネルなど）の内訳確認',
                '途中経過ファネルのビュー基準 / クリック基準 切り替え（ビュー計測の取りこぼしをクリック実数と比較検証できる）',
                '途中経過ファネルの「LP経由を除く」トグル（テストの除外フィルタ設定を全ステップ集計に適用し、直接流入のみのファネルを表示）',
                'テスト終了時の AI 最終レポート自動生成（結果サマリー・仮説検証・勝因敗因・学び・次のアクション。クリック基準ファネルを判断材料に含め、どのステップで差がついたかを分析）',
                '最終レポートの BigQuery 蓄積（ab_test_final_report_log）',
            ],
            ai: true,
            apiRoute: 'GET /api/ab-test, POST /api/ab-test/evaluate',
        },
    },
    abTestAdvisor: {
        href: '/ab-test/advisor',
        title: '施策提案AI壁打ち',
        subtitle: '過去ABテストの勝因・敗因をもとにAIが施策提案を評価',
        category: 'abtest',
        productScoped: true,
        tags: ['abtest', 'ai'],
        doc: {
            description: '検討中の施策・ABテスト案を入力すると、過去 AB テストの勝因・敗因に加えて事業の実測データ（CV単価・直近30日のファネル/チャネル/主要面の規模）をコンテキストに、AI が成功確度・金額換算インパクト・推奨テスト設計を回答します。',
            capabilities: [
                '過去 AB テスト実績（勝者・改善率・有意差・勝因敗因メモ・最終レポート）との照合',
                '類似する過去施策の提示と成功確度評価（高 / 中 / 低）',
                '事業コンテキスト注入: CV単価係数（cvUnitValue.ts）＋GA4直近30日実測（種別ファネル・会員登録・一覧UU・チャネル構成）を毎回自動取得してプロンプトに同梱（GA4障害時は単価のみで続行）',
                '想定インパクトの金額換算（対象規模×リフトシナリオ×CV単価で「+◯万円/月」を提示、不明数値は捏造せず要実測と明示）',
                'リスク・落とし穴の指摘と成功確度を上げる修正案',
                '推奨テスト設計（仮説文・主要KPI・期間・検出力の概算式つき）',
                '参照した過去 AB テストへのリンク表示',
            ],
            ai: true,
            apiRoute: 'POST /api/ab-test/advisor',
        },
    },
    abTestCompleted: {
        href: '/ab-test/completed',
        title: 'ABテスト完了一覧',
        subtitle: '完了したABテストの勝利・負けと改善率',
        category: 'abtest',
        productScoped: true,
        productIdInHref: true,
        tags: ['abtest'],
        doc: {
            description: '完了した AB テストの一覧。勝利/敗北の判定と A 比の改善率を一覧で振り返り、施策提案AI壁打ちの材料にもなる。',
            capabilities: [
                '完了テストの一覧（勝者バリアント・改善率・期間）',
                '詳細ページへの導線',
            ],
        },
    },

    // ── funnel ──
    signupFunnel: {
        href: '/signup-funnel',
        title: '会員登録フォームファネル',
        subtitle: '職種選択→各質問→登録完了の通過状況（ラベル変更に自動追従）',
        category: 'funnel',
        productScoped: true,
        tags: ['signup', 'form'],
        doc: {
            description: '会員登録フォーム（職種選択→各質問→登録完了）の質問別通過状況を view（画面を見た人）と click（回答して進んだ人）の両方で常設表示します。期間内に実際に発火した SU__ ラベルから質問構造を自動復元するため、ABテストのサフィックス（__B-xxxx）やステップ番号の振り直し・質問文変更があってもコード変更なしで追従します。',
            capabilities: [
                '職種フォーム別のタブ切り替え（Driver / Soko など、期間内にデータがあるフォームを自動検出）',
                '質問ごとの view / click / 起点比 / ステップ離脱率（職種選択クリック起点）',
                'ABテスト変種を質問文ベースで自動統合（変種間でステップ番号がズレていても正しく合算）',
                '離脱率の色分け（15%以上=赤 / 10%以上=黄）と残存バー',
                '完走率サマリー（職種選択→登録完了）',
                '期間切り替え（7 / 14 / 30 / 90日・今月・前月・カスタム日付指定）',
                '職種別×全体の推移チャート（流入=職種選択クリック / 登録完了=thanks到達を?occ=で職種分解 / 完走率の3指標切替、35日超は週次集約）と職種別合計テーブル',
                '前期間比較（直前の同じ長さの期間）: 全体サマリーカードと職種別テーブルに流入・完了の変化率（%）と完走率のポイント差（pt）を色付き表示',
                '推移セクションは上の質問別ファネルとは独立した期間セレクタ（プリセット＋カスタム日付）を持つ',
            ],
            metrics: ['totalUsers', 'customEvent:view_label', 'customEvent:click_label', 'pagePathPlusQueryString'],
            apiRoute: 'POST /api/signup-funnel（推移は POST /api/signup-funnel/trend）',
        },
    },
    funnel: {
        href: '/funnel',
        title: 'エントリーフォームファネル',
        subtitle: 'フォーム完了までの導線分析',
        category: 'funnel',
        productScoped: true,
        productIdInHref: true,
        tags: ['apply', 'form'],
        doc: {
            description: 'フォームの各ステップ（表示→入力→確認→完了）の通過率と離脱率を測定します。期間比較で施策前後の CVR 変化を定量評価できます。',
            capabilities: [
                'ステップ別ユーザー数・CVR・離脱率',
                '期間比較ファネル（A/B 期間の並列表示）',
                'ステップ間の落ち込み可視化',
                '期間比較時のチャネル別内訳（チャネルごとのセッション・CV・CVR の期間差分）',
                'AI によるファネル評価・期間比較インサイト（チャネル別変化を含む）',
            ],
            metrics: ['activeUsers', 'eventCount'],
            ai: true,
            apiRoute: 'GET /api/funnel/entry-form',
        },
    },
    scout: {
        href: '/scout',
        title: 'スカウト効果ファネル',
        subtitle: 'スカウト送信→閲覧→応募のファネルと企業別内訳',
        category: 'funnel',
        productScoped: true,
        tags: ['scout', 'channel', 'apply'],
        doc: {
            description: 'スカウトの送信リクエスト（本体DB: ScoutHistories）→ スカウトページ閲覧（GA4 /scout/）→ 応募（scoutId付きURLでの送信ボタンクリック）を一本のファネルで確認します。企業別内訳と日別推移つき。',
            capabilities: [
                '送信リクエスト・送達・閲覧UU・応募のファネルサマリー（status = requested / sent / failed / skipped を集計）',
                '推移チャート（送信・閲覧・応募の3系列ライン、35日超は週次集約）',
                '企業別内訳（検索・ページネーションつき）。行クリックでその企業の送信・閲覧・応募の推移チャートを表示',
                '日別推移テーブル（新しい順）',
                '期間切り替え（7 / 14 / 30 / 90 / 180日・今月・前月・カスタム日付指定）',
            ],
            metrics: ['totalUsers', 'pagePath', 'pageLocation', 'customEvent:click_label'],
            apiRoute: 'POST /api/scout/funnel',
        },
    },
    funnelEngagement: {
        href: '/funnel/engagement',
        title: 'エンゲージメント',
        subtitle: 'エンゲージメントファネル分析',
        category: 'funnel',
        productScoped: true,
        productIdInHref: true,
        tags: ['engagement'],
        doc: {
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
    },
    funnelPath: {
        href: '/funnel/path',
        title: '経路ファネルビルダー',
        subtitle: 'ページ・クリックタグを組み合わせた順序付きファネルを自由に作成',
        category: 'funnel',
        productScoped: true,
        tags: ['path'],
        doc: {
            description: 'ページ閲覧とクリックタグ（GTMラベル）を自由に組み合わせて、同一ユーザーの順序付きクローズドファネルを作成します。「トップ→検索モーダル→検索結果→求人詳細→応募」のような導線別の通過率比較に使えます。',
            capabilities: [
                'ステップをUIで自由に構築（2〜10個、ページ / クリックタグ混在可、並べ替え対応）',
                'GA4 の順序付きクローズドファネル（Data API v1alpha runFunnelReport）で同一ユーザーの通過を集計',
                'ステップ別ユーザー数・通過率・離脱数・起点比の可視化',
                'プリセット2種（王道経路 / 職種直リンク導線）とブラウザ内保存',
                '複数ファネル比較（プリセット・保存済みから2〜4個選んで通過率を横並び比較、全体通過率つき）',
                '期間切り替え（7 / 14 / 30 / 90日）',
            ],
            metrics: ['activeUsers', 'unifiedPagePathScreen', 'customEvent:click_label'],
            apiRoute: 'POST /api/funnel/path',
        },
    },

    // ── visual ──
    heatmap: {
        href: '/heatmap',
        title: 'ヒートマップ',
        subtitle: 'クリック位置とスクロール深度の可視化',
        category: 'visual',
        productScoped: true,
        productIdInHref: true,
        tags: ['form', 'engagement'],
        doc: {
            description: 'GTM 経由で収集したクリック座標・スクロール深度をヒートマップとして可視化します。ページのどの要素が注目されているかを視覚的に把握できます。',
            capabilities: [
                'クリックヒートマップ（座標密度表示）',
                'スクロール深度マップ',
                'ビュー別ラベル管理',
            ],
            apiRoute: 'GET /api/heatmap/view-labels',
        },
    },
    journey: {
        href: '/journey',
        title: 'ユーザー経路分析',
        subtitle: '来訪から会員登録完了までのフロー可視化',
        category: 'visual',
        productScoped: true,
        tags: ['path', 'exit'],
        doc: {
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
    },
    exit: {
        href: '/exit',
        title: '離脱分析',
        subtitle: 'ファネルの各ステップの離脱数・離脱率の高いページを特定',
        category: 'visual',
        productScoped: true,
        tags: ['exit'],
        doc: {
            description: 'ファネル各ステップの離脱数・離脱率と、離脱率の高いページを特定します。行動シグナル（平均滞在時間・スクロール到達率）を組み合わせ、AI が離脱の質（即離脱か読了後離脱か）を判定します。',
            capabilities: [
                'ファネルステップ別の離脱数・離脱率',
                '離脱率ランキング',
                'ページ別の詳細離脱指標',
                '行動シグナル表示（平均滞在時間・スクロール到達率90%）',
                'AI による離脱の質の分析（即離脱＝第一印象の問題 / 読了後離脱＝訴求・導線の問題）と改善提案',
            ],
            metrics: ['screenPageViews', 'bounceRate', 'engagementRate', 'scrolledUsers', 'userEngagementDuration'],
            ai: true,
            apiRoute: 'POST /api/exit, POST /api/exit/gemini',
        },
    },
    pageflow: {
        href: '/pageflow',
        title: 'ページフロー分析',
        subtitle: '指定ページの直前・直後の遷移ページを両方向で集計',
        category: 'visual',
        productScoped: true,
        tags: ['path'],
        doc: {
            description: '指定したページの「直前に見ていたページ」と「直後に見たページ」を両方向で集計します。サンクスページ後の誘導効果測定（例: LP応募→クロスワーク本体への遷移率）や、任意ページの導線実態の確認に使います。',
            capabilities: [
                'ページパス前方一致での対象指定（例: /lp-thanks で全事業のLP応募サンクスをまとめて分析）',
                '経路別比較: 直前ページごとの「表示PV × 到達PV × 遷移率」（そのページを見たうち何%が対象へ進んだかの効率比較。大職種一覧14種も個別行で内訳表示）',
                '直前ページ TOP20（サイト内はパス正規化、外部流入はドメインでまとめて表示）',
                '直後ページ TOP20（対象ページをリファラーとする遷移先）',
                '対象ページ到達ユーザー数に対する構成比・リファラーなし数の表示',
                '期間切り替え（7 / 14 / 30 / 90日）',
            ],
            metrics: ['totalUsers', 'pageReferrer', 'pagePath'],
            apiRoute: 'POST /api/pageflow',
        },
    },
    listPerformance: {
        href: '/list-performance',
        title: '求人一覧パフォーマンス',
        subtitle: '職種一覧と/searchのPV・求人詳細への遷移率を比較（BQセッション集計）',
        category: 'visual',
        productScoped: true,
        tags: ['path', 'bq'],
        doc: {
            description: '求人一覧の2系統（職種一覧 /driver等14種と検索結果 /search）のPV・閲覧セッションと、閲覧後に同一セッションで求人詳細（media_）へ遷移した割合を比較します。BigQueryのGA4生イベントをセッション単位で集計。',
            capabilities: [
                '職種別内訳（14職種それぞれのPV・セッション・詳細遷移率）+ 職種計 + /search',
                '日次推移チャート（職種一覧計 vs /search、詳細遷移率・PV・セッション切替）',
                '期間切り替え（プリセット・今月・前月・カスタム。BQエクスポート開始2026-08-07以降）',
            ],
            metrics: ['BigQuery events_*（page_view）'],
            apiRoute: 'POST /api/list-performance',
        },
    },

    // ── users ──
    persona: {
        href: '/persona',
        title: '求職者属性・ペルソナ',
        subtitle: 'Salesforce登録者の年齢層・性別・事業領域(ドライバー等)・転職意欲。領域別にどんな人が来ているかをペルソナ設計用に把握',
        category: 'users',
        tags: ['signup'],
        doc: {
            description: 'Salesforce に登録された求職者の属性分布。年齢層・性別・希望勤務地・雇用形態・転職意欲を、事業領域（ドライバー等）または希望職種の軸で切り、どんな人が来ているかをペルソナ設計用に把握する。データはスナップショット（再生成は scripts/regen-persona-snapshot）。',
            capabilities: [
                '年齢層（全体）・性別×年齢の分布',
                '希望勤務地 上位15・希望雇用形態・転職意欲（現在の気持ち）',
                '事業領域別 / 希望職種別（細分類）のペルソナ切替と横断サマリー',
            ],
            notes: [
                '出典は Salesforce の求職者オブジェクト。GA4 の訪問者ではなく「登録まで至った人」の属性',
                'スナップショットのため最新ではない。更新日は画面に表示',
            ],
        },
    },
    userFlow: {
        href: '/user/flow',
        title: 'CVセッション解剖（BQ）',
        subtitle: '応募・登録セッションの行動量と求人詳細後の次アクション（BigQuery生イベント）',
        category: 'users',
        productScoped: true,
        tags: ['bq', 'path', 'cv'],
        doc: {
            description: 'BigQueryのGA4生イベント（xmile-drm.analytics_534098180.events_*、2026-08-07〜）をセッション単位でSQL集計。応募・登録した人が「何件の求人詳細を見て・検索を使って・何分で」CVしたかを非CVセッションと比較し、求人詳細ページ直後の遷移先（次アクション）の実測割合を表示します。GA4 APIの集計値では不可能なセッション内行動の分解が目的。',
            capabilities: [
                'グループ別行動量比較（応募あり / 会員登録あり / 非CV求人閲覧あり / 非CV閲覧なし）: 求人詳細閲覧数の平均・中央値、検索利用率、滞在時間、CVまでの所要時間。全体⇔デバイス別（モバイル/PC/タブレット）切り替え',
                '日次推移チャート（詳細→フォーム進出率・詳細→離脱率・求人詳細PV）— FV改善施策のKPIウォッチ用',
                '求人詳細の閲覧数分布（0 / 1 / 2〜3 / 4〜9 / 10件以上）— 応募ありの0件は一覧モーダル・featured等の非詳細導線',
                '求人詳細→次アクション内訳（別の詳細 / 検索 / 一覧 / 応募フォーム / 離脱 等）— 詳細→フォーム進出率がFV改善・CTA施策のKPI',
                '応募 = EF__Job(R|A|H)__Btnクリック（実応募一致）、登録 = /members/signup/thanks到達、検索 = /search・一覧・資格条件',
                'クエリは毎回dry runでスキャン量を確認（5GB超で中止）。7日間で約660MB・1円未満',
            ],
            metrics: ['event_name', 'page_location', 'click_label', 'ga_session_id'],
            apiRoute: 'POST /api/user-flow',
        },
    },
    user: {
        href: '/user',
        title: 'セグメント行動分析',
        subtitle: 'デバイス・ブラウザ・流入元別の行動タイムライン',
        category: 'users',
        productScoped: true,
        tags: ['engagement'],
        doc: {
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
    },
    userCohort: {
        href: '/user/cohort',
        title: 'コホートリテンション',
        subtitle: '初回訪問週ごとの継続率マトリクス',
        category: 'users',
        productScoped: true,
        tags: ['retention'],
        doc: {
            description: '週別の初回訪問コホートごとに、その後の継続率をマトリクス形式で表示します。「登録後フォローメール施策の前後でDay7継続率が変わったか」などの施策評価に使います。',
            capabilities: [
                '初回訪問週ごとのコホート分類',
                'Week0〜Week8+ の継続率マトリクス',
                '期間全体の平均継続率チャート',
                '全体継続率 vs 直近コホートの比較',
                '施策マーカー（期間中のABテストを色分け表示し、施策実施中に流入したコホートをマトリクス上でマーキング）',
            ],
            metrics: ['cohortActiveUsers', 'cohortRetentionRate'],
            apiRoute: 'POST /api/user/cohort',
        },
    },
    userSegmentBuilder: {
        href: '/user/segment-builder',
        title: 'ユーザーリスト抽出',
        subtitle: '条件を組み合わせてセグメントのユーザー数・行動傾向を確認',
        category: 'users',
        productScoped: true,
        tags: ['engagement'],
        doc: {
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
    },
    userScoring: {
        href: '/user/scoring',
        title: '活動スコアリング',
        subtitle: 'セグメントごとの活性度を0〜100点でスコアリング（活性/休眠/離脱リスク分類）',
        category: 'users',
        productScoped: true,
        tags: ['engagement', 'ai'],
        doc: {
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
    },
    userStickiness: {
        href: '/user/stickiness',
        title: 'スティッキネス分析',
        subtitle: 'DAU/WAU/MAUの推移とエンゲージメント深度',
        category: 'users',
        productScoped: true,
        tags: ['retention', 'engagement'],
        doc: {
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
    },

    // ── tools ──
    analytics: {
        href: '/analytics',
        title: 'GA4分析',
        subtitle: 'GA4データの自由分析レポートビルダー',
        category: 'tools',
        productScoped: true,
        tags: ['rawdata'],
        doc: {
            description: 'GA4 のデータをレポートテンプレートに基づいて集計します。セッション・PV・CVR・エンゲージメント率・直帰率などを表示します。',
            capabilities: [
                'テンプレート別のGA4レポート集計',
                'A/B テストとのデータ連動',
                'エクスポート対応',
            ],
            apiRoute: 'GET /api/analytics/report',
        },
    },
    data: {
        href: '/data',
        title: 'GA4データ閲覧',
        subtitle: 'GA4の生データを期間別で閲覧',
        category: 'tools',
        productScoped: true,
        tags: ['rawdata'],
        doc: {
            description: 'GA4 Data API の生データを、ディメンション・メトリクス・期間を指定してテーブルで閲覧する。レポートビルダーより手軽に「この軸でこの数字はいくつか」を確認する用途。',
            capabilities: [
                'ディメンション・メトリクス・期間の指定',
                '結果テーブルの表示',
            ],
            metrics: ['任意（GA4メタデータ参照）'],
        },
    },
    ga4Metadata: {
        href: '/ga4-metadata',
        title: 'GA4メタデータ',
        subtitle: '利用可能なメトリクスとディメンション一覧',
        category: 'tools',
        productScoped: true,
        tags: ['rawdata'],
        doc: {
            description: '接続中の GA4 プロパティで利用できるメトリクスとディメンションの一覧。カスタムディメンション（click_label 等）が登録されているかの確認にも使う。',
            capabilities: [
                'メトリクス一覧（検索つき）',
                'ディメンション一覧（検索つき・カスタム含む）',
                '日本語訳の注記',
            ],
        },
    },
    history: {
        href: '/history',
        title: '履歴一覧',
        subtitle: 'レポートとファネル分析の履歴を確認',
        category: 'tools',
        productScoped: true,
        productIdInHref: true,
        tags: ['rawdata', 'abtest'],
        doc: {
            description: 'GA4分析レポート・ファネル・ABテストの実行履歴をタブで切り替えて一覧する。過去の実行結果の詳細ページへの入口。',
            capabilities: [
                'レポート実行履歴',
                'ファネル実行履歴',
                'ABテスト実行履歴',
            ],
        },
    },
    aiUsage: {
        href: '/ai-usage',
        title: 'AI利用状況',
        subtitle: 'AI API使用量・コスト確認',
        category: 'tools',
        tags: ['ai'],
        doc: {
            description: 'Gemini API の呼び出し回数・トークン・概算コストを機能別に集計する。AI分析機能のコスト監視用。',
            capabilities: [
                '期間内の総呼び出し・トークン・概算コスト',
                '機能別内訳',
                '最近の呼び出し（直近20件）',
            ],
        },
    },

    // ── docs ──
    docsApi: {
        href: '/docs/api',
        title: 'API ドキュメント',
        subtitle: 'API エンドポイント一覧と説明',
        category: 'docs',
        doc: {
            description: 'ダッシュボードの API エンドポイント一覧。メソッド・パス・パラメータ・レスポンスの説明をカテゴリ別に掲載する。',
            capabilities: [
                'カテゴリ別エンドポイント一覧',
                'パラメータ・レスポンス注記',
            ],
        },
    },
    docsFeatures: {
        href: '/docs/features',
        title: '機能ドキュメント',
        subtitle: '全機能の概要・使い方・GA4メトリクス一覧',
        category: 'docs',
        doc: {
            description: '全機能の概要・できること・使用メトリクス・読むときの注意をまとめた機能ドキュメント。このページ自身もここから生成されている。',
            capabilities: [
                'カテゴリ別の機能カード',
                'AI による Q&A（ドキュメントとドメイン知識を参照）',
            ],
        },
    },
    docsGlossary: {
        href: '/docs/glossary',
        title: '用語・ドメイン知識',
        subtitle: '事業用語・CV定義・GTM/GA4計測仕様・データ基盤のリファレンス',
        category: 'docs',
        doc: {
            description: '事業用語・契約種別・CV定義・CV単価・応募ソース・URL構造・GTM/GA4計測仕様・UTM命名規則・データ基盤・過去インシデントのリファレンス。',
            capabilities: [
                '用語・定義の一覧',
                'CV単価の算出根拠（lib/constants/cvUnitValue.ts から動的表示）',
            ],
        },
    },

    // ── ナビ非表示（詳細・動的・統合予定） ──
    dashboard: {
        href: '/',
        title: 'ダッシュボード',
        subtitle: '今月のKPIサマリー・ページ別指標・クイックアクセス',
        category: 'kpi',
        nav: false,
    },
    abTestDetail: {
        href: '/ab-test/[id]',
        title: 'ABテスト詳細',
        subtitle: '個別ABテストの結果・実行履歴・最終レポート',
        category: 'abtest',
        nav: false,
        parent: 'abTest',
    },
    abTestDaily: {
        href: '/ab-test/[id]/daily',
        title: 'ABテスト日別推移',
        subtitle: 'バリアント別CVRの日別推移',
        category: 'abtest',
        nav: false,
        parent: 'abTestDetail',
    },
    abTestSegment: {
        href: '/ab-test/[id]/segment',
        title: 'ABテストセグメント別',
        subtitle: 'デバイス・流入元などセグメント別のバリアント比較',
        category: 'abtest',
        nav: false,
        parent: 'abTestDetail',
    },
    funnelHistory: {
        href: '/funnel/history',
        title: 'ファネル実行履歴',
        subtitle: 'エントリーフォームファネルの実行履歴',
        category: 'funnel',
        nav: false,
        parent: 'funnel',
    },
    funnelExecution: {
        href: '/funnel/[executionId]',
        title: 'ファネル実行結果',
        subtitle: '1回のファネル実行の詳細',
        category: 'funnel',
        nav: false,
        parent: 'funnelHistory',
    },
    reportsHistory: {
        href: '/reports/history',
        title: 'レポート履歴',
        subtitle: 'GA4分析レポートの実行履歴',
        category: 'tools',
        nav: false,
        parent: 'history',
    },
    reportDetail: {
        href: '/reports/[id]',
        title: 'レポート詳細',
        subtitle: '保存済みGA4分析レポートの結果',
        category: 'tools',
        nav: false,
        parent: 'reportsHistory',
    },
}

/** 動的セグメント '[id]' を埋めて実 URL にする。productIdInHref のページには ?productId= を付ける */
export function pageHref(id: PageId, opts?: { productId?: number; params?: Record<string, string | number> }): string {
    const def = PAGES[id]
    let href = def.href
    if (opts?.params) {
        for (const [k, v] of Object.entries(opts.params)) href = href.replace(`[${k}]`, String(v))
    }
    if (def.productIdInHref && opts?.productId) href += `?productId=${opts.productId}`
    return href
}

/** pathname からページを引く。'/ab-test/123' → 'abTestDetail' のように動的セグメントも解決する */
export function matchPage(pathname: string): PageId | null {
    const path = pathname.split('?')[0].replace(/\/+$/, '') || '/'
    let best: { id: PageId; staticLen: number } | null = null
    for (const id of PAGE_IDS) {
        const pattern = PAGES[id].href
        const re = new RegExp('^' + pattern.replace(/\[[^\]]+\]/g, '[^/]+').replace(/\//g, '\\/') + '$')
        if (re.test(path)) {
            // 静的部分が長いほど具体的なマッチとして優先する
            const staticLen = pattern.replace(/\[[^\]]+\]/g, '').length
            if (!best || staticLen > best.staticLen) best = { id, staticLen }
        }
    }
    return best?.id ?? null
}

export interface NavItem {
    id: PageId
    href: string
    title: string
    subtitle: string
    productScoped: boolean
}

export interface NavGroup {
    id: CategoryId
    label: string
    hint: string
    items: NavItem[]
}

/** サイドバー・トップのクイックアクセス用。CATEGORY_IDS の順 → PAGE_IDS の順 */
export function navGroups(productId?: number): NavGroup[] {
    return CATEGORY_IDS.map((cid) => ({
        id: cid,
        label: CATEGORIES[cid].label,
        hint: CATEGORIES[cid].hint,
        items: PAGE_IDS
            .filter((pid) => PAGES[pid].category === cid && PAGES[pid].nav !== false)
            .map((pid) => ({
                id: pid,
                href: pageHref(pid, { productId }),
                title: PAGES[pid].title,
                subtitle: PAGES[pid].subtitle,
                productScoped: PAGES[pid].productScoped === true,
            })),
    })).filter((g) => g.items.length > 0)
}

