# スカウト効果計測（P1）& プロダクトダッシュボード 実装計画

作成: 2026-07-22 ／ 対象リポジトリ: ga4-analytics-dashboard（本体）+ drm-front（計測タグ・API）

> **drm-front側の作業はこのMDを参照して別セッションで実施する。**
> `~/dev/drm-front` で Claude Code を起動し、このファイル
> （`~/dev/ga4-analytics-dashboard/docs/scout-product-dashboard-plan.md`）の
> 「Part C: drm-front側タスク」を渡せば単独で作業できるように書いてある。

---

## 役割分担（決定事項）

| 責務 | 置き場所 | 理由 |
|---|---|---|
| ファネル/分析ダッシュボードの画面 | **ga4-analytics-dashboard** | GA4クライアント・botフィルタ・認証・チャート・AI/Slack/BQの既存資産を流用 |
| 計測タグ（dataLayer / data-click-label） | **drm-front** | アプリにしか置けない |
| 製品データの出し口 | **drm-front** に薄い内部集計API | DDBスキーマ変更に強い。IAM共有不要。過渡期は読み取り専用IAMでDDB直読み可 |
| 企業向け（/manage）のスカウト成果表示 | drm-front（将来・別件） | 顧客向け製品機能 |

---

## Part A: スカウト効果計測ファネル（P1）

ゴール（ゲート）: **送信→到達→閲覧→応募→成約が一本のファネルで追え、企業別・チャネル別に分解できる**

### 調査済みの現状（2026-07-22, drm-front実装確認済み）

| 段階 | 状態 | 根拠（drm-frontのパス） |
|---|---|---|
| 送信リクエスト | ✅ あり | `ScoutHistories`(DDB)。スキーマに status(requested/sent/failed)・sentAt・providerMessageId・errorCode **定義済み**: `packages/core/src/schemas/ScoutHistory.ts` |
| 送達 | ❌ 配信実装は**リポジトリ内にある**が結果をDDBに書き戻していない（全件requestedの真因）。DDB Streams→`ScoutSmsNotificationFunction`→`send-sms` Lambda→**Accrete SMS API**(sms_reg, delivery_id/result_codeが同期で返る)。成否はCloudWatchログのみ | `apps/infra/drm-infra/stacks/ScoutHistoryRepositoryStack/lambda/ScoutSmsNotificationFunction/handler.ts`, `apps/infra/sms-management-service/lambda/send-sms/` |
| 閲覧 | 🔶 半分あり: `/scout/{scoutId}` のPVは分析用GA4(534098180)に**既に乗っている**（30日で35 scoutId、遡及可）。dataLayer push `view-scout-featured-page` 実装済みだが **scoutId未搭載**。ログイン者のみ markAsRead | `apps/web/src/pages/scout/[scoutId].page.tsx` |
| 応募 | 🔶 ほぼあり: `/scout/{id}` → `/entry/{id}?scoutId=` → サーバ検証のうえ `source=scout_apply/scout_inquiry` 決定。**scoutId自体の応募レコード保存はスキーマ未定義**（要確認/追加） | `server/services/JobApplicationService/resolveScoutSource.ts`, `index.ts` L60-70 |
| 成約 | ✅ 応募→SF Matching__c はZapier連携済み | Matching__c（応募1件=1レコード） |

### フェーズ計画

| フェーズ | 内容 | リポジトリ | 依存 |
|---|---|---|---|
| A-1（即着手可） | `/scout` 暫定ファネル: 送信リクエスト(DDB)→閲覧(GA4 pagePath `/scout/`)→応募(DDB source=scout_*) の3点 + 企業別分解 | dashboard | DDB読み取りIAM |
| A-2 | 計測タグ強化（dataLayerにscoutId/companyId、SMSリンクに`?ch=sms`、応募ボタンにclickラベル、scoutId永続化） | drm-front + GTM | Part C参照 |
| A-3 | 送達writeback: `ScoutSmsNotificationFunction` 内で送信成否をattemptへ直接更新（受け口API不要） | drm-front(infra) | なし（解決済み） |
| A-4 | Zapier→SF `ScoutId__c` 追加、成約をファネルに接続 | Zapier/SF + dashboard | SFカスタム項目 |

