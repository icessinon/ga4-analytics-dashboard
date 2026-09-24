---
name: prod-dashboard-api
description: 本番のGA4分析ダッシュボード(EC2)のAPIを叩いて、ABテストの登録・更新・削除・現在値取得や、GA4ラベル一覧・レポート実行を行うスキル。ローカルとは別DBなので、ローカルで作ったものは本番に反映されない。「本番にABテストを登録して」「本番のABテスト一覧見せて」「ABテストの期間を延ばして」「本番のダッシュボードから消して」「今のABテストの数字どうなってる」「ラベル別内訳見たい」「GA4のラベル一覧出して」「本番のダッシュボードを叩いて」と言われたら必ず使うこと。ABテストの計測設計・登録・運用の話題で積極的にトリガーする。
---

# 本番ダッシュボード API

GA4分析ダッシュボードの本番環境（EC2 上の docker-compose）に API で読み書きする。

## 大原則

- **ローカルと本番は別DB**。ローカル `.env` の `DATABASE_URL` は `localhost:5432`、本番はコンテナ内の `postgres`。ローカルでABテストを作っても本番には一切反映されない。本番に入れたいなら必ずこのスキルを使う。
- **書き込み（POST / PUT / DELETE）は必ずユーザーの確認を取ってから実行する**。ペイロードを提示して OK をもらう。特に DELETE は復旧できない。
- 読み取り（GET）は確認なしで実行してよい。

## 使い方

```bash
scripts/prod-api.sh GET    '/api/ab-test?status=running&limit=10'
scripts/prod-api.sh POST   /api/ab-test payload.json
scripts/prod-api.sh PUT    /api/ab-test '{"id":12,"endDate":"2026-10-31"}'
scripts/prod-api.sh DELETE '/api/ab-test?id=12'
scripts/prod-api.sh --relogin GET /api/products   # Cookie が壊れたとき
```

- 第3引数は JSON ファイルパスでも JSON 文字列でもよい。日本語を含む長いペイロードはファイルにする（scratchpad に置く）。
- クエリ文字列を含むパスは `&` がシェルに食われるのでシングルクォートで囲む。
- 認証は `middleware.ts` の `ga4_auth` Cookie 方式。スクリプトが `/api/auth/login` で取得してキャッシュし、失効（ログイン HTML が返る）を検知したら自動で取り直す。
- 接続情報は `.env` の `PROD_DASHBOARD_URL` / `PROD_DASHBOARD_USER` / `PROD_DASHBOARD_PASSWORD`。`.env` は gitignore 済みなので、**認証情報をスキルやスクリプトや commit に直接書かない**。
- `INTERNAL_API_SECRET`（`x-internal-secret` ヘッダ）が効くのは `/api/ab-test/execute`・`/api/alerts/*`・`/api/reports/weekly-summary` の POST だけ。ABテストのCRUDには使えない。

## 主なエンドポイント

| メソッド | パス | 用途 |
|---|---|---|
| GET | `/api/products` | プロダクト一覧。クロスワークは `id=1` / `ga4PropertyId=534098180` |
| GET | `/api/ab-test?status=running&limit=10` | ABテスト一覧（デフォルト5件） |
| GET | `/api/ab-test/{id}` | 1件の全設定（`ga4Config` 込み）。**新規作成時は既存テストを雛形にする** |
| POST | `/api/ab-test` | 作成。必須は `productId` / `name` / `startDate` |
| PUT | `/api/ab-test` | 更新。body に `id` を入れる。渡したフィールドだけ更新される |
| DELETE | `/api/ab-test?id={id}` | 削除（復旧不可） |
| GET | `/api/ab-test/{id}/current` | 現在値。A/B の pv・cv・cvr、**ラベル別内訳**、有意性、リーダー |
| POST | `/api/ab-test/test-execute` | DB に保存せず任意の `ga4Config` で試算。`{ga4Config, startDate, endDate}` |
| POST | `/api/ab-test/execute` | 本実行＋レポート生成。`{abTestId, force}` |
| GET | `/api/ga4/labels?propertyId=534098180` | 直近90日に存在する click/view ラベル全件（約17,000件）。**ラベル文字列の実在確認に使う** |

## ABテスト登録の作法

1. `GET /api/ab-test/{既存id}` で雛形を取る。`dimensions` / `metrics` / `limit: 25000` / `geminiConfig` / `abTestEvaluationConfig` はそのまま踏襲する。
2. ラベル文字列は**推測せず**、本体コード（`~/dev/drm-front` の GTM ラベル生成箇所）で確定させ、`GET /api/ga4/labels` で実在を確認する。
3. `POST /api/ab-test/test-execute` で数字が取れるか先に試す。ゼロ件なら設定かラベルが間違っている。
4. ユーザーに確認を取ってから `POST /api/ab-test`。

### ga4Config の形

A/B は `cvrA` / `cvrB`（最大 `cvrD` まで）。分母・分子それぞれに次元とラベル配列を持つ。

```jsonc
{
  "propertyId": "534098180",
  "dimensions": [{"name":"customEvent:click_label"},{"name":"customEvent:view_label"}],
  "metrics": [{"name":"eventCount"},{"name":"totalUsers"}],
  "limit": 25000,
  "cvrA": {
    "denominatorDimension": "customEvent:view_label",
    "denominatorLabels": ["EF__JobA__Area__Header"],
    "numeratorDimension": "customEvent:view_label",
    "numeratorLabels": ["EF__ThxJobA__Area__お問い合わせが完了しました"],
    "metric": "totalUsers"
  },
  "cvrB": { /* 同じ形。B群は末尾に __B-{issueNumber} サフィックス */ },
  "funnelSteps": [ /* 任意。ステップ別のA/B比較 */ ],
  "abTestEvaluationConfig": { "minPV": 1000, "minDays": 7, "minSignificance": 80, "minDifferencePt": 0.5, "minImprovementRate": 5 }
}
```

- **A/B の分離は `__B-{issueNumber}` サフィックス方式**。A は素ラベル、B はサフィックス付き。`lib/services/analytics/labelMatcher.ts` のマッチャは `^…$` でアンカーするので、素ラベルがサフィックス付きに誤一致することはない。
- ラベルには `*` ワイルドカードが使える（全職種展開など）。
- `issueUrl` は URL ではなく**番号だけ**を入れる運用（例 `"1859"`）。Notion 施策カードとの結合キーになる。
- `minDays` はテスト期間より短くする。期間10日で `minDays: 14` だと日数不足で評価が落ちる。
- 複数ラベルを指定すると詳細ページに「ラベル別内訳」が出る。ただし**内訳は分母・分子の件数のみで、内訳ごとの CVR は計算されない**。内訳別の CVR が要るならエントリを分ける。

## ハマりどころ

- **サフィックスは「割り当てられたバケット」であって「施策を体験したか」ではない**。AB設定の `range` に含まれるページに別経路から入ったユーザーにもBラベルが付く。intent-to-treat で効果は希釈される。
- **施策が適用されないページを母集団に混ぜない**。差が出ようのない群を足すと検出力が下がるだけ。ただし A/A 群として「この母数帯のノイズ幅」を測る用途には有用。
- **A 群には Cookie（`xw_seg`）未発行のアクセスが混ざる**。bot や Cookie 拒否は素ラベル側に計上される。既知の性質で、既存テストも同条件。
- 母数が小さいときは `current` の `significance` を必ず見る。数十pt の差でも有意性30〜45%なら判定不能。

## 関連

- データソース全般の索引は `xwork-data-sources` スキル。
- 施策カードの仕上げは `refinement-prep` スキル。
