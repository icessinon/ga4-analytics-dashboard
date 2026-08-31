# UTM命名規則・施策別リファレンス

対象: x-work.jp ／ データソース: 本体コード(drm-front) ＋ GA4 BQ Export(property 534098180, `collected_traffic_source`) ／ 更新日: 2026-08-31

UTM（`utm_source` / `utm_medium` / `utm_campaign`）別に数字を見るときに、各値が「どの施策のリンクか」を引くための正典。**送信側に共通UTMビルダーは無く、各施策がローカル定数でバラバラに発行している**（受信側だけ `getUtmFromRequest`/`setUtmParamsToCookie` で共通化）。値はコード実測と、GA4 BQ Export の実流入（2026-08-07〜08-30・国=日本・24日間、collected_traffic_sourceのセッション帰属）で突合済み。CV列は「会員登録CV＝`/members/signup/thanks`到達」を指す。

## 共通則

```
utm_source = <発信元>   product(自社通知) / line(LINE公式) / ca(CA配信) / scout・crm_scout(スカウトSMS) / xwork(サイト内) / thanks(サンクス) / google・yahoo・facebook(広告) / youtube(インフルエンサー)
utm_medium = <チャネル> email / line / social / sms / referral / cpc / cpm / influencer
utm_campaign = <施策名>
```

## 大分類（最重要の読み分け）

UTMは**「外から新規セッションで来る流入UTM」**と**「既にサイトに居るユーザーが踏む内部リンクUTM」**で意味が全く違う。

| 種別 | 例 | GA4での計上 |
|---|---|---|
| **流入UTM**（外部→サイト） | メール/LINE/SMS通知、広告、リッチメニュー | **セッション帰属に計上される**（`collected_traffic_source`に乗る）。UTM別の数字が見れる |
| **サイト内リンクUTM**（既存セッション） | フッター/サイドバー/バナー/LP誘導ボタン | **ほぼ計上されない**。GA4はUTMをセッション開始時のみ読むため、セッション途中の内部遷移は元sourceを保持。→ リンククリック計測やリンク先/Salesforce識別が主目的 |

> 裏取り: `utm_source=xwork` / `utm_source=thanks` のセッションは24日間で**0件**。フッター等の内部リンクUTMはGA4のセッション集計には現れない（後述「サイト内リンクUTM」節）。

---

## 1. 自社プロダクト通知（utm_source=product）

会員向けにプロダクトが発火する通知。source=`product`固定 × medium=チャネル。

| 施策 | source | medium | campaign | 実測(24日) séss/CV | 実装 |
|---|---|---|---|---|---|
| おすすめ求人 LINE（→求人詳細） | product | line | `job_description` | 449 / 0 | line-message-deliver/scripts/DeliveryRecommendJobs.ts:26 |
| おすすめ求人 LINE（→応募フォーム） | product | line | `entry_form` | 24 / 0 | 同上:27 |
| LP応募サンクス系メール | product | email | `lp_thanks` | 196 / 5 | ※コード未特定（下記注） |
| 会員登録完了メール（ウェルカム） | product | email | `signup_complete` | 54 / 5 | apps/web/src/commons/mail/htmls/signupUserHtml.tsx:36 |
| キープ求人リマインド1通目 | product | email | `keep_remider_1st` ⚠️ | 37 / 0 | x-work-messaging/src/lambda/Reminder.ts:48 |
| キープ求人リマインド2通目 | product | email | `keep_remider_2nd` ⚠️ | 閾値未満 | 同上:49 |
| キープ求人リマインド3通目 | product | email | `keep_remider_3rd` ⚠️ | 22 / 0 | 同上:50 |

- LINE配信URLは末尾に `&openExternalBrowser=1` 付き（LINE内ブラウザ→外部ブラウザ遷移）。
- **`lp_thanks`（email）はコード調査で発行元を特定できていない**が実流入あり（196séss/5CV）。別リポジトリ or 配信基盤側の可能性。要追跡。
- ⚠️ `keep_remider` は `keep_reminder` のタイポ（後述「既知の不具合」）。実データにもタイポのまま乗っている。

## 2. LINE公式アカウント（utm_source=line, medium=social）

リッチメニュー・サーベイ後の配信。**drm-frontコードには無く、LINE公式アカウント側の設定**。medium=`social`。

