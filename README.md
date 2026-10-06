# GA4 Analytics Dashboard

x-work.jp（クロスワーク。現場系職種の求人転職プラットフォーム）向けの GA4 データ分析・施策管理ダッシュボード。
GA4 Data API / GA4 BigQuery Export / 本体 DynamoDB / Search Console / Salesforce 由来のスナップショットを集計し、
応募・会員登録の CV、ファネル、AB テスト、チャネル別の成果を見る。

- 機能一覧と使い方はアプリ内の **`/docs/features`**（`lib/registry/pages.ts` から生成）
- API 一覧は **`/docs/api`**（`app/api` から自動生成）
- 事業用語・計測仕様・既知のインシデントは **`/docs/glossary`**（`lib/docs/domainKnowledge.ts`）
- Claude Code 向けの作業ルールは `CLAUDE.md`

---

## 技術スタック

| 項目 | 内容 |
|---|---|
| フレームワーク | Next.js 16（App Router / Turbopack）、React 19、TypeScript |
| DB | PostgreSQL 16 + Prisma（実行履歴・AB テスト・設定） |
| キャッシュ | Redis 7 |
| データソース | GA4 Data API、GA4 BigQuery Export（`xmile-drm.analytics_534098180`）、DynamoDB（本体・読み取り専用）、Search Console、Salesforce スナップショット |
| ログ蓄積 | BigQuery `xmile-drm.ga4_analytics_dashboard`（`lib/bq/schemas.ts`） |
| AI | Google Gemini 2.5 Flash |
| スタイル | CSS Modules（意味トークンは `app/globals.css`、共通クラスは `components/ui`）。Tailwind は base のみ |
| グラフ | Recharts（一部 ECharts） |
| Lint / 型 | ESLint 9（flat config・レイヤ境界ルール）、`tsc --noEmit` |
| インフラ | AWS EC2 t4g.small（ARM）、Docker Compose、GHCR、GitHub Actions |

---

## ローカル開発

### 前提

- Docker Desktop
- `service-account-key.json`（GA4 / BigQuery のサービスアカウントキー）をプロジェクト直下に配置

### 起動

```bash
cp .env.example .env
# .env を編集（GEMINI_API_KEY, SLACK_WEBHOOK_URL 等）
docker compose -f docker-compose.local.yml up -d
```

ブラウザで http://localhost:3003 を開く。

- ソースはボリュームマウントされ、コード変更は保存と同時に反映される
- 初回起動時のみ `npm ci` と `prisma migrate deploy` が自動実行される
- ポート: app=3003、postgres=5432、redis=6380
- ローカルで `tsx` を直接動かすと esbuild のバイナリ不一致で失敗することがある。その場合は `docker exec ga4-dashboard-app-local npx tsx ...` で実行する

### npm で直接起動する場合（DB のみ Docker）

```bash
docker compose -f docker-compose.local.yml up -d postgres redis
npm ci --legacy-peer-deps
npx prisma generate && npx prisma migrate deploy
npm run dev
```

---

## 環境変数

`.env.example` をコピーして `.env` を作成する。

| 変数 | 必須 | 説明 |
|---|---|---|
| `DATABASE_URL` | ✓ | PostgreSQL 接続文字列 |
| `REDIS_URL` | ✓ | Redis 接続文字列 |
| `INTERNAL_API_SECRET` | ✓ | スケジューラー → API 間の内部認証シークレット |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` | | 画面の Basic 認証（未設定なら認証なし） |
| `GCP_SERVICE_ACCOUNT_KEY` / `GCP_SERVICE_ACCOUNT_KEY_PATH` | | GA4 / BigQuery 読み取り用サービスアカウント（JSON 文字列またはパス） |
| `BQ_WRITE_SERVICE_ACCOUNT_KEY` | | BigQuery ログ書き込み用（未設定なら書き込みをスキップ） |
| `DDB_AWS_ACCESS_KEY_ID` / `DDB_AWS_SECRET_ACCESS_KEY` / `DDB_AWS_REGION` | | 本体 DynamoDB の読み取り（スカウト・応募・ステップメール） |
| `GEMINI_API_KEY` | | AI 分析（未設定なら AI 系ボタンは失敗する） |
| `SLACK_WEBHOOK_URL` | | AB テスト実行完了・CV 急落アラートの通知先 |
| `SLACK_WEBHOOK_URL_ABREPORT` | | AB テスト完了時の結果共有チャンネル |
| `NOTION_API_KEY` | | AB テスト最終レポートに施策カードの企画背景を注入 |
| `CV_DROP_ALERT_THRESHOLD` / `CV_SPIKE_ALERT_THRESHOLD` | | アラートのしきい値（既定 30% / 50%） |
| `APP_URL` / `NEXT_PUBLIC_APP_URL` | | 公開 URL（Slack 通知のリンク・クライアント参照） |

---

## 本番デプロイ

- **ビルド**: GitHub Actions（`.github/workflows/deploy.yml`）。EC2 ではビルドしない
- **ジョブ**: `verify`（`npm run check` = typecheck + lint + レジストリ整合 + API 一覧整合）→ `build-app` / `build-scheduler`（linux/arm64、`Dockerfile` の `app` / `scheduler` ターゲット）→ GHCR へ push → EC2 へ SSH で `docker compose pull && up -d`
- **master への push がそのまま本番に出る。** 各コミットは単体でビルドできる状態にしてから push する

### 初回 EC2 セットアップ

```bash
# GHCR にログイン（GitHub Personal Access Token が必要）
echo $GHCR_TOKEN | docker login ghcr.io -u <user> --password-stdin
git clone git@github.com:icessinon/ga4-analytics-dashboard.git && cd ga4-analytics-dashboard
# .env と service-account-key.json を配置してから
docker compose up -d
```

EC2 は t4g.small（2GB）なので、OOM 防止にスワップ（2GB）を設定しておく。

---

## ディレクトリ構造

```
app/                     ページ（1 ディレクトリ = 1 ページ。page.tsx + *.module.css）と app/api/**/route.ts
components/
  PageShell/             ページの枠（h1・戻り先・期間 UI・状態・関連ページ）。全ページがこれを使う
  ui/                    共通クラス（card / sectionTitle / summaryCard / dataTable / tabs / input ...）
  FilterBar/ PeriodSelect/ LoadState/ Alert/ ...   共通 UI
  <domain>/              ページ固有のコンポーネント（dashboard / funnel / ab-test / scout / docs）