### KPI定義（§2準拠の形）

- 送達率 = sent / requested
- 閲覧率 = 閲覧UU / sent（A-3まではrequested分母の暫定値と明記）
- 応募率 = scout経由応募 / 閲覧UU
- 成約率 = 成約 / scout経由応募
- 分解軸: 企業（ScoutHistories.companyId）／チャネル（GA4 utm_source=sms 等）／契約種別（scout_apply=求人広告, scout_inquiry=人材紹介・HW）

### 未決事項（要確認）

1. ~~実配信システムの特定~~ → **解決（2026-07-22）**: drm-front `apps/infra` 内。DDB Streams → ScoutSmsNotificationFunction → send-sms Lambda → Accrete SMS API。sent の書き戻しが未実装なだけ
2. ~~scoutIdの永続化確認~~ → **解決（2026-07-22 drm-front側検証）**: **意図的に非永続化**。`apps/web/src/domain/schemas/JobApplication.ts:38` に「scoutId は SCOUT_APPLY/SCOUT_INQUIRY の正当性検証用入力であり、Repository の `JobApplicationCreateInputSchema` 再parse（strip mode, `JobApplicationRepositoryByDynamoDB/index.ts:34`）で自動的に落ちる」と明記。C-3 は設計判断の変更として行う
3. Accrete の sent はAPI受付（result_code "0000"）であってキャリア到達ではない。到達（DLR）まで取るなら Accrete の配信結果照会APIの有無を確認（拡張扱い、ゲートは受付=送達の近似で満たす）

---

## Part B: プロダクトダッシュボード（クロスワーク ダイレクト）

モック: `~/Documents/20260713_プロダクトダッシュボード_mockup.html`
（4タブ: 集客・流入／会員／配信／品質。粒度=日次/週次/月次、絞り込み=エリア/チャネル/デバイス、パネル別group by）

### パネル→データソース対応（実装可否）

| タブ | パネル | ソース | 可否 |
|---|---|---|---|
| 集客 | PV/セッション/UU推移、SP/PC比率 | GA4 | ✅ 即可（botフィルタ済み。モックの「④未計測」は誤り） |
| 集客 | 求人詳細PV/UU、詳細→応募開始率 | GA4ラベル | ✅ 即可（求人種別CV分析と同じクエリ） |
| 集客 | SEOインデックス率・平均掲載順位 | Search Console API | 🔶 新規連携（GA4と同じGoogle SA認証で追加可能） |
| 会員 | 新規登録数 | DDB or 内部API | 🔶 drm-front出し口待ち（GA4のsignup thanksで近似は即可） |
| 会員 | 登録フォームCVR・ステップ遷移率 | GA4ラベル | ✅ 即可（ABテストファネルの仕組みを流用） |
| 会員 | 登録初月応募率、WAU/DB | DDB | 🔶 内部API |
| 配信 | メール/SMS/LINE配信数、配信→応募CVR、ブロック率 | 配信システム+DDB | 🔶 Part Aの基盤に相乗り |
| 配信 | LINE連携数 | DDB | 🔶 内部API |
| 品質 | エラー率 | Sentry API | 🔶 新規連携（drm-frontはSentry導入済み） |
| 品質 | LCP | CrUX API / Sentry | 🔶 新規連携 |

### フェーズ計画

| フェーズ | 内容 |
|---|---|
| B-1 | `/product` セクション新設（4タブ骨格+粒度切替）。GA4だけで賄えるパネル（集客の大半+会員のフォーム系）を実装 |
| B-2 | drm-front内部集計API `GET /api/internal/stats/daily`（日次登録数・LINE連携数・配信数等）→ 会員/配信タブを埋める |
| B-3 | Search Console連携（SEO）、Sentry/CrUX連携（品質） |

