---
name: xwork-data-sources
description: クロスワーク(x-work.jp)の施策検討・リファインメント・データ調査で参照する分析データ源の早見。GA4 / BigQuery / 本体コード(drm-front) / DynamoDB / Salesforce / CV単価 / 求職者サーベイ / Search Console について、何が分かるか・アクセス方法・ラベー/キー規則・注意点・コスト/個人情報の扱いをまとめる。「このデータどこ見る？」「集計して」「遷移率/CV/売上を出して」系の調査依頼を受けたら最初に読む。
---

# クロスワーク 分析データソース早見

x-work.jp（求人転職プラットフォーム。事業領域 driver/sekokan 等、CV種別は会員登録・人材紹介応募(JobR)・求人広告応募(JobA)・ハローワーク応募(JobH)）の施策検討やデータ調査で「どのデータを・どう参照するか」の索引。集計の実行はこのダッシュボードリポジトリ（`ga4-analytics-dashboard`）内で行う。詳しい施策カードの仕上げ方は `refinement-prep` スキル参照。

## 大原則（毎回守る）

- **BigQuery は dry run 必須・予測コスト10円未満**（組織ルール）。超える場合は低コストなクエリを探索し、無理ならユーザー許可を取る。`runGa4EventsQuery` は内部で dry run→5GB(≈4.6円)超を拒否する。
- **個人情報を転記しない**。求職者サーベイの電話番号・連絡先列、Salesforce/DynamoDB の実名・認証情報は表示・転記しない。引用は集計値と匿名の自由記述のみ。
- **数値には計測の癖と期間の浅さを必ず添える**（view_label の取りこぼし、BQエクスポート開始日、標本の小ささ等）。
- 集計スクリプトは `scripts/tmp-*.ts` に書く（このリポジトリに多数の実例あり）。**ローカル tsx は esbuild バイナリ不一致で不可**、Docker コンテナ内で実行する: `docker exec ga4-dashboard-app-local npx tsx scripts/tmp-*.ts`。

---

## 1. GA4 Data API（イベント/ラベル集計）

- **分かること**: 期間内のイベント数・ユーザー数を eventName / click_label / view_label 等のディメンションで集計。詳細閲覧・フォーム着手・完了などラベル単位の量。
- **プロパティ**: `534098180`（x-work.jp）。認証はサービスアカウント鍵（環境変数）。UI側のトークン入力欄は廃止済み＝常にSA/環境変数で認証。
- **アクセス**: `lib/api/ga4/client.ts` の `fetchGA4Data(request, accessToken)` / `getGA4AccessToken()`。既存APIの再利用も可（コンテナ内で `node -e 'fetch("http://localhost:3000/api/...")'`）。ラベル候補一覧は `GET /api/ga4/labels?propertyId=534098180`（直近90日の click/view ラベル）。
- **ラベル規則**:
  - 詳細閲覧: `DL__Media__Area__{JobR|JobA|JobH}`
  - フォーム表示: `EF__{key}__Area__Header`
  - 完了（送信ボタンクリック）: click_label `EF__{key}__Btn__{応募する|話を聞いてみる}`
  - JobR=人材紹介 / JobA=求人広告 / JobH=ハローワーク
- **注意点**: view_label は「50%×1秒視認」で発火＝1〜2割取りこぼす。完了カウントは**送信ボタンクリック（click_label）が正**。セッション単位・経路の分析は GA4 API では不可 → BigQuery を使う。

## 2. BigQuery（GA4生イベント：セッション単位・経路分析）

- **分かること**: ページ遷移率・経路分類（検索経由/直接）・セッションファネル・次アクションなど、GA4 API で取れないセッション/イベント粒度の分析。
- **データ**: `x-work-ga.analytics_534098180.events_*`。**エクスポート開始 2026-08-07 以降のみ**（それ以前の日付は無い）。
- **アクセス**: `lib/bq/ga4EventsClient.ts` の `runGa4EventsQuery` を使う tmp スクリプト。既存例: `scripts/tmp-industry-top-transition.ts`（トップ→詳細遷移率）、`tmp-industry-top-direct-transition.ts`（次PV分類で検索経由/直接を分離）。
- **注意点**:
  - dry run→コスト提示は必須（上記大原則）。
  - 遷移率を出したら**「検索経由込みか直接遷移か」の経路定義を必ず明記**する。
  - 課金リンク状態によりテーブル自動削除の期限あり（詳細はメモリ `project_bq_export.md`）。

## 3. 本体実装の現状（drm-front）