contexts/                ProductContext / LabelContext（React）
hooks/                   useReport（fetch + loading/error）、usePeriodRange
lib/
  registry/              ページの正（id / href / title / category / tags / doc）。サイドメニュー・関連導線・機能ドキュメントの源泉
  api/ga4/               GA4 Data API クライアント、filters / rows / report（route 用の定型）
  api/google/ gsc/ gemini/ bq/ aws/   外部クライアント
  http/                  readGa4Body / errorResponse（route 層ヘルパ）
  db/                    Prisma クライアント、resolvePropertyId
  services/<domain>/     集計ロジック（*Service.ts）と API 型（*Types.ts。クライアントは import type で参照）
  docs/                  apiList（生成物＋注釈）、domainKnowledge、knowledgeBase（AI Q&A）
  constants/             スナップショット定数（CV 単価・ペルソナ・スカウト属性・UTM カタログ）
workers/                 AB テストスケジューラー、BQ 補完同期
scripts/
  check/                 CI チェック（check-page-registry / gen-api-list）
  verify/                API スナップショット（移行前後のレスポンス比較）
  snapshots/             定数スナップショットの再生成
  ops/                   運用（本番 API 呼び出し、Slack レポート、低メモリビルド）
prisma/                  スキーマ・マイグレーション
docs/                    utm-naming-convention.md（現役）、archive/（日付付きの調査・計画メモ）
```

レイヤの約束（ESLint で検査）: `lib/**` は `app` / `hooks` / `contexts` / `components` を import しない。`lib/bq/**` は DB を触らない。

---

## npm スクリプト

| コマンド | 説明 |
|---|---|
| `npm run dev` / `build` / `start` | 開発サーバー / 本番ビルド / 本番起動 |
| `npm run check` | CI と同じ検査（typecheck + lint + check:registry + check:api-list） |
| `npm run lint` | ESLint（レイヤ境界ルールを含む） |
| `npm run check:registry` | `app/**/page.tsx` と `lib/registry/pages.ts` の突合 |
| `npm run gen:api-list` | `lib/docs/apiList.generated.ts` を `app/api` から再生成（route を足したら実行） |
| `npm run verify:api` | API スナップショット。`--update` で保存、`--compare` で差分（`scripts/verify/cases.json`） |
| `npm run db:migrate` / `db:generate` | Prisma |
| `npm run scheduler` | AB テストスケジューラー（Docker 外で使う場合） |

---

## DB スキーマ

`prisma/schema.prisma`（12 モデル）。

| モデル | 役割 |
|---|---|
| Product | プロダクト（GA4 プロパティ紐付け） |
| AlertConfig | CV 急落アラートの設定 |
| PageCvConfig | ページ別 CV イベント設定（トップのページ別指標） |
| Report / ReportExecution | GA4 分析レポートの定義と実行結果 |
| AbTest / AbTestReportExecution / AbTestResult | AB テストの定義・実行履歴・バリアント別結果 |
| FunnelConfig / FunnelExecution | ファネル設定と実行履歴 |
| Session / HeatmapEvent | セッション・ヒートマップイベント（旧機能） |

実行履歴・AB 結果・AI 最終レポートは BigQuery にも蓄積する（`lib/services/logging/activityLogService.ts`）。

---

## 開発ルール

- **BigQuery は dry run 必須**。`runGa4EventsQuery` が内部で dry run して 5GB 超を拒否する。`events_*` を読むクエリには `GA4_EXPORT_DEFAULT_FILTER`（bot 除外）を必ず付ける
- **スタイル**: CSS Modules のみ。色は `app/globals.css` の意味トークン（`--text-*` / `--bg-*` / `--border*` / `--accent*` / `--status-*`）を使い、直書きしない。ダークテーマ固定
- **ページを作る**: `lib/registry/pages.ts` に登録 → `page.tsx` は `PageShell` の中に本文だけ書く → データ取得は `useReport` → API 型は `lib/services/<domain>/*Types.ts` から `import type`
- **API を作る**: `readGa4Body` → `lib/services` の関数 → `NextResponse.json`。route の先頭に JSDoc を書く（API 一覧の説明になる）→ `npm run gen:api-list`
- **コメント**: 自明なものは書かない。WHY が非自明な場合のみ
