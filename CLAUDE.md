# CLAUDE.md

x-work.jp（クロスワーク）向け GA4 分析ダッシュボード。Next.js 16 / Prisma / GA4 Data API / BigQuery。
回答は日本語。

## まず気をつけること

- **master への push がそのまま本番デプロイ**（GitHub Actions → GHCR → EC2）。コミットは単体で `npm run check` と `npm run build` が通る状態にする。push は依頼されたときだけ
- **BigQuery は dry run 必須・予測コスト 10 円未満**（組織ルール）。`runGa4EventsQuery` が内部で dry run する。`events_*` を読むクエリには `GA4_EXPORT_DEFAULT_FILTER`（海外 bot 除外）を必ず付ける
- 他の人の作業中ファイルが `git status` に出ていることがある。コミットは必ずパスを指定して staging を切り分ける
- ローカルで `npx tsx` が esbuild の不一致で落ちることがある。Docker 内（`docker exec ga4-dashboard-app-local npx tsx ...`）で動かす

## コマンド

| 目的 | コマンド |
|---|---|
| CI と同じ検査 | `npm run check`（typecheck + lint + check:registry + check:api-list） |
| route を足した / JSDoc を変えた | `npm run gen:api-list`（生成物をコミットする） |
| API の挙動を変えないリファクタ | `npm run verify:api -- --update --only=<case>` → 変更 → `--compare`。ケースは `scripts/verify/cases.json`（期間は絶対日付、揺れる値は `volatile`） |
| 開発サーバー | `docker compose -f docker-compose.local.yml up -d` → http://localhost:3003（Cookie `ga4_auth=1` で API を直接叩ける） |
| 画面確認 | Playwright MCP で該当 URL を開く。初回コンパイルが遅いので要素の出現をポーリングで待つ |

## 正の所在（迷ったらここ）

| 何の正か | 場所 |
|---|---|
| ページ一覧・カテゴリ・タイトル・関連導線・機能ドキュメント | `lib/registry/pages.ts`（`Record<PageId, PageDef>`。未登録は `check:registry` で落ちる） |
| サイドメニューの並び | `lib/registry/categories.ts` |
| API 一覧 | `lib/docs/apiList.generated.ts`（生成）＋ `lib/docs/apiAnnotations.ts`（手書き注釈） |
| 事業用語・計測仕様・インシデント（用語集と AI Q&A の両方） | `lib/docs/domainKnowledge.ts` |
| 色・質感トークン | `app/globals.css`。共通クラスは `components/ui/ui.module.css` |
| CV 単価係数 | `lib/constants/cvUnitValue.ts`（再算出は `scripts/snapshots/regen-cv-unit-value.ts`） |
| UTM の意味 | `lib/constants/utmCatalog.ts`、規則の完全版は `docs/utm-naming-convention.md` |
| BigQuery テーブル定義 | `lib/bq/schemas.ts` |

## ページを作る

1. `lib/registry/pages.ts` の `PAGE_IDS` に id を足し、`PAGES` に href / title / subtitle / category / tags / `doc`（description と capabilities。AI Q&A が読む）を書く
2. `app/<path>/page.tsx` は `'use client'` + `<PageShell pageId="...">` の中に本文だけ。h1・戻りリンク・関連ページは PageShell が出す
   - プロダクト必須なら `requireProduct`、期間 UI は `controls={<PeriodSelect state={usePeriodRange('30daysAgo')} />}`
   - 取得状態は `status={{ loading, error, source: 'ga4' | 'bq' | 'db' | 'gsc' | 'ai', onRetry }}`。前回データを残すなら `keepChildrenWhileLoading`
   - 手動実行型は `FilterBar onSubmit`、自動型は期間変更で再取得
3. データ取得は `useReport<T>(url, { body, enabled, manual, keepPreviousData })`。更新系は `fetchJson`
4. 型は `lib/services/<domain>/<name>Types.ts` から `import type`。ページ側で API の形を定義しない
5. 見た目は `ui.card` / `ui.sectionTitle` / `ui.summaryRow` / `ui.dataTable` / `ui.tabs` / `ui.input` を優先。ページ固有の CSS Module は固有の見た目だけ
6. `npm run check` → Playwright で確認 → コミット

## API を作る

1. `app/api/<path>/route.ts` は薄く: `readGa4Body(request, { defaultStartDate, propertyIdMissingMessage, allowProductId })` → `lib/services/<domain>/<name>Service.ts` の関数 → `NextResponse.json`。catch は `errorResponse(error, fallback, label, { withMessage })`
2. GA4 は `reporter.run({ dimensions, metrics, dimensionFilter, limit })`。フィルタは `lib/api/ga4/filters.ts`（exact / contains / regexp / anyOf / and / or / not。RE2 なので先読みは不可）、行の読み出しは `lib/api/ga4/rows.ts`
3. BigQuery は `lib/bq/ga4EventsSql.ts` の `eventsFromWhere` / `clampToExportWindow` で FROM / WHERE を組む
4. route の先頭に 1 行 JSDoc（API 一覧の説明になる）→ `npm run gen:api-list`。表示名やパラメータ説明は `lib/docs/apiAnnotations.ts`
5. 既存 API を触るときは先に `verify:api --update` でベースラインを取り、移行後 `--compare` で一致を確認する

## レイヤの約束（ESLint で検査）

- `lib/**` は `@/app` `@/hooks` `@/contexts` `@/components` を import しない（型は `lib/services/<domain>/*Types.ts` に置く）
- `lib/bq/**` は `@/lib/db` を触らない。BQ 成功後の `bqSyncedAt` 更新は `lib/services/logging/activityLogService.ts`
- `no-explicit-any` と React Compiler 系ルールは warn。新規コードでは増やさない

## ドメイン知識の要点

- GA4 は二重構成。このダッシュボードは分析用プロパティ **534098180**（GTM-TG9PR444）。マーケ用 351088797 とは定義が違い数字は一致しない
- CV はキーイベントではなくページ / ラベルで計測。応募 = `/entry/thanks`、会員登録 = `/members/signup/thanks`、種別分解は GTM ラベル JobA（求人広告）/ JobR（人材紹介）/ JobH（ハローワーク）
- ラベル規則 `{Area}__{Section}__{Element}__{Label}`。AB テストの B/C/D は末尾 `__B-{issue}`。CVR ラベルは `*` ワイルドカード可
- 全 GA4 集計は既定で国=日本フィルタ（2026-06 の bot）。2026-08-11〜8 月下旬は Unassigned インシデント（収束済み）でチャネル別数値は信頼不可
- 詳細は `/docs/glossary`（`lib/docs/domainKnowledge.ts`）。データソース別の当たり方は `.claude/skills/xwork-data-sources`、本番 API の操作は `.claude/skills/prod-dashboard-api`