- **分かること**: 対象画面の実際の構造・該当機能の有無。施策の「やること」がコードの現実と合っているかの検証。
- **場所**: `~/dev/drm-front`（クロスワーク本体）。Explore エージェントで調査し、ファイル:行番号つきで根拠を残す。
- **注意点（ABテストの罠）**: 詳細ページ・応募フォーム等の `getServerSideProps` は `abValue` を返しておらず `useABTest` が常にA固定（signup ページのみ配線済み。TOP/一覧/検索も未配線）。AB施策のスコープに「前提改修」を明記する。
- 進行中作業との重複チェック（施策起票前は必須）: `gh pr list --repo X-Mile/drm-front --state open` と Backlog チケット `XWORK_PRODUCT-*` を確認。実装済みを新施策として上げない。

## 4. DynamoDB（求人マスタ実数）

- **分かること**: 求人の実データ（画像有無など）。例: 人材紹介の99.8%が画像なし＝FVがNO IMAGE。
- **アクセス**: `drm-front/apps/web/.env.local` のSDK認証情報を使う（**値は絶対に表示しない**）。`JobDescriptions-prd` は pk=`media_{n}`、画像判定は `images[].path` の非空で見る。

## 5. Salesforce（売上・成約）

- **オブジェクト**: 求職者=`CustomObject1__c`、マッチング=`Matching__c`、登録履歴=`RegistHistory__c`、CA活動履歴=`AgentActivityHistory__c`（`RH_AgentActivityHistory__c` / `MA_AgentActivityHistory__c` で連結）。
- **売上の定義（重要）**: CV(RegistHistory__c) → そのCVのCA活動履歴 → 紐づくマッチングのうち フェーズ `Field2__c=「7.入社済」` の受注額 `MA_ClosingFee__c` − 返金想定額 `Estimated_refund_amount__c`。**求職者単位で全マッチングを合算しない**（過大評価）。応募求人限定も誤り（CAの再マッチ成約を取りこぼす）。CA活動履歴基準が中庸。
- ハロワ/広告の売上主体は「CAが人材紹介案件へ再マッチした成約」であることに注意。

## 6. CV単価（金額換算）

- **ソース・オブ・トゥルース**: `lib/constants/cvUnitValue.ts`（ハードコードせずここを参照）。`CV_UNIT_VALUE_YEN` と算出根拠 `CV_UNIT_DERIVATIONS`、基準日 `CV_UNIT_VALUE_ASOF`。
- **現行値（2026-08-27 確定・CA活動履歴基準）**: 会員登録(signup) ¥19,760 / 人材紹介(JobR) ¥15,850 / 求人広告(JobA) ¥18,602 / ハロワ(JobH) ¥8,726。会員登録¥19,760＝純登録¥13,650＋下流価値¥6,110。
- **使い方**: `cvValueYen(key, count)` で円換算、`formatYenApprox(yen)` で「約N万円」表示。施策インパクトは必ず円換算を添える。応募3種別は同一入社の二重計上を除去済み（優先度 人材紹介>求人広告>ハロワ）、会員登録は下流価値のため合算しない前提。

## 7. 求職者サーベイ（定性・生データ）

- **分かること**: 探し方・困りごと・応募行動・応募後の連絡タイミング・スカウト受信数・配信の受け止め・自由記述。
- **場所**: Google スプレッドシート ID `1kHMyOSkTJGHGRoMe0hw71bck2J0bT5KOiuxdG2yA5qM`（Googleフォーム回答、2026/08/13〜継続回収）。Google Drive MCP の `read_file_content` で全行取得。
- **注意点（PII）**: **末尾に電話番号・連絡先列がある＝個人情報**。カードやNotionに転記しない。引用は集計値と匿名の自由記述のみ。

## 8. Search Console（SEO系）

- **分かること**: クエリ・ページ・searchAppearance 別のクリック/表示/CTR/順位。
- **アクセス**: `lib/api/gsc/client.ts` の `gscQuery`。既存例: `scripts/tmp-seo-position.ts`（ブランド/非ブランド分解、ブランド判定正規表現もここを流用）、`tmp-gsc-appearance-probe.ts`。

## 9. スクリーンショット（視覚的課題）

- 現状課題が視覚的なら Playwright で撮る（モバイルは390×844）。施策カードには `notion-create-file-upload` で添付。

---

## 使い分け早見

| 知りたいこと | 使うデータ源 |
|---|---|
| ラベル単位のCV・閲覧・着手の量 | GA4 Data API (1) |
| ページ遷移率・経路・セッションファネル | BigQuery (2) |
| 施策が実装と噛み合うか / AB配線の有無 | drm-front (3) |
| 求人の実データ（画像等） | DynamoDB (4) |
| 成約・売上の実額 | Salesforce (5) |
| 施策インパクトの円換算 | CV単価 (6) |
| ユーザーの生の声・行動理由 | サーベイ (7) |
| 検索順位・流入 | Search Console (8) |
