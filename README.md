# GA4 Analytics Dashboard

x-work.jp（求人転職サービス）向けの GA4 データ分析・施策管理ダッシュボード。

---

## 機能一覧

| カテゴリ | 機能 |
|---|---|
| **ダッシュボード** | プロダクト別 KPI サマリー、CV 設定 |
| **レポート** | PV / CV / CVR 月次トレンド、AI 分析 |
| **月次インサイト** | 今月 vs 先月 KPI 比較、週次内訳（第1〜5週）、AI レポート生成 |
| **AB テスト** | 統計的有意性検定、勝者判定、AI 評価、スケジュール自動実行 |
| **ファネル分析** | エントリーフォームファネル、期間比較、エンゲージメント分析 |
| **ユーザー分析** | セグメントビルダー、スコアリング、スティッキネス、コホート |
| **ユーザージャーニー** | 離脱経路分析、AI 分析 |
| **ヒートマップ** | クリック・スクロール深度のゾーン可視化 |
| **AI 利用状況** | Gemini API コスト・呼び出し数の日次/週次/月次確認、CSV エクスポート |
| **データ履歴** | レポート実行履歴、AB テスト履歴 |

---

## 技術スタック

| 項目 | 内容 |
|---|---|
| フレームワーク | Next.js 16（App Router）、React 19 |
| 言語 | TypeScript |
| DB | PostgreSQL 16 + Prisma |
| キャッシュ | Redis 7 |
| AI | Google Gemini 2.5 Flash |
| スタイル | CSS Modules（Tailwind は使用しない） |
| グラフ | Recharts |
| インフラ | AWS EC2 t4g.small（ARM）、Docker Compose |

---

## ローカル開発

### 前提

- Docker Desktop がインストールされていること
- `service-account-key.json`（GA4 サービスアカウントキー）をプロジェクト直下に配置

### 起動

```bash
cp .env.example .env
# .env を編集（GEMINI_API_KEY, SLACK_WEBHOOK_URL 等）

docker compose -f docker-compose.local.yml up -d
```

ブラウザで [http://localhost:3003](http://localhost:3003) を開く。

- ソースをボリュームマウントしているため、**コード変更は保存と同時に反映**（ビルド不要）
- 初回起動時のみ `npm ci` と `prisma migrate deploy` が自動実行される
- ポート: app=3003, postgres=5432, redis=6380

### npm で直接起動する場合（DB のみ Docker）

```bash
docker compose -f docker-compose.local.yml up -d postgres redis

npm install
npm run db:migrate
npm run dev
```

---

## 環境変数

`.env.example` をコピーして `.env` を作成。

| 変数 | 必須 | 説明 |
|---|---|---|
| `DATABASE_URL` | ✓ | PostgreSQL 接続文字列 |
| `REDIS_URL` | ✓ | Redis 接続文字列 |
| `GEMINI_API_KEY` | | Google Gemini API キー（AI 機能を使う場合） |
| `SLACK_WEBHOOK_URL` | | AB テスト完了通知の Slack Webhook |
| `INTERNAL_API_SECRET` | ✓ | スケジューラー→API 間の内部認証シークレット |
| `APP_URL` | | アプリの公開 URL（Slack 通知リンク用） |
| `NEXT_PUBLIC_APP_URL` | | クライアントから参照する公開 URL |

---

## 本番デプロイ

### 構成

- **ビルド**: ローカル Mac または GitHub Actions（EC2 ではビルドしない）
- **イメージ配布**: GHCR（GitHub Container Registry）
- **インフラ**: EC2 t4g.small（`docker compose up -d` で常時稼働）

### 自動デプロイ（GitHub Actions）

`master` ブランチへの push で自動的にビルド・GHCR push が走る。

EC2 側は cron（5分ごと）で pull・再起動する：

```bash
# EC2 で一度だけ設定
crontab -e
```

```
*/5 * * * * cd /var/www/ga4-analytics-dashboard && git pull origin master && docker compose pull && docker compose up -d >> /var/log/ga4-deploy.log 2>&1
```

### 初回 EC2 セットアップ

```bash
# GHCR にログイン（GitHub Personal Access Token が必要）
echo "GITHUB_TOKEN" | docker login ghcr.io -u GITHUB_USERNAME --password-stdin

# リポジトリをクローン
git clone https://github.com/xmile-inc/ga4-analytics-dashboard.git /var/www/ga4-analytics-dashboard
cd /var/www/ga4-analytics-dashboard

# .env と service-account-key.json を配置
cp .env.example .env
vi .env

# 起動
docker compose up -d
```

### EC2 のスワップ設定（OOM 防止）

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## ディレクトリ構造

```
app/
  api/          # API Routes
  ab-test/      # AB テスト
  ai-usage/     # AI 利用状況
  analytics/    # アナリティクス
  dashboard/    # ダッシュボード
  funnel/       # ファネル分析
  heatmap/      # ヒートマップ
  insights/     # 月次インサイト
  journey/      # ユーザージャーニー
  reports/      # トレンドレポート
  user/         # ユーザー分析（セグメント・スコアリング等）
components/     # 共有コンポーネント
lib/
  api/          # GA4・Gemini クライアント
  services/     # ビジネスロジック
  utils/        # ユーティリティ
workers/        # バックグラウンドワーカー（AB テストスケジューラー）
prisma/         # スキーマ・マイグレーション
.github/
  workflows/    # GitHub Actions（deploy.yml）
```

---

## npm スクリプト

| コマンド | 説明 |
|---|---|
| `npm run dev` | 開発サーバー起動 |
| `npm run build` | 本番ビルド |
| `npm run start` | 本番サーバー起動 |
| `npm run db:migrate` | DB マイグレーション実行 |
| `npm run db:generate` | Prisma クライアント生成 |
| `npm run scheduler` | AB テストスケジューラー起動（Docker 外で使う場合） |

---

## DB スキーマ

`prisma/schema.prisma` 参照。

| テーブル | 役割 |
|---|---|
| `products` | プロダクト（GA4 プロパティ紐付け） |
| `page_cv_configs` | ページ別 CV イベント設定 |
| `reports` | レポート定義 |
| `report_executions` | レポート実行履歴・結果 |
| `ab_tests` | AB テスト定義・勝者・改善率 |
| `ab_test_report_executions` | AB テスト実行履歴 |
| `funnel_configs` | ファネル設定 |
| `funnel_executions` | ファネル実行履歴・結果 |
| `sessions` | セッション管理 |
| `heatmap_events` | ヒートマップイベント |

---

## 開発ルール

- **スタイル**: CSS Modules のみ（`*.module.css`）。Tailwind クラスは直接書かない
- **型**: ページ固有の型はそのファイル内、共有型は `types.ts`
- **コメント**: 自明なものは書かない。WHY が非自明な場合のみ1行で記述
- **ログ**: `console.error` は API・サービス層のエラー調査用のみ残す