---

## Part C: drm-front側タスク（別セッションで実施）

> 前提知識: GTMラベル規則 `{Area}__{Section}__{Element}__{Label}`。
> 分析用GTM=TG9PR444→GA4プロパティ534098180。dataLayerユーティリティは `apps/web/src/utils/gtm.ts` の `pushDataLayerForXWork`（zodスキーマ `XWorkDataLayerSchema` に追加が必要）。

### C-1. スカウト閲覧イベントの強化（A-2）

- `apps/web/src/pages/scout/[scoutId].page.tsx` の `pushDataLayerForXWork({ event: "view-scout-featured-page", ... })` に `scoutId`, `companyId` を追加（companyIdはgetServerSidePropsでScoutPageDataから取得しPropsに載せる）
- `utils/gtm.ts` の `XWorkDataLayerSchema` に該当フィールドを追加
- 受け入れ条件: GTMプレビューで scout_id がイベントパラメータに載る

### C-2. 応募ボタンのクリックラベル（A-2）

- `apps/web/src/pages/scout/_components/ScoutApplyButton.tsx` と `HearingButton`（scoutページ利用箇所）に `data-click-label` を付与。命名: `SC__Scout__Btn__応募する` / `SC__Scout__Btn__話を聞いてみる`（Area=SCは新設。既存EF/SU規則に準拠）
- 注意: `HearingButton` は他ページと共有のコンポーネントのため、ラベルは無条件埋め込みではなく **props で渡してscoutページ利用箇所のみ付与**する（他ページの計測に影響させない）
- scoutページでの `HearingButton` 利用箇所は `[scoutId].page.tsx` 直下に加えて **`ScoutCallToActionBox.tsx` 経由**もある（drm-front側検証済み）。両方にラベルを通すこと
- 受け入れ条件: GA4の customEvent:click_label に上記ラベルが出る（scoutページのみ）

### C-3. scoutIdの応募レコード永続化（A-2 / 既存設計判断の変更）

- **現状は意図的に非永続化**: scoutId は source 検証用の入力専用フィールドで、Repository の `JobApplicationCreateInputSchema` 再parse（strip mode）で落ちる設計（`domain/schemas/JobApplication.ts:38` のコメント、strip箇所は `JobApplicationRepositoryByDynamoDB/index.ts:34`）
- 変更: `JobApplicationCreateInputSchema`（と Guest 系の対応スキーマ）に `scoutId: z.string().uuid().optional()` を**永続化フィールドとして**追加し、当該コメントも更新
- 変更理由をコード/PRに残す: スカウト効果計測（応募↔スカウトのID紐付け）のため、検証用入力から計測用永続化フィールドへ役割を拡張する
- 受け入れ条件: scout経由応募のDDBレコードに scoutId が入る。既存の source 検証挙動（改竄scoutIdの拒否）は不変
- **進め方**: 意図的な設計判断の変更なので、実装前にチーム（設計者）へ一言確認を挟む

### C-4. 送達writeback（A-3）— Lambda内で完結

- 対象: `apps/infra/drm-infra/stacks/ScoutHistoryRepositoryStack/lambda/ScoutSmsNotificationFunction/handler.ts`
- `invokeSmsLambda` 成功後（`scoutSmsSent` ログの箇所）: 該当attemptを `status='sent', sentAt=now, providerMessageId=delivery_id` に UpdateItem（レコードのpk/skはStreamsイベントに載っている。attempts配列のindex指定更新）
- 失敗時（`scoutSmsFailed`）: `status='failed', errorCode, errorMessage` を書き込み（Streamsリトライとの二重更新に注意: attempt単位の冪等更新にする）
- 電話番号なしスキップ（`scoutSmsSkipped`）: `status='failed', errorCode='NO_PHONE'` を書く（送達率の分母から除外判定できるように）
- CDK: Lambda に ScoutHistories テーブルへの UpdateItem 権限を追加
- 注意: この更新自体がMODIFYイベントを発生させるが、handlerは「attempts数が増えたMODIFY」のみ処理するので無限ループしない（要テスト）
- 受け入れ条件: 新規スカウトで attempt が sent/failed に更新され、sentAt・providerMessageId が入る

