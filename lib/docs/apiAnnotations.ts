/**
 * API 一覧の手書き注釈。キーは "METHOD /api/..."。
 * 実在する route は scripts/check/gen-api-list.ts が app/api から機械的に拾う（lib/docs/apiList.generated.ts）ので、
 * ここには機械では分からないもの（表示名・カテゴリ・パラメータ・レスポンスの説明）だけを書く。
 * 注釈が無い route も一覧には載る（名前は route の JSDoc、カテゴリはパスから推定）。
 *
 * 元は app/docs/api/apiList.ts に 65 件を手で持っていたものを機械変換した。
 */

import type { ApiParam } from './apiTypes'

export interface ApiAnnotation {
    category: string
    name: string
    description?: string
    params?: ApiParam[]
    responseNote?: string
}

export const API_ANNOTATIONS: Record<string, ApiAnnotation> = {
    "GET /api/product-goals": {
        category: "全体KPI",
        name: "プロダクト目標の取得",
        description: "プロダクトに設定された目標（名前・数える指標・期末目標・比重・月別の目安）を返します。1 件も無いときは初期テンプレートを入れてから返します。実績は自動で数えるため、ここには目標値だけが入ります。",
        params: [{ name: "productId", type: "number", required: true, description: "クエリ文字列" }],
        responseNote: "{ goals: ProductGoal[], seeded }",
    },
    "PUT /api/product-goals": {
        category: "全体KPI",
        name: "プロダクト目標の保存",
        description: "目標を作成・更新します。metricKey は lib/constants/businessGoals.ts の GOAL_METRICS にあるキーだけが通ります。",
        params: [
            { name: "productId", type: "number", required: true, description: "Body JSON" },
            { name: "goals", type: "array", required: true, description: "Body JSON。{ id?, metricKey, label, target, weight?, milestones?, note? }[]。id があれば更新" },
        ],
    },
    "DELETE /api/product-goals": {
        category: "全体KPI",
        name: "プロダクト目標の削除",
        description: "目標を論理削除します（isActive を false にするだけで行は残ります）。",
        params: [
            { name: "productId", type: "number", required: true, description: "クエリ文字列" },
            { name: "id", type: "number", required: true, description: "クエリ文字列" },
        ],
    },
    "POST /api/business-kpi": {
        category: "全体KPI",
        name: "事業KPI（応募・会員登録）",
        description: "応募数（契約種別別）と会員登録数の月次を返します。出典はプロダクトDB xmile-drm.xwork で GA4 ではありません。求人広告の応募は流入分類（スカウト / プロダクト経由 / LINE公式 / 人材紹介側の配信 / 応募同時登録 / その他）に割ります。分類の定義は goal-tracker の weekly_actuals.sql と同じです。",
        params: [
            { name: "months", type: "number", required: false, description: "Body JSON。さかのぼる月数。1〜24、既定 6" },
        ],
        responseNote: "{ months[], inventoryJobAd, dataTo, scannedBytes }。months[].appsJobAdPace は当月を同じペースで進んだ場合の月末着地",
    },
    "POST /api/delivery-report": {
        category: "集客・チャネル",
        name: "配信レポート（SMS・メール・LINE）",
        description: "B-Dash 一斉配信ログ・本体通知基盤の送達記録・SES のメールイベント・GA4 着地を横断し、チャネル別／施策別／件名別の送信・開封・クリックを返します。開封を計測できるのはメールだけなので、チャネル比較はクリック率と GA4 着地で行ってください。",
        params: [
            { name: "days", type: "number", required: false, description: "Body JSON。7〜180。既定 30。B-Dash の増分開始日 2026-09-14 より前には遡れず、切り詰めた場合は clamped: true を返す" },
            { name: "scope", type: "string", required: false, description: "Body JSON。'xwork'（既定・クロスワーク分のみ）または 'all'（B-Dash 全社）" },
            { name: "excludeInternal", type: "boolean", required: false, description: "Body JSON。既定 true。宛先が xmile.co.jp だけの配信（法人アカウントの動作確認などのテスト）を除外する。CC に社員が入るだけの業務メールは外部宛を含むので残る" },
        ],
        responseNote: "{ channels, campaigns, subjects, ga4, lineUnits, scannedBytes, clamped, excludeInternal, excludedInternal }。excludedInternal は除外したテスト配信の通数",
    },
    "GET /api/ab-test/[id]/current": {
        category: "ABテスト",
        name: "ABテスト途中経過",
        description: "テスト開始〜今日までのバリアント別 PV/CV/CVR、A 比のリフトと有意差、暫定リーダーを返します。フィルタ式が複数ある場合は式ごとの内訳も付きます。",
        responseNote: "{ variants, comparisons, leader, reliability, filterSegments? }。開始前は { notStarted: true }",
    },
    "POST /api/ab-test/[id]/daily": {
        category: "ABテスト",
        name: "ABテスト日次CVR推移",
        description: "バリアント別の日次 CVR と累積 CVR を返します。期間を省略するとテスト期間。",
        params: [
            { name: "startDate", type: "string", required: false, description: "Body JSON。YYYY-MM-DD" },
            { name: "endDate", type: "string", required: false, description: "Body JSON。YYYY-MM-DD" },
        ],
    },
    "POST /api/ab-test/[id]/segment": {
        category: "ABテスト",
        name: "ABテストセグメント別CVR",
        description: "デバイス・OS・ブラウザ・国・流入元・流入経路のいずれかの軸でバリアント別 CVR を分解します。先頭行は全体。",
        params: [
            { name: "segmentDimension", type: "string", required: false, description: "deviceCategory | operatingSystem | browser | country | sessionSource | sessionMedium" },
            { name: "startDate", type: "string", required: false, description: "YYYY-MM-DD" },
            { name: "endDate", type: "string", required: false, description: "YYYY-MM-DD" },
        ],
    },
    "POST /api/user-flow": {
        category: "ユーザー行動分析",
        name: "CVセッション解剖（BQ）",
        description: "GA4 BigQuery Export から、CV に至ったセッションの直前経路・滞在・流入をまとめて返します。",
        params: [
            { name: "startDate", type: "string", required: true, description: "YYYY-MM-DD" },
            { name: "endDate", type: "string", required: true, description: "YYYY-MM-DD" },
        ],
    },
    "POST /api/alerts/seo-watch": {
        category: "アラート・定期配信",
        name: "SEO 監視通知",
        description: "Search Console の順位・クリック変化を集計して Slack に通知します（定期実行用）。",
    },
    "GET /api/ai-usage": {
        category: "設定・ツール",
        name: "AI 利用状況",
        description: "Gemini 呼び出しログ（logs/ai-usage）を集計し、累計コスト・トークン・機能別内訳を返します。",
        responseNote: "{ logs, summary: { totalCostUsd, totalTokens, callCount, byFunction, byDay } }",
    },
    "POST /api/auth/login": {
        category: "認証",
        name: "ログイン",
        description: "Basic認証用。ユーザー名・パスワードを送信し、成功時に HTTP-only クッキー（ga4_auth）をセットします。環境変数 BASIC_AUTH_USER / BASIC_AUTH_PASSWORD と照合します。",
        params: [
            {
                name: "username",
                type: "string",
                required: true,
                description: "Body JSON。ログインID",
            },
            {
                name: "password",
                type: "string",
                required: true,
                description: "Body JSON。パスワード",
            },
        ],
        responseNote: "成功時 { ok: true } と Set-Cookie。失敗時 401 で { error: \"メッセージ\" }",
    },
    "POST /api/auth/logout": {
        category: "認証",
        name: "ログアウト",
        description: "認証クッキー（ga4_auth）を削除します。",
        responseNote: "{ ok: true }",
    },
    "GET /api/dashboard": {
        category: "ダッシュボード",
        name: "ダッシュボード統計",
        description: "月次統計・ABテスト数・ファネル数・日別サマリなどを取得します。",
        params: [
            {
                name: "productId",
                type: "number",
                required: false,
                description: "プロダクトIDで絞り込み",
            },
            {
                name: "month",
                type: "string",
                required: false,
                description: "YYYY-MM 形式の対象月",
            },
        ],
        responseNote: "DashboardStats（month, productCount, abTestCount, dailyStats 等）",
    },
    "GET /api/dashboard/page-metrics": {
        category: "ダッシュボード",
        name: "ページメトリクス",
        description: "指定期間のページ別 PV/CV/CVR 等のメトリクスを取得します。",
        params: [
            {
                name: "productId",
                type: "number",
                required: true,
                description: "プロダクトID",
            },
            {
                name: "startDate",
                type: "string",
                required: true,
                description: "開始日 YYYY-MM-DD",
            },
            {
                name: "endDate",
                type: "string",
                required: true,
                description: "終了日 YYYY-MM-DD",
            },
        ],
        responseNote: "PageMetrics 配列",
    },
    "GET /api/dashboard/page-metrics/series": {
        category: "ダッシュボード",
        name: "ページメトリクス時系列",
        description: "期間内の日別・週別などの時系列メトリクスを取得します。",
        params: [
            {
                name: "productId",
                type: "number",
                required: true,
                description: "プロダクトID",
            },
            {
                name: "startDate",
                type: "string",
                required: true,
                description: "開始日",
            },
            {
                name: "endDate",
                type: "string",
                required: true,
                description: "終了日",
            },
            {
                name: "granularity",
                type: "string",
                required: false,
                description: "day / week など",
            },
        ],
        responseNote: "series 配列（日付・PV・CV・sessions 等）",
    },
    "GET /api/dashboard/page-cv-config": {
        category: "ダッシュボード",
        name: "ページCV設定",
        description: "ページごとのCVイベント・ディメンション設定を取得します。",
        params: [
            {
                name: "productId",
                type: "number",
                required: true,
                description: "プロダクトID",
            },
        ],
        responseNote: "ページパス別の CV 設定一覧",
    },
    "GET /api/ab-test": {
        category: "ABテスト",
        name: "ABテスト一覧",
        description: "ABテスト一覧を取得（ページネーション対応、デフォルト5件/ページ）。",
        params: [
            {
                name: "productId",
                type: "number",
                required: false,
                description: "プロダクトID",
            },
            {
                name: "status",
                type: "string",
                required: false,
                description: "running / paused / completed",
            },
            {
                name: "page",
                type: "number",
                required: false,
                description: "ページ番号",
            },
            {
                name: "limit",
                type: "number",
                required: false,
                description: "件数（最大50）",
            },
        ],
        responseNote: "abTests 配列と total",
    },
    "POST /api/ab-test": {
        category: "ABテスト",
        name: "ABテスト作成",
        description: "新規ABテストを作成します。",
        responseNote: "作成された AbTest",
    },
    "GET /api/ab-test/[id]": {
        category: "ABテスト",
        name: "ABテスト詳細",
        description: "指定IDのABテスト詳細を取得します。",
        responseNote: "AbTest（product, reportExecutions 等含む）",
    },
    "PATCH /api/ab-test/[id]": {
        category: "ABテスト",
        name: "ABテスト更新",
        description: "ABテストの設定・ステータスを更新します。",
        responseNote: "更新後の AbTest",
    },
    "PATCH /api/ab-test/[id]/status": {
        category: "ABテスト",
        name: "ABテストステータス変更",
        description: "running / paused / completed などのステータスを変更します。completed に変更すると、ステップファネル（クリック基準優先）を集計したうえで AI 最終レポートを自動生成し、DB と BigQuery（ab_test_final_report_log）に保存します。",
        responseNote: "更新後の AbTest（finalAiReport 含む）",
    },
    "PATCH /api/ab-test/[id]/execution-mode": {
        category: "ABテスト",
        name: "ABテスト実行モード",
        description: "実行モード（手動/自動など）を変更します。",
        responseNote: "更新後の AbTest",
    },
    "POST /api/ab-test/[id]/next-execution": {
        category: "ABテスト",
        name: "次回実行予約",
        description: "次回実行日時を設定します。",
        responseNote: "更新後の AbTest",
    },
    "POST /api/ab-test/execute": {
        category: "ABテスト",
        name: "ABテスト実行",
        description: "ABテストを1回実行し、結果を保存します。テスト期間終了後の実行では AI 最終レポートを自動生成（未生成の場合のみ）し、BigQuery に蓄積します。",
        responseNote: "実行結果",
    },
    "POST /api/ab-test/test-execute": {
        category: "ABテスト",
        name: "ABテスト設定の検証実行",
        description: "ABテスト作成フォームの「テスト実行」ボタンが使用。入力中のGA4設定で実際にCVRを計算して設定ミスがないか確認します（DBには保存しません）。",
        params: [
            {
                name: "ga4Config",
                type: "object",
                required: true,
                description: "Body JSON。フォーム入力中のGA4設定",
            },
            {
                name: "startDate",
                type: "string",
                required: true,
                description: "Body JSON。開始日",
            },
            {
                name: "endDate",
                type: "string",
                required: true,
                description: "Body JSON。終了日",
            },
        ],
        responseNote: "バリアント別CVR計算結果（保存なし）",
    },
    "POST /api/ab-test/evaluate": {
        category: "ABテスト",
        name: "ABテスト評価",
        description: "ABテストの勝者判定・評価を行います。",
        responseNote: "評価結果",
    },
    "GET /api/ab-test/check-webhook": {
        category: "ABテスト",
        name: "Webhook確認",
        description: "Webhook の疎通・設定確認用です。",
        responseNote: "確認結果",
    },
    "GET /api/ab-test/history": {
        category: "ABテスト",
        name: "ABテスト履歴",
        description: "完了したABテストの履歴一覧を取得します。",
        params: [
            {
                name: "productId",
                type: "number",
                required: false,
                description: "プロダクトID",
            },
        ],
        responseNote: "完了ABテスト一覧",
    },
    "GET /api/ab-test/[id]/funnel": {
        category: "ABテスト",
        name: "ABテスト途中経過ファネル",
        description: "バリアント別のステップファネルをGA4オンデマンド集計で返します。funnelSteps未設定でもCVRラベルのサフィックス（例: __B-1618）からテスト範囲を自動検出します。",
        params: [
            {
                name: "basis",
                type: "string",
                required: false,
                description: "view（デフォルト。view_label基準＝50%×1秒表示）または click（click_labelのStepN_プレフィックス単位で操作した人数。表示条件がなく取りこぼしが少ない）",
            },
        ],
        responseNote: "{ mode, basis, detectedSuffixes, variants, steps: [{ stepName, values: { A: { users, conversionRate, dropoffRate }, ... } }] }",
    },
    "POST /api/ab-test/advisor": {
        category: "ABテスト",
        name: "施策提案AI壁打ち",
        description: "施策・ABテスト案をBigQueryとDBに蓄積された過去ABテストの勝因・敗因・最終レポートと照合し、AIが成功確度・リスク・推奨テスト設計を回答します。APIキーは環境変数 GEMINI_API_KEY を使用します。",
        params: [
            {
                name: "proposal",
                type: "string",
                required: true,
                description: "Body JSON。検討中の施策・テスト案のテキスト",
            },
            {
                name: "productId",
                type: "number",
                required: false,
                description: "Body JSON。プロダクトID（AI利用ログ用）",
            },
        ],
        responseNote: "{ answer: string, referencedTests: [{ abTestId, name, winnerVariant, improvementVsAPct, startDate, endDate }] }",
    },
    "GET /api/analytics/report": {
        category: "分析・レポート",
        name: "分析レポート",
        description: "GA4 分析レポートデータを取得します。",
        params: [
            {
                name: "productId",
                type: "number",
                required: true,
                description: "プロダクトID",
            },
        ],
        responseNote: "レポートデータ",
    },
    "POST /api/analytics/data": {
        category: "分析・レポート",
        name: "分析データ",
        description: "GA4 の生データを取得します。Body で propertyId, startDate, endDate, metrics, dimensions, filter, limit 等を指定します。",
        params: [
            {
                name: "propertyId",
                type: "string",
                required: true,
                description: "Body JSON。GA4 プロパティID",
            },
            {
                name: "startDate",
                type: "string",
                required: true,
                description: "Body JSON。開始日 YYYY-MM-DD",
            },
            {
                name: "endDate",
                type: "string",
                required: true,
                description: "Body JSON。終了日",
            },
            {
                name: "metrics",
                type: "array",
                required: true,
                description: "Body JSON。メトリクス",
            },
            {
                name: "dimensions",
                type: "array",
                required: true,
                description: "Body JSON。ディメンション",
            },
            {
                name: "limit",
                type: "number",
                required: false,
                description: "Body JSON。取得上限",
            },
        ],
        responseNote: "data（GA4 レスポンス）",
    },
    "GET /api/reports": {
        category: "分析・レポート",
        name: "レポート一覧",
        description: "保存済みレポート一覧を取得します。",
        params: [
            {
                name: "productId",
                type: "number",
                required: false,
                description: "プロダクトID",
            },
        ],
        responseNote: "レポート一覧",
    },
    "GET /api/reports/history": {
        category: "分析・レポート",
        name: "レポート履歴",
        description: "レポート実行履歴を取得します。",
        responseNote: "履歴一覧",
    },
    "GET /api/reports/history/[id]": {
        category: "分析・レポート",
        name: "レポート履歴詳細",
        description: "指定IDのレポート履歴詳細を取得します。",
        responseNote: "履歴詳細",
    },
    "GET /api/reports/[id]": {
        category: "分析・レポート",
        name: "レポート詳細",
        description: "指定IDのレポートを取得します。",
        responseNote: "レポート詳細",
    },
    "GET /api/trend/summary": {
        category: "トレンド",
        name: "トレンドサマリ",
        description: "月次トレンドのサマリを取得します。",
        params: [
            {
                name: "productId",
                type: "number",
                required: true,
                description: "プロダクトID",
            },
            {
                name: "month",
                type: "string",
                required: false,
                description: "YYYY-MM",
            },
        ],
        responseNote: "トレンドサマリ",
    },
    "GET /api/trend/monthly": {
        category: "トレンド",
        name: "月次トレンド",
        description: "月別のPV/CV/CVR推移を取得します。",
        params: [
            {
                name: "productId",
                type: "number",
                required: true,
                description: "プロダクトID",
            },
            {
                name: "months",
                type: "number",
                required: false,
                description: "取得月数",
            },
        ],
        responseNote: "月次データ配列",
    },
    "GET /api/funnel/entry-form": {
        category: "ファネル",
        name: "エントリーフォーム設定",
        description: "エントリーフォームファネルの設定を取得します。",
        params: [
            {
                name: "productId",
                type: "number",
                required: true,
                description: "プロダクトID",
            },
        ],
        responseNote: "ファネル設定",
    },
    "GET /api/funnel/entry-form/compare": {
        category: "ファネル",
        name: "エントリーフォーム期間比較",
        description: "2期間のファネルステップ通過率を比較します。チャネル別内訳（チャネルごとのセッション・CV・CVR の期間差分）も返します。",
        responseNote: "{ success, comparison: { periods, periodA, periodB, geminiEvaluation }, executionId }。各 period に channelBreakdown を含む",
    },
    "POST /api/funnel/path": {
        category: "ファネル",
        name: "経路ファネル実行",
        description: "ページ閲覧・クリックタグを混在させたステップ定義から、GA4の順序付きクローズドファネル（Data API v1alpha runFunnelReport）を実行します。",
        params: [
            {
                name: "propertyId",
                type: "string",
                required: true,
                description: "Body JSON。GA4プロパティID",
            },
            {
                name: "steps",
                type: "array",
                required: true,
                description: "Body JSON。{ name, type: \"page\"|\"click\", matchType, value } の配列（2〜10個）",
            },
            {
                name: "startDate",
                type: "string",
                required: false,
                description: "Body JSON。開始日（デフォルト 30daysAgo）",
            },
            {
                name: "endDate",
                type: "string",
                required: false,
                description: "Body JSON。終了日（デフォルト yesterday）",
            },
        ],
        responseNote: "{ steps: [{ name, users, completionRate, abandonments }] }",
    },
    "GET /api/funnel/executions": {
        category: "ファネル",
        name: "ファネル実行一覧",
        description: "ファネル実行履歴一覧を取得します。",
        params: [
            {
                name: "productId",
                type: "number",
                required: false,
                description: "プロダクトID",
            },
        ],
        responseNote: "実行一覧",
    },
    "GET /api/funnel/executions/[id]": {
        category: "ファネル",
        name: "ファネル実行詳細",
        description: "指定IDのファネル実行詳細を取得します。",
        responseNote: "実行詳細",
    },
    "GET /api/funnel/engagement": {
        category: "ファネル",
        name: "エンゲージメントファネル",
        description: "エンゲージメントファネルの集計を取得します。",
        params: [
            {
                name: "productId",
                type: "number",
                required: true,
                description: "プロダクトID",
            },
        ],
        responseNote: "エンゲージメント集計",
    },
    "GET /api/funnel/engagement/summary": {
        category: "ファネル",
        name: "エンゲージメントサマリ",
        description: "エンゲージメントのサマリを取得します。",
        responseNote: "サマリ",
    },
    "GET /api/funnel/engagement/page-paths": {
        category: "ファネル",
        name: "エンゲージメントページパス",
        description: "ページパス一覧を取得します。",
        responseNote: "ページパス一覧",
    },
    "GET /api/heatmap/view-labels": {
        category: "ヒートマップ・その他",
        name: "ヒートマップビューラベル",
        description: "ヒートマップ用のビューラベル一覧を取得します。",
        params: [
            {
                name: "productId",
                type: "number",
                required: true,
                description: "プロダクトID",
            },
        ],
        responseNote: "ラベル一覧",
    },
    "GET /api/ga4/metadata": {
        category: "ヒートマップ・その他",
        name: "GA4メタデータ",
        description: "利用可能なメトリクス・ディメンション一覧を取得します。",
        responseNote: "メトリクス・ディメンション一覧",
    },
    "GET /api/products": {
        category: "ヒートマップ・その他",
        name: "プロダクト一覧",
        description: "プロダクト一覧を取得します。",
        responseNote: "Product 配列",
    },
    "POST /api/user/timeline": {
        category: "ユーザー行動分析",
        name: "ユーザー行動タイムライン",
        description: "指定した user_pseudo_id のイベント履歴を時系列で取得します。日付グループ・イベント種別・ページパスが含まれます。",
        params: [
            {
                name: "propertyId",
                type: "string",
                required: true,
                description: "Body JSON。GA4プロパティID",
            },
            {
                name: "userId",
                type: "string",
                required: true,
                description: "Body JSON。user_pseudo_id",
            },
            {
                name: "startDate",
                type: "string",
                required: true,
                description: "Body JSON。開始日 YYYY-MM-DD",
            },
            {
                name: "endDate",
                type: "string",
                required: true,
                description: "Body JSON。終了日 YYYY-MM-DD",
            },
            {
                name: "accessToken",
                type: "string",
                required: false,
                description: "Body JSON。GA4アクセストークン（省略時はサービスアカウント）",
            },
        ],
        responseNote: "{ dateGroups: [{ date, events: [{ time, eventName, pagePath, pageTitle, params }] }] }",
    },
    "POST /api/user/list": {
        category: "ユーザー行動分析",
        name: "ユーザーリスト取得",
        description: "期間内のアクティブユーザー一覧をGA4から取得します。セッション数・デバイス・ブラウザ・OS・流入元などを含みます。",
        params: [
            {
                name: "propertyId",
                type: "string",
                required: true,
                description: "Body JSON。GA4プロパティID",
            },
            {
                name: "startDate",
                type: "string",
                required: true,
                description: "Body JSON。開始日",
            },
            {
                name: "endDate",
                type: "string",
                required: true,
                description: "Body JSON。終了日",
            },
            {
                name: "accessToken",
                type: "string",
                required: false,
                description: "Body JSON。GA4アクセストークン",
            },
        ],
        responseNote: "{ users: [{ userId, sessions, pageViews, device, browser, os, source, lastSeen }] }",
    },
    "POST /api/user/segment-builder": {
        category: "ユーザー行動分析",
        name: "セグメントビルダー",
        description: "複数の条件（デバイス・流入元・PV数など）を組み合わせてユーザーをフィルタリングし、該当ユーザー数と行動傾向を返します。",
        params: [
            {
                name: "propertyId",
                type: "string",
                required: true,
                description: "Body JSON。GA4プロパティID",
            },
            {
                name: "startDate",
                type: "string",
                required: true,
                description: "Body JSON。開始日",
            },
            {
                name: "endDate",
                type: "string",
                required: true,
                description: "Body JSON。終了日",
            },
            {
                name: "filters",
                type: "array",
                required: false,
                description: "Body JSON。フィルタ条件の配列",
            },
            {
                name: "accessToken",
                type: "string",
                required: false,
                description: "Body JSON。GA4アクセストークン",
            },
        ],
        responseNote: "{ userCount, avgSessions, avgPageViews, segments }",
    },
    "POST /api/user/cohort": {
        category: "ユーザー行動分析",
        name: "コホートリテンション",
        description: "週別の初回訪問コホートごとに、その後の継続率をマトリクス形式で返します。",
        params: [
            {
                name: "propertyId",
                type: "string",
                required: true,
                description: "Body JSON。GA4プロパティID",
            },
            {
                name: "startDate",
                type: "string",
                required: true,
                description: "Body JSON。開始日",
            },
            {
                name: "endDate",
                type: "string",
                required: true,
                description: "Body JSON。終了日",
            },
            {
                name: "accessToken",
                type: "string",
                required: false,
                description: "Body JSON。GA4アクセストークン",
            },
        ],
        responseNote: "{ cohorts: [{ week, users, retention: [{ weekOffset, rate }] }] }",
    },
    "POST /api/user/scoring": {
        category: "ユーザー行動分析",
        name: "活動スコアリング",
        description: "セグメント軸（デバイス・流入元など）ごとにRFEDスコアを算出し、活性/休眠/離脱リスクに分類します。",
        params: [
            {
                name: "propertyId",
                type: "string",
                required: true,
                description: "Body JSON。GA4プロパティID",
            },
            {
                name: "segmentDimension",
                type: "string",
                required: true,
                description: "Body JSON。集計軸（deviceCategory / sessionSource / sessionMedium / operatingSystem / browser / country）",
            },
            {
                name: "periodDays",
                type: "number",
                required: true,
                description: "Body JSON。集計期間（30/60/90）",
            },
        ],
        responseNote: "{ segments: [{ name, score, rank, activeUsers, sessionsPerUser, pvPerSession, engagementRate, recentUserRatio, scores }], summary: { active, dormant, churn } }",
    },
    "POST /api/user/scoring/gemini": {
        category: "ユーザー行動分析",
        name: "スコアリング AI診断",
        description: "スコアリング結果をAI分析し、活性/休眠/離脱リスクセグメントの行動パターン差異と改善施策を返します。APIキーは環境変数 GEMINI_API_KEY を使用します。",
        params: [
            {
                name: "segments",
                type: "array",
                required: true,
                description: "Body JSON。スコアリング結果の配列",
            },
            {
                name: "segmentDimension",
                type: "string",
                required: true,
                description: "Body JSON。集計軸",
            },
            {
                name: "periodDays",
                type: "number",
                required: true,
                description: "Body JSON。集計期間",
            },
        ],
        responseNote: "{ analysis: string }（AIによる自然言語分析）",
    },
    "POST /api/user/stickiness": {
        category: "ユーザー行動分析",
        name: "スティッキネス分析",
        description: "指定期間のDAU/WAU/MAU推移と期間サマリを返します。compareStartDate/compareEndDate を指定すると2期間比較が可能です。",
        params: [
            {
                name: "propertyId",
                type: "string",
                required: true,
                description: "Body JSON。GA4プロパティID",
            },
            {
                name: "startDate",
                type: "string",
                required: true,
                description: "Body JSON。開始日",
            },
            {
                name: "endDate",
                type: "string",
                required: true,
                description: "Body JSON。終了日",
            },
            {
                name: "compareStartDate",
                type: "string",
                required: false,
                description: "Body JSON。比較期間の開始日（省略時は比較なし）",
            },
            {
                name: "compareEndDate",
                type: "string",
                required: false,
                description: "Body JSON。比較期間の終了日",
            },
            {
                name: "accessToken",
                type: "string",
                required: false,
                description: "Body JSON。GA4アクセストークン",
            },
        ],
        responseNote: "{ current: { dailySeries, avgDAU, totalMAU, stickinessDAUMAU, stickinessWAUMAU, avgSessionsPerUser }, compare: 同構造 | null }",
    },
    "POST /api/user/stickiness/gemini": {
        category: "ユーザー行動分析",
        name: "スティッキネス AI分析",
        description: "スティッキネスデータをAI分析します。期間比較データがある場合は比較インサイトを生成します。APIキーは環境変数 GEMINI_API_KEY を使用します。",
        params: [
            {
                name: "current",
                type: "object",
                required: true,
                description: "Body JSON。現在期間のスティッキネスメトリクス",
            },
            {
                name: "compare",
                type: "object",
                required: false,
                description: "Body JSON。比較期間のメトリクス（省略可）",
            },
        ],
        responseNote: "{ analysis: string }（AIによる自然言語分析）",
    },
    "POST /api/journey": {
        category: "ユーザー経路・離脱分析",
        name: "ユーザー経路分析",
        description: "GA4の pageReferrer × sessionDefaultChannelGroup を使ってページ遷移フロー・離脱経路・フォーム到達率を集計します。Sankeyダイアグラム用ノード/フロー・上位パターン・チャネル別ランキングを返します。",
        params: [
            {
                name: "propertyId",
                type: "string",
                required: true,
                description: "Body JSON。GA4プロパティID",
            },
            {
                name: "startDate",
                type: "string",
                required: true,
                description: "Body JSON。開始日",
            },
            {
                name: "endDate",
                type: "string",
                required: true,
                description: "Body JSON。終了日",
            },
            {
                name: "goalPath",
                type: "string",
                required: true,
                description: "Body JSON。ゴールページパス（例: /members/signup）",
            },
            {
                name: "goalLabel",
                type: "string",
                required: false,
                description: "Body JSON。ゴールの表示名",
            },
            {
                name: "deviceFilter",
                type: "string",
                required: false,
                description: "Body JSON。デバイス絞り込み（desktop / mobile / tablet）",
            },
            {
                name: "accessToken",
                type: "string",
                required: false,
                description: "Body JSON。GA4アクセストークン",
            },
        ],
        responseNote: "{ nodes, flows, topPaths, rawTopPaths, dropoutPaths, rawDropoutPaths, totalUsers, goalUsers, formStats, channelRanking, referrerRanking, pageExitRates }",
    },
    "POST /api/journey/gemini": {
        category: "ユーザー経路・離脱分析",
        name: "離脱経路 AI分析",
        description: "離脱経路パターンデータをAI分析し、主要な離脱ポイント・行動心理・改善提案を返します。APIキーは環境変数 GEMINI_API_KEY を使用します。",
        params: [
            {
                name: "paths",
                type: "array",
                required: true,
                description: "Body JSON。離脱経路パターン（channel, n2, n1, dropout, ratio）の配列",
            },
            {
                name: "totalUsers",
                type: "number",
                required: true,
                description: "Body JSON。集計期間のアクティブユーザー数",
            },
            {
                name: "goalUsers",
                type: "number",
                required: true,
                description: "Body JSON。フォーム到達ユーザー数",
            },
            {
                name: "startDate",
                type: "string",
                required: true,
                description: "Body JSON。集計開始日",
            },
            {
                name: "endDate",
                type: "string",
                required: true,
                description: "Body JSON。集計終了日",
            },
        ],
        responseNote: "{ analysis: string }（AIによる自然言語分析）",
    },
    "POST /api/exit": {
        category: "ユーザー経路・離脱分析",
        name: "離脱分析",
        description: "各ページの離脱率・離脱数・ファネルステップ別の落ち込みを集計します。行動シグナル（平均滞在時間・スクロール到達率）も返します。",
        params: [
            {
                name: "propertyId",
                type: "string",
                required: true,
                description: "Body JSON。GA4プロパティID",
            },
            {
                name: "startDate",
                type: "string",
                required: true,
                description: "Body JSON。開始日",
            },
            {
                name: "endDate",
                type: "string",
                required: true,
                description: "Body JSON。終了日",
            },
            {
                name: "accessToken",
                type: "string",
                required: false,
                description: "Body JSON。GA4アクセストークン",
            },
        ],
        responseNote: "{ pages: [{ path, exitCount, exitRate, sessions, avgEngagementSec, scrollRate }], funnel: [...] }",
    },
    "POST /api/pageflow": {
        category: "ユーザー経路・離脱分析",
        name: "ページフロー分析",
        description: "指定ページの「直前に見ていたページ」（pageReferrer集計）と「直後に見たページ」（対象ページをリファラーとするpagePath集計）を両方向で返します。",
        params: [
            {
                name: "propertyId",
                type: "string",
                required: true,
                description: "Body JSON。GA4プロパティID",
            },
            {
                name: "pagePath",
                type: "string",
                required: true,
                description: "Body JSON。対象ページパス（/始まり、前方一致）",
            },
            {
                name: "startDate",
                type: "string",
                required: false,
                description: "Body JSON。開始日（デフォルト 30daysAgo）",
            },
            {
                name: "endDate",
                type: "string",
                required: false,
                description: "Body JSON。終了日（デフォルト yesterday）",
            },
        ],
        responseNote: "{ pagePath, targetUsers, prevPages: [{ page, users, pv, sourcePv, transitionRate }], prevNoReferrer, nextPages: [{ page, users }] }",
    },
    "POST /api/exit/gemini": {
        category: "ユーザー経路・離脱分析",
        name: "離脱分析 AI考察",
        description: "離脱データと行動シグナルをAI分析し、離脱の質（即離脱 / 読了後離脱）の判定と改善提案を返します。APIキーは環境変数 GEMINI_API_KEY を使用します。",
        params: [
            {
                name: "steps",
                type: "array",
                required: true,
                description: "Body JSON。ファネルステップ別の離脱データ",
            },
            {
                name: "exitCategories",
                type: "array",
                required: true,
                description: "Body JSON。ページカテゴリ別の離脱指標（行動シグナル含む）",
            },
            {
                name: "startDate",
                type: "string",
                required: true,
                description: "Body JSON。集計開始日",
            },
            {
                name: "endDate",
                type: "string",
                required: true,
                description: "Body JSON。集計終了日",
            },
            {
                name: "deviceFilter",
                type: "string",
                required: false,
                description: "Body JSON。デバイス絞り込み",
            },
        ],
        responseNote: "{ analysis: string }（AIによる自然言語分析）",
    },
    "POST /api/docs/ask": {
        category: "ドキュメント",
        name: "ドキュメントQ&A",
        description: "機能一覧・API一覧・ドメイン知識を知識ベースとして、質問にAIが回答します。ドキュメントに記載がない内容は推測せずその旨を返します。APIキーは環境変数 GEMINI_API_KEY を使用します。",
        params: [
            {
                name: "question",
                type: "string",
                required: true,
                description: "Body JSON。質問文（1000文字以内）",
            },
        ],
        responseNote: "{ answer: string }（AIによる回答）",
    },
    "POST /api/reports/weekly-summary": {
        category: "アラート・定期配信",
        name: "週次AIサマリー配信",
        description: "先週（月〜日）のKPI前週比・チャネル別セッション変動・実行中ABテストの途中経過を集計し、AIサマリーを添えてSlackに配信します。スケジューラが毎週月曜09:00 JSTに実行します（x-internal-secret ヘッダーで認証）。",
        responseNote: "{ success: true, results: [{ productId, productName, weekStart, weekEnd, kpis, channelMoves, runningAbTests, aiSummary }] }",
    },
    "POST /api/alerts/cv-drop": {
        category: "アラート・定期配信",
        name: "CV急落チェック",
        description: "全プロダクトの前日セッション数・応募CV・LP応募CV・会員登録CV・全体CVRを過去8週の同一曜日の中央値と比較し、しきい値（デフォルト30%）以上下落した指標があればSlackに通知します。発火時はチャネル別・デバイス別・ページ別の下落内訳を自動集計し、AIの原因仮説を添付します。スケジューラが毎日09:30 JSTに実行します（x-internal-secret ヘッダーで認証）。",
        responseNote: "{ success: true, results: [{ productId, productName, targetDate, dropThreshold, alerts: [{ metric, label, yesterday, baselineAvg, dropRate }], drilldowns, aiHypothesis }] }",
    },
    "GET /api/alerts/config": {
        category: "アラート・定期配信",
        name: "アラート設定一覧",
        description: "全プロダクトのCV急落アラート設定を返します。未設定のプロダクトはデフォルト値（しきい値30%・全指標監視）を返します。",
        responseNote: "{ configs: [{ productId, productName, enabled, dropThreshold, minSessions, minCv, metrics }] }。metrics は監視対象指標キーの配列（null = 全指標）",
    },
    "PUT /api/alerts/config": {
        category: "アラート・定期配信",
        name: "アラート設定保存",
        description: "プロダクトのCV急落アラート設定を保存します（upsert）。",
        params: [
            {
                name: "productId",
                type: "number",
                required: true,
                description: "Body JSON。プロダクトID",
            },
            {
                name: "enabled",
                type: "boolean",
                required: false,
                description: "Body JSON。アラート有効/無効（デフォルト true）",
            },
            {
                name: "dropThreshold",
                type: "number",
                required: true,
                description: "Body JSON。下落率しきい値（0〜1。0.3 = 30%）",
            },
            {
                name: "minSessions",
                type: "number",
                required: false,
                description: "Body JSON。判定に必要な最小ベースラインセッション数",
            },
            {
                name: "minCv",
                type: "number",
                required: false,
                description: "Body JSON。判定に必要な最小ベースラインCV数",
            },
            {
                name: "metrics",
                type: "array",
                required: false,
                description: "Body JSON。監視対象指標キーの配列（全指標選択時は null 保存）",
            },
        ],
        responseNote: "{ success: true, config }",
    },
    "POST /api/occupation": {
        category: "職種別CV分析",
        name: "職種別CV集計",
        description: "会員登録サンクスページの ?occ= パラメータ別CV、職種スラッグ配下のセッション、/lp-thanks/{slug} 別のLP応募CVを集計します。",
        params: [
            {
                name: "propertyId",
                type: "string",
                required: true,
                description: "Body JSON。GA4プロパティID",
            },
            {
                name: "startDate",
                type: "string",
                required: false,
                description: "Body JSON。開始日（デフォルト 30daysAgo）",
            },
            {
                name: "endDate",
                type: "string",
                required: false,
                description: "Body JSON。終了日（デフォルト yesterday）",
            },
            {
                name: "accessToken",
                type: "string",
                required: false,
                description: "Body JSON。GA4アクセストークン",
            },
        ],
        responseNote: "{ occupations: [{ occ, label, slug, signupCv, sessions, signupRate }], noOccSignupCv, totalSignupCv, lpApplies: [{ slug, label, cv }], totalLpApplyCv }",
    },
    "POST /api/occupation/detail": {
        category: "職種別CV分析",
        name: "職種内サブカテゴリ内訳",
        description: "指定した職種スラッグ配下のセッションを、サブカテゴリ（例: /driver/chugata-truck）・一覧トップ・都道府県ページ・求人詳細その他に分解して返します。",
        params: [
            {
                name: "propertyId",
                type: "string",
                required: true,
                description: "Body JSON。GA4プロパティID",
            },
            {
                name: "slug",
                type: "string",
                required: true,
                description: "Body JSON。職種スラッグ（例: driver）",
            },
            {
                name: "startDate",
                type: "string",
                required: false,
                description: "Body JSON。開始日（デフォルト 30daysAgo）",
            },
            {
                name: "endDate",
                type: "string",
                required: false,
                description: "Body JSON。終了日（デフォルト yesterday）",
            },
        ],
        responseNote: "{ slug, totalSessions, listTopSessions, prefectureSessions, jobDetailAndOtherSessions, subCategories: [{ segment, path, sessions }] }",
    },
    "POST /api/occupation/gemini": {
        category: "職種別CV分析",
        name: "職種別CV AI考察",
        description: "職種別CVデータをAI分析し、伸びしろ職種・流入強化候補・推奨施策を返します。APIキーは環境変数 GEMINI_API_KEY を使用します。",
        params: [
            {
                name: "occupations",
                type: "array",
                required: true,
                description: "Body JSON。職種別集計の配列",
            },
            {
                name: "lpApplies",
                type: "array",
                required: false,
                description: "Body JSON。事業領域別LP応募CVの配列",
            },
            {
                name: "noOccSignupCv",
                type: "number",
                required: false,
                description: "Body JSON。職種指定なしの会員登録CV",
            },
        ],
        responseNote: "{ analysis: string }（AIによる自然言語分析）",
    },
    "POST /api/scout/funnel": {
        category: "求人種別CV分析",
        name: "スカウト効果ファネル集計",
        description: "スカウトファネルを横断集計します。送信リクエストは本体DynamoDB（ScoutHistories-prd）のattempts、閲覧はGA4の /scout/ ページ（pagePathからscoutIdを抽出して企業に紐付け）、応募はscoutId付きURL（pageLocation CONTAINS scoutId=）でのエントリーフォーム送信ボタンクリックです。送達（sent）はdrm-front側の書き戻し実装後に有効になります。",
        params: [
            {
                name: "propertyId",
                type: "string",
                required: true,
                description: "Body JSON。GA4プロパティID",
            },
            {
                name: "startDate",
                type: "string",
                required: false,
                description: "Body JSON。開始日（デフォルト 30daysAgo）",
            },
            {
                name: "endDate",
                type: "string",
                required: false,
                description: "Body JSON。終了日（デフォルト yesterday）",
            },
        ],
        responseNote: "{ summary: { requested, sent, failed, viewedUsers, viewedScoutIds, appliedUsers }, daily: [{date, requested, viewed, applied}], companies: [{companyId, companyName, requested, sent, viewed, applied}] }",
    },
    "POST /api/applications/actual": {
        category: "求人種別CV分析",
        name: "応募の全体像（DB実数）",
        description: "本体DynamoDB（JobApplication-prd + GuestJobApplication-prd）から期間内の実応募を集計し、種別（人材紹介/求人広告/ハローワーク）×流入レイヤー（自然/featured=CRM配信/CA紹介/スカウト）×会員/ゲストで返します。あわせて会員登録の内訳（登録のみ=GA4 thanks到達、応募と同時=応募時刻とユーザー作成時刻が10分以内）を判定します。フルスキャンのため応答に十数秒かかります。",
        params: [
            {
                name: "propertyId",
                type: "string",
                required: false,
                description: "Body JSON。指定時は「登録のみ」をGA4から取得",
            },
            {
                name: "startDate",
                type: "string",
                required: false,
                description: "Body JSON。開始日（デフォルト 30daysAgo）",
            },
            {
                name: "endDate",
                type: "string",
                required: false,
                description: "Body JSON。終了日（デフォルト yesterday）",
            },
        ],
        responseNote: "{ types: [{label, layers: {natural|featured|scout|caReferral|other: {member, guest}}, total}], grandTotal, memberTotal, guestTotal, signup: {standalone, withApplication, withApplicationByType} }",
    },
    "POST /api/cv-types": {
        category: "求人種別CV分析",
        name: "求人種別CV集計",
        description: "応募CVをGTMラベルで人材紹介・求人広告・ハローワークに分解します。詳細・フォームはビューラベル（DL__Media / EF__Job*__Area__Header）、完了は送信ボタンのクリックラベル（EF__Job*__Btn__応募する/話を聞いてみる。DB実応募数と一致確認済み）。求人種別ファネル・日別推移・会員登録（ページベース）を返します。",
        params: [
            {
                name: "propertyId",
                type: "string",
                required: true,
                description: "Body JSON。GA4プロパティID",
            },
            {
                name: "startDate",
                type: "string",
                required: false,
                description: "Body JSON。開始日（デフォルト 30daysAgo）",
            },
            {
                name: "endDate",
                type: "string",
                required: false,
                description: "Body JSON。終了日（デフォルト yesterday）",
            },
        ],
        responseNote: "{ jobTypes: [{ key, label, detailViews, formViews, completed, detailToForm, formToComplete, overallRate }], signup: { formViews, completed, formToComplete }, daily }",
    },
    "POST /api/insights": {
        category: "月次インサイト",
        name: "月次KPIデータ取得",
        description: "今月と先月のGA4 KPI（アクティブユーザー・新規ユーザー・セッション・エンゲージメント率・平均セッション時間・PV・上位ページ）を並行取得して返します。今月は月初〜当日、先月は月初〜末日。",
        params: [
            {
                name: "propertyId",
                type: "string",
                required: true,
                description: "Body JSON。GA4プロパティID",
            },
            {
                name: "accessToken",
                type: "string",
                required: false,
                description: "Body JSON。GA4アクセストークン",
            },
        ],
        responseNote: "{ current: MonthMetrics, previous: MonthMetrics }。MonthMetrics = { startDate, endDate, activeUsers, newUsers, sessions, engagementRate, avgSessionDuration, screenPageViews, topPages }",
    },
    "POST /api/insights/gemini": {
        category: "月次インサイト",
        name: "月次インサイト AI生成",
        description: "今月・先月のKPIデータをAIに渡し、サマリー・良い点・注意点・来月の推奨アクション3点を含む月次レポートを生成します。APIキーは環境変数 GEMINI_API_KEY を使用します。",
        params: [
            {
                name: "current",
                type: "object",
                required: true,
                description: "Body JSON。今月のMonthMetrics",
            },
            {
                name: "previous",
                type: "object",
                required: true,
                description: "Body JSON。先月のMonthMetrics",
            },
        ],
        responseNote: "{ analysis: string }（AIによる月次レポートテキスト）",
    },
}