| 施策 | campaign | 実測(24日) séss/CV | CVR |
|---|---|---|---|
| リッチメニュー: 全員向け求人検索 | `richmenu_all_jobsearch` | 405 / 17 | 4.2% |
| リッチメニュー: 会員向け求人検索 | `richmenu_member_jobsearch` | 265 / 4 | 1.5% |
| **サーベイ完了→スカウト誘導** | `survey_thanks_scout` | 227 / **95** | **41.9%** ★ |
| リッチメニュー: 会員向けスカウト確認 | `richmenu_member_scoutcheck` | 172 / 3 | 1.7% |
| リッチメニュー: 全員向け登録 | `richmenu_all_registration` | 27 / 3 | 11.1% |

★ `survey_thanks_scout` は会員登録CVRが突出（LINE社経由CVがサイト平均の桁違い＝過去調査 line-traffic-analysis-2026-07-07.md とも整合）。

## 3. CA配信（utm_source=ca, medium=line）

| 施策 | campaign | 実測 séss/CV | 実装 |
|---|---|---|---|
| CAからの求人提案LINE | `ca/line/job_propose_202412` | 67 / 0 | CA運用（コード外・手動配信の可能性） |

## 4. スカウトSMS（マーケ配信・最大ボリューム）

b-dash/Accrete系のSMS一斉配信。**求職者を求人詳細/スカウトページへ送客（会員登録が目的ではない）** ため会員登録CVはほぼ0だが、`scoutId`経由の応募に効く。SMS medium計 25,648séss。

| source | campaign 命名パターン | 意味 | 実測計 séss/CV |
|---|---|---|---|
| `scout` | `at_agent_fee_media_{求人ID}_{yyyymmdd}_{セグメント}` | 人材紹介(agent)スカウト。手数料課金 | 24,890 / 6 |
| `crm_scout` | `at_direct_{yyyymmdd}_{都道府県}_{職種}_media_{求人ID}` | 求人広告(direct)スカウト | 758 / 0 |

- セグメント例: `large_east_1` / `26y_402_1`(年式×コード×バッチ) / `newjob_26yck_1`。campaign粒度が細かく数百種あるため、**接頭辞（`at_agent`/`at_direct`）で束ねて見る**のが実用的。
- SMSリンク実装の一例（本体）: `${SITE_BASE_URL}/scout/${scoutId}?utm_source=sms&utm_medium=scout`（ScoutSmsNotificationFunction/handler.ts:93）。※この本体実装は source=`sms`/medium=`scout`/campaignなしだが、マーケ配信の大半は上記 `scout`/`crm_scout`×`sms` の命名で流入している（配信基盤側でUTM付与）。

## 5. 広告（paid）

| source | medium | campaign 例 | 実測計 séss/CV |
|---|---|---|---|
| google / yahoo | cpc | `google-m-CP{campaignId}_AG{adgroup}_CR{creative}_KW{キーワード}_b_g` | 450 / 1 |
| facebook | cpm | `CP{...}_AG{...}_AD{...}_Facebook_Mobile_Reels` | 28 / 1 |
| youtube | influencer | `20250630_teizanhouso`(日付_案件名) | 43 / 0 |

## 6. 非UTM流入（参考・帰属の受け皿）

| 区分 | 代表値 | 実測計 séss/CV |
|---|---|---|
| direct/未帰属 | `(none)/(none)` | 41,508 / 620（会員登録CVの最大源） |
| オーガニック検索 | google/yahoo/bing/求人ボックス organic | 約23,000 / 72 |
| リファラル | xmile3.lightning.force.com(SF管理画面), access.line.me(9CV), docomo, uber 等 | 約2,300 / 14 |
| AIアシスタント | chatgpt.com / openai（medium=`ai-assistant` or `(none)`） | 約90 / 0（**新興チャネル**） |

---

## サイト内リンクUTM（GA4セッション帰属には出ない・コード実在）

以下は本体コードに実在するが、**サイト内リンク＝既存セッションで踏むためGA4のセッション集計には現れない**（24日間で source=`xwork`/`thanks` は0件）。リンククリック計測・リンク先/Salesforceでの識別が目的。