### C-5. 内部集計API（B-2）

- 新規 `GET /api/internal/stats/daily?from=&to=`（APIキー認証）
- **注意（drm-front側検証済み）**: `api/internal/` ディレクトリも `x-api-key` 等の内部認証パターンも apps/web に前例なし。認証の仕組みごと新設になるため見積もりに上乗せ（環境変数の共有シークレット比較の薄いmiddlewareで開始し、必要ならIP制限を追加）
- 返却: 日次の { 新規登録数, LINE連携数, LINE経由登録数, スカウト送信/送達数, 配信数(取れる範囲) }
- 受け入れ条件: ダッシュボードから日次系列が取得できる

### C-7. 応募フォームの項目別Fieldラベル ~~付与~~ → **コード実装済み・GTM側の問題**（2026-07-24判明）

- **コードは実装済み**: 52f36653（XWORK_PRODUCT-1617 / #2855、2026-05-19マージ）で8項目すべてに `data-click-label` 付与済み。`InputWithError` がDOMのinputに属性を出力することもテストで確認済み
- **しかし本番GA4では、テキスト入力6項目（氏名/フリガナ/郵便番号/電話/メール/パスワード）が3種別とも2ヶ月間発火0件**。発火しているのは select（生まれ年: JobR 359 / JobH 329）と button（保有免許・資格: JobA 101）のみ（2026-06-01〜07-23実測）
- 原因は **GTM側のクリックトリガーが `<input>` 要素のクリックを拾っていない**（要素タイプ/CSSセレクタで絞られている可能性が高い）
- **残タスク（GTMコンソール作業）**: 分析用GTM-TG9PR444のクリックトリガー条件を確認し、input要素も発火するよう修正 → コード変更なしで8項目ファネルが動き出す
- やること（元の設計・参考）: タップ=触ったベースのファネルで壁の項目を特定する
- 入力完了判定（文字数等）は不要。将来「触ったが書き切れない率」が要る場合のみ、既存バリデーション通過×blurでのdataLayer pushを第2段階として検討
- 注意: 会員はプロフィール自動入力で項目に触らず送信するため（実測: 生まれ年操作138 < 送信158）、このファネルは**ゲスト応募の分析用**（ハロワ/人材紹介はゲストが大半: 2026-07実測 ゲスト3,211 vs 会員402）
- 受け入れ条件: GA4 click_label に `EF__Job*__Field__*` が項目別に出て、Header表示→各項目→送信のファネルが引ける

### C-9. 会員登録時のUTM保存（獲得チャネル別LTV分析の前提）

- 根拠: 応募の約9割はCRM配信（featured）経由＝**会員になった後の行動**。獲得チャネルの価値は「その場のCV」でなく「その会員が後日CRMで応募するか」で決まるが、会員（MemberUsers）に獲得チャネルが紐づいていないため評価できない
- 現状: 応募レコードには `getUtmFromRequest`（cookie）でUTM保存済み。**ユーザー作成時には保存していない**
- やること: ユーザー作成（createUser系サービス）で同じ `getUtmFromRequest` を使い、MemberUsersレコードに `utm` を保存（スキーマ追加）
- 効果: 「Google広告獲得の会員は登録後3ヶ月で平均◯件応募」等の獲得チャネル別LTVが引けるようになる（GA4では代替不可: セッション単位で会員個人に永続紐付けできない）
- 受け入れ条件: 新規登録ユーザーのDDBレコードにutmが入る（UTMなし流入はフィールドなしでOK）

### C-8. featured応募ボタンのクリックラベル付与（応募改善・施策1）

- 根拠: **応募全体の9割（2026-07実測: 月2,902件）がfeatured/CRM配信経由だが、featuredページはGTMラベル未実装で計測外**（source内訳: featured_inquiry 1,337 / one_click_inquiry 803 / one_click_apply 760）
- やること: featuredページ群の応募ボタン（通常・ワンクリック両方）に `data-click-label` を付与（命名は既存EF規則に準拠、Area=featured用に新設可）。配信リンクへの `?ch=mail|line` 付与もあわせて
- 受け入れ条件: featured経由の応募クリックがGA4で種別・チャネル別に集計できる

### C-6. SMSリンクのチャネルパラメータ（A-2）→ **リリース済み（ch=案からUTM方式に変更）**

- 実装: `${SITE_BASE_URL}/scout/${scoutId}?utm_source=sms&utm_medium=scout`（origin/master確認済み）
- ch=独自パラメータでなくUTMにしたことで、①GA4のチャネルグループに自動帰属（utm_source=sms→SMSチャネル）②webの setUtmParamsToCookie → 応募レコードのutm（Zapier/BQまで）に帰属が繋がる、の二重取り
- ダッシュボード側のチャネル分解は `pageLocation CONTAINS utm_source=sms` または sessionDefaultChannelGroup=SMS を使う（ch=前提の記述は無効）

---

## ダッシュボード側タスク（このリポジトリ）

1. **A-1**: `/scout` ページ + `/api/scout/funnel`（DDB read-only接続 lib/aws/ 新設、GA4 pagePath集計、日次×企業別）
2. **B-1**: `/product` セクション（4タブ・粒度切替・GA4パネル群）
3. A-2完了後: 閲覧をdataLayerイベント基準に切替、チャネル分解追加
4. A-3/A-4完了後: 送達・成約をファネルに接続
5. ドキュメント（features/apiList/glossary）更新

## 進捗（2026-07-23時点）

- **ダッシュボード側 A-1 完了**: `/scout` ページ + `POST /api/scout/funnel`（DDB ScoutHistories × GA4）。実データ検証済み（90日: リクエスト2,426 / sent 0 / 閲覧168UU / 応募1）
- **drm-front側 PR 3本オープン**（type-check / biome / テスト全パス。infraのtsc既存エラー31件は今回と無関係を確認済み）:
  - [#3125](https://github.com/…/pull/3125) C-1+C-2: 閲覧イベントに scoutId/companyId 追加、応募ボタンの click ラベル付与（`feature/scout-funnel-tracking-c1-c2`）
  - [#3126](https://github.com/…/pull/3126) C-3: scoutId を応募レコードに永続化（**既存の設計判断を覆す変更である旨をPRに明記済み**。`feature/scout-id-application-persistence`）
  - [#3127](https://github.com/…/pull/3127) C-4+C-6: SMS送達結果（sent/failed）を attempt に書き戻し + `?ch=sms`（`feature/scout-sms-delivery-writeback`）
- マージ後にダッシュボード側の追加作業なしで送達（sent）が表示され始める。C-1マージ後はGTMのGA4イベントタグ追加（scout_id/company_idパラメータ+カスタムディメンション登録）を忘れずに

## 進め方メモ

- drm-front側は `~/dev/drm-front` で別のClaude Codeセッションを起動して C-1〜C-4 を順に。ブランチ・PR・テストはdrm-frontの流儀に従う（このセッションからdrm-frontは読み取り参照のみ）
- ブロッカーなし（未決1・2とも解決済み）。推奨着手順: C-4（送達writeback。これだけで全件requested問題が解消）→ C-6（1行）→ C-1〜C-3。C-4はLambda内完結なので内部API認証（C-5の課題）とは独立
- GTMタグ追加（C-1のイベント→GA4タグ、C-2はクリック既存トリガーで自動）はGTMコンソール作業。公開日を台帳にメモ