| 箇所 | source/medium | campaign | 実装 |
|---|---|---|---|
| フッター journal | xwork/referral | `xwork_footer_240618` | Footer.tsx:89 |
| フッター SNS各種 | xwork/referral | `xwork_footer_{instagram\|youtube\|x\|tiktok}` | Footer.tsx:150-180 |
| フッター logipoke系4件 | xwork/**`utm_media`**⚠️ | `7015i000000...`(Salesforce 18桁ID) / `xwork_footer_20240501` | Footer.tsx:109/117/125/133 |
| サイドバー SNSカード | xwork/referral | `xwork_sidebar_{instagram\|youtube\|x\|tiktok}` | SNSContactCard.tsx:14-40 |
| サンクス ポップアップバナー | thanks/referral | `thankspage_popupbanner_0228` | EventRecruitmentModal/index.tsx:21 |
| lp-thanks 通常バナー | thanks/referral | `thankspage_banner_0228` | EventRecruitmentSection.tsx:17 |
| 求人詳細「想定給与を聞く」 | xwork/referral | `kyuyo_240606` | JobDescriptionDetail.tsx:138 |
| uber-taxi LP 相談ボタン | xwork/referral | `special_uber-taxi` | CallAgentButton/index.tsx:11 |
| トップ マガジンリンク | xwork/referral | `top_magazine_241107` | MagazineLinks.tsx:12 |

## pass-through（固定campaignなし・流入URL依存）

会員登録LP7種（`members/signup/_components/{lp_other,lp_fork,lp_taix01,logi,lp_crs_sem-b,lp_drs03,lp_bus01}`）・fair応募フォーム・social-plusコールバックは、**流入時URLのUTMをそのまま引き継ぐ**だけ。campaign値はコードで確定せず広告出稿側の設定次第。

---

## 既知の不具合（コード側・要修正候補。本ドキュメントは注記のみ）

1. **`keep_remider_{1st|2nd|3rd}` タイポ**（正: `keep_reminder`）。`n`欠落。Reminder.ts:48-50。実データにもタイポのまま流入（1st=37/3rd=22séss）。修正時は過去データとの継続性に注意（campaign値が変わり別系列になる）。
2. **logipoke向けフッター4件が `utm_media`**（正: `utm_medium`）。`m`欠落。Footer.tsx:109/117/125/133。GA4がmediumとして認識しない（medium=(none)扱い）。※リンク先が外部(logipoke.com)のためx-work側GA4では元々見えず、影響はlogipoke側の計測。
3. **campaign命名の不統一**: 日付サフィックス式(`xwork_footer_240618`)とSalesforce 18桁ID(`7015i000000...`)が混在。
4. **会員登録LPの変数命名不統一**: lp_otherのみcamelCase、他6つsnake_case。

## GA4で見るときの注意

- **UTM別の数字が意味を持つのは流入UTM（§1〜5）のみ**。サイト内リンクUTM（§サイト内）はセッション集計に出ない。
- SMS(§4)はcampaign粒度が数百種。接頭辞で束ねる。
- 全GA4集計はデフォルトで国=日本フィルタ適用（bot対策、bot-traffic-analysis-2026-07-13.md）。
- 2026-08-11〜のUnassignedインシデント中はsource欠落セッションが増えており、チャネル別の絶対数は割り引いて見る（project_unassigned_incident）。

---

## ダッシュボードで見る

- **UTM別レポート `/utm-report`**: source×medium×campaign別のセッション/ユーザー/CV/期待売上換算。各UTMの意味・発行タイミングを注記（辞書 `lib/constants/utmCatalog.ts`／API `app/api/utm-report/route.ts`）。medium別フィルタつき。※GA4はUTMをセッション開始時のみ読むため、上記「サイト内リンクUTM」はこの画面には出ない（流入UTMのみ対象）。
- LINE専用 `/line-report`、チャネルグループ別 `/cv-types`。
- 生データの再取得: `scripts/tmp-utm-inventory.ts`（GA4 BQ collected_traffic_source をsource/medium/campaign別にセッション/会員登録CVで集計。dry run内蔵）。
- 新しいUTM施策を追加したら、`lib/constants/utmCatalog.ts` の RULES と本ドキュメント（＋用語集 `app/docs/glossary`・`lib/docs/knowledgeBase.ts`）に追記する。
