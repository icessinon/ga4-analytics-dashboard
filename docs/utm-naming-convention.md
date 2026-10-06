# UTM命名規則・施策別リファレンス

対象: x-work.jp ／ データソース: 本体コード(drm-front) ＋ GA4 Data API(property 534098180) ／ 更新日: 2026-10-06

UTM（`utm_source` / `utm_medium` / `utm_campaign` / `utm_content`）別に数字を見るときに、各値が「どの施策のリンクか」を引くための正典。**送信側に共通UTMビルダーは無く、各施策がローカル定数でバラバラに発行している**（受信側だけ `getUtmFromRequest`/`setUtmParamsToCookie` で共通化）。値はコード実測と、GA4 の実流入（**2026-09-06〜10-05・国=日本・30日間**、セッション帰属）で突合済み。以下の表の「実測」は séss / 応募CV / LP応募CV / 会員登録CV の順。

## 共通則

```
utm_source  = <発信元>   product(自社通知) / line(LINE公式) / ca(CA配信) / scout・crm_scout(スカウト一斉配信) / xwork(サイト内) / thanks(サンクス) / google・yahoo・facebook・Kbox(広告) / youtube(インフルエンサー)
utm_medium  = <チャネル> email / line / social / sms / referral / cpc / cpm / influencer
utm_campaign= <施策名>
utm_content = <配信内のどのリンク／どの文面か>   ※使っている施策だけ。付けないと (not set) に寄る
```

### utm_content の使い分け（2026-10 時点）

4つ目の軸。**同じ配信の中で何を分けたいか**で2通りの使われ方をしている。送信側を増やすときはどちらかに寄せる。

| 用法 | 入る値 | 使っている施策 |
|---|---|---|
| **(a) 配信内のリンク位置** | `profile_register` / `line_settings` / `search` / `keeps` / `conditions` / `unsubscribe` / `recommend_{N}` | 会員登録ステップメール（§1）。1通に複数リンクがあるとき、どれが押されたかを分ける |
| **(b) 文面バリアント＝AB** | `featured` / `featured_a` / `featured_b` / `normal` | スカウトSMS（§4）。リンクは1本で、訴求文面だけを振っている。`_a`/`_b` は 2026-09-26 開始 |
| (参考) 媒体が自動付与するID | クリエイティブID（facebook cpm）/ `Kbox_agent_media_{求人ID}`（Kbox cpc） | 広告（§5）。意味は媒体側の管理画面で引く |

`utm_term` は facebook の広告セットIDとオーガニック検索語しか入っておらず、自社施策では使っていない。

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

| 施策 | medium | campaign | content | 実測(30日) séss/応募/LP/登録 | 実装 |
|---|---|---|---|---|---|
| おすすめ求人 LINE（→求人詳細） | line | `job_description` | － | 681 / 11 / 4 / 2 | line-message-deliver/scripts/DeliveryRecommendJobs.ts:26 |
| おすすめ求人 LINE（→応募フォーム） | line | `entry_form` | － | 46 / 4 / 1 / 0 | 同上:27 |
| LP応募サンクス系メール | email | `lp_thanks` | － | 257 / 4 / 11 / 8 | ※コード未特定（下記注） |
| 会員登録完了メール（ウェルカム） | email | `signup_complete` | － | 101 / 1 / 2 / 1 | apps/web/src/commons/mail/htmls/signupUserHtml.tsx:36 |
| 応募完了メールのおすすめ求人 | email | `application_complete` | － | 30 / 5 / 0 / 0 | apps/web/src/commons/mail/prepareTemplateValues.ts:13 |
| **会員登録ステップメール** | email | `signup_step_{day1\|day3\|day7\|day14\|day30}` | **リンク位置** | 計94（day1=59・day3=20・day7=15） | SignupStepMailsStack/.../templates.ts:36 |
| キープ求人リマインド1通目 | email | `keep_remider_1st` ⚠️ | － | 71 / 1 / 3 / 1 | x-work-messaging/src/lambda/Reminder.ts:48 |
| キープ求人リマインド2通目 | email | `keep_remider_2nd` ⚠️ | － | 52 / 3 / 1 / 0 | 同上:49 |
| キープ求人リマインド3通目 | email | `keep_remider_3rd` ⚠️ | － | 40 / 1 / 0 / 0 | 同上:50 |
| **本体スカウト通知SMS** | sms | `scout_{scoutId}` | － | 1,386 / 7 / 2 / 1（scoutId単位で数百種） | ScoutSmsNotificationFunction/handler.ts:99 |

- **会員登録ステップメール（2026-10リリース）が utm_content の基準実装**。`utm_source=product&utm_medium=email&utm_campaign=signup_step_{key}&utm_content={リンク位置}`。content値は `profile_register`(day1) / `line_settings`(day3) / `search`(day7) / `keeps`(day14) / `conditions`(day30) / `unsubscribe`(全通の配信停止) / `recommend_{N}`(差し込みおすすめ求人のN件目)。
  - day3 のLINE連携導線は **lin.ee に直リンクせず `x-work.jp/members/settings` を経由している**。メールから外部LINEへ直リンクするとGA4に何も残らないため、この経由が正しい作法（後述「メール内LINE導線の作法」）。
- 本体スカウト通知SMSは 2026-09 に `sms`/`scout` から `product`/`sms`/`scout_{scoutId}` へ命名変更。campaignがscoutId単位で無限に増えるので接頭辞 `scout_` で束ねる。
- LINE配信URLは末尾に `&openExternalBrowser=1` 付き（LINE内ブラウザ→外部ブラウザ遷移）。
- **`lp_thanks`（email）はコード調査で発行元を特定できていない**が実流入あり（257séss）。別リポジトリ or 配信基盤側の可能性。要追跡。
- ⚠️ `keep_remider` は `keep_reminder` のタイポ（後述「既知の不具合」）。実データにもタイポのまま乗っている。medium=`line` 版も少量流入。

## 2. LINE公式アカウント（utm_source=line, medium=social）

リッチメニュー・サーベイ後の配信。**drm-frontコードには無く、LINE公式アカウント側の設定**。medium=`social`。

| 施策 | campaign | 実測(30日) séss / 登録CV | 登録CVR |
|---|---|---|---|
| リッチメニュー: 会員向け求人検索 | `richmenu_member_jobsearch` | 571 / 2 | 0.4% |
| リッチメニュー: 全員向け求人検索 | `richmenu_all_jobsearch` | 479 / 22 | 4.6% |
| **サーベイ完了→スカウト誘導** | `survey_thanks_scout` | 333 / **68** | **20.4%** ★ |
| リッチメニュー: 会員向けスカウト確認 | `richmenu_member_scoutcheck` | 279 / 0 | 0% |
| リッチメニュー: 整備向け求人検索 | `richmenu_seibi_jobsearch` | 62 / 1 | 1.6% |
| リッチメニュー: 全員向け登録 | `richmenu_all_registration` | 47 / 5 | 10.6% |

★ `survey_thanks_scout` は会員登録CVRが突出（LINE社経由CVがサイト平均の桁違い＝過去調査 line-traffic-analysis-2026-07-07.md とも整合）。

## 3. CA配信（utm_source=ca, medium=line）

| 施策 | campaign | 実測(30日) séss / 応募CV | 実装 |
|---|---|---|---|
| CAからの求人提案LINE | `ca/line/job_propose_202412` | 88 / 6 | CA運用（コード外・手動配信の可能性） |

## 4. スカウト一斉配信（マーケ配信・最大ボリューム）

b-dash/Accrete系の一斉配信。**求職者を求人詳細/スカウトページへ送客（会員登録が目的ではない）** ため会員登録CVはほぼ0だが、`scoutId`経由の応募に効く。**SMSに加えてメール（medium=`email`）でも配信しており、メール分だけで30日7,300séss ある**（前回2026-08調査時点では見えていなかった系統）。

| source | medium | campaign 命名パターン | content | 意味 | 実測計(30日) séss/応募/LP/登録 |
|---|---|---|---|---|---|
| `scout` | sms | `at_agent_fee_media_{求人ID}_{yyyymmdd}_{セグメント}`／`at_agent_media_{求人ID}_fee_{yyyymmdd}_{セグメント}` | － | 人材紹介(agent)スカウト。手数料課金 | **101,364** / 39 / 216 / 50 |
| `scout` | **email** | `at_agent_*`（SMSと同じcampaign命名） | － | 人材紹介スカウト**メール** | **5,528** / 10 / 32 / 6 |
| `scout` | sms | `agent_media_{求人ID}_{yyyymmdd}_{配信時刻}` ⚠️ | － | 同上の**`at_`なし系統**（800=朝枠 / 1700=夕枠） | 5,399 / 2 / 6 / 4 |
| `crm_scout` | **email** | `at_direct_*` | － | 求人広告スカウト**メール** | 1,795 / 3 / 5 / 0 |
| `crm_scout` | sms | `at_direct_{yyyymmdd}_{都道府県}_{職種}_media_{求人ID}[_{セグメント}]` | **`featured` / `featured_a` / `featured_b` / `normal`** | 求人広告(direct)スカウト | 2,566 / 0 / 6 / 1 |
| `scout` | sms / email | `media_{求人ID}_{yyyymmdd}[_{連番}]` ⚠️ | － | さらに別命名の少量系統（旧配信の残り？） | 196 / 0 / 0 / 1 |

- campaign のセグメント例: `large_east_1` / `large_west_1` / `26y_402_1`(年式×コード×バッチ) / `26y_60day_400_1` / `newjob_26yck_1` / `HP_26_1` / `HP_60d_1`。direct側は末尾に `_groupa` / `_groupb` / `_age4555` が付く。campaign粒度が細かく数万種あるため、**接頭辞で束ねて見る**のが実用的。
- ⚠️ **`agent_media_*` / `media_*` は `at_` が無いので、`at_agent` で絞ると丸ごと漏れる**（30日で5,595séss＝agent系SMSの約5%）。束ねるときは `at_agent` / `agent_media` / `media_` を全部拾う。
- **crm_scout SMS の `utm_content` は文面のAB**。`featured`(注目求人訴求・単独) が従来版で、2026-09-26から `featured_a` / `featured_b` の2文面に分けて配信している。`normal` は通常文面。30日実測は featured 1,320 / featured_a 600 / featured_b 593 / normal 53 séss（CVはどれもほぼ0なので、この軸で勝ち負けを判定するには応募側＝scoutId経由の数字が要る）。
- SMSリンク実装（本体・マーケ配信とは別系統）: `${SITE_BASE_URL}/scout/${scoutId}?utm_source=product&utm_medium=sms&utm_campaign=scout_${scoutId}`（ScoutSmsNotificationFunction/handler.ts:99）。§1に記載。

## 5. 広告（paid）

| source | medium | campaign 例 | content / term | 実測計(30日) séss |
|---|---|---|---|---|
| google / yahoo | cpc | `google-m-CP{campaignId}_AG{adgroup}_CR{creative}_KW{キーワード}_{b\|e}_g` | － / 検索語 | 約450 |
| facebook | cpm（一部 `paid`） | `CP{...}_AG{...}_AD{...}_{Facebook_Mobile_Reels\|Instagram_Feed}` | クリエイティブID / 広告セットID | 240 |
| **Kbox**（求人ボックス有料枠） | cpc | `Kbox_agent_drs_driver_chubu` / `agent_crs_sekokan_ittosankenn` 等 | `Kbox_agent_media_{求人ID}` / － | 48 |
| youtube | influencer | `20250630_teizanhouso`(日付_案件名) | － | 33 |

- facebook は campaign に広告ID、content にクリエイティブID、term に広告セットIDが**媒体側で自動付与**される。意味は Meta 管理画面で引く。
- **Kbox＝求人ボックスの有料クリック枠**。`utm_content` の `Kbox_agent_media_{求人ID}` でどの求人経由かが分かる（＝求人単位のCPAが出せる）。無料のオーガニック流入は `求人ボックス.com / referral` で別に立つ。

## 6. 非UTM流入（参考・帰属の受け皿）

| 区分 | 代表値 | 実測計(30日) séss / 応募 / LP応募 / 登録 |
|---|---|---|
| direct/未帰属 | `(direct)/(none)` | 42,153 / 153 / **28,240** / 731（LP応募と会員登録CVの最大源） |
| オーガニック検索 | google / yahoo / bing organic | 37,883 / 78 / 177 / 137 |
| **Googleしごと検索** | `google_jobs_apply / organic` | 1,146 / 19 / 8 / 9（Google for Jobs の応募枠） |
| リファラル | xmile3.lightning.force.com(SF管理画面), 求人ボックス.com, docomo, uber, access.line.me 等 | 約3,500 / 16 / 14 / 8 |
| AIアシスタント | chatgpt.com（medium=`ai-assistant`） | 59 / 1 / 0 / 1（**新興チャネル**） |
| 計測欠落/未割当 | `(not set)` 全欄 | 811 / 3 / 52 / 9 |

- LP応募CVの28,240が direct に寄っているのは、LPが別ドメイン/別導線から来ていてUTMが載っていないため。LP別の流入元はUTMでは切れない。

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

## メール/SMS内のLINE導線の作法（新規に足すとき）

LINE連携バナーのように**遷移先がLINE（lin.ee / LIFF / ソーシャルプラス認証）になる導線は、UTMを付けても何も計測できない**。x-work.jp のGA4は自ドメインに着地したセッションしか見ないためで、`lin.ee/xxxx?utm_source=...` は丸ごとGA4の外に出る。

やること:

1. **リンク先を `x-work.jp` の中継ページにする**。会員登録ステップメール day3 がこの形で、`https://x-work.jp/members/settings?utm_source=product&utm_medium=email&utm_campaign=signup_step_day3&utm_content=line_settings` → 設定画面のLINE連携ボタン → LINE、と踏ませている。中継を挟んだ分だけGA4に流入が残り、`utm_content` でどのメールのどのバナー経由かが分かる。
2. **中継先のボタンに `data-click-label` を付ける**。中継ページ到達までがGA4で、そこからLINEへ出る1クリックはクリックラベルでしか測れない（`/line-report` のサイト→LINE連携セクションはこのラベルを集計している）。
3. **LINE側の inflow-route（友だち追加経路ID）を導線ごとに新規発行する**。連携"完了"数はGA4では取れず、LINE側でしか分からない。既存の導線とIDを共有すると、どのバナー経由で増えたかがLINE側でも分からなくなる（現状フッター・サンクス・SNSカードが同一IDを共有していてこの状態）。

UTM値は既存の流儀に合わせて `utm_campaign` は配信の識別、`utm_content` は配信内のどのリンクか、で振る。文面ABを同時に見たいときは `utm_content` の末尾に `_a` / `_b` を付ける（スカウトSMSの `featured_a` / `featured_b` と同じ形）。

## pass-through（固定campaignなし・流入URL依存）

会員登録LP7種（`members/signup/_components/{lp_other,lp_fork,lp_taix01,logi,lp_crs_sem-b,lp_drs03,lp_bus01}`）・fair応募フォーム・social-plusコールバックは、**流入時URLのUTMをそのまま引き継ぐ**だけ。campaign値はコードで確定せず広告出稿側の設定次第。

---

## 既知の不具合（コード側・要修正候補。本ドキュメントは注記のみ）

1. **`keep_remider_{1st|2nd|3rd}` タイポ**（正: `keep_reminder`）。`n`欠落。Reminder.ts:48-50。実データにもタイポのまま流入（1st=37/3rd=22séss）。修正時は過去データとの継続性に注意（campaign値が変わり別系列になる）。
2. **logipoke向けフッター4件が `utm_media`**（正: `utm_medium`）。`m`欠落。Footer.tsx:109/117/125/133。GA4がmediumとして認識しない（medium=(none)扱い）。※リンク先が外部(logipoke.com)のためx-work側GA4では元々見えず、影響はlogipoke側の計測。
3. **campaign命名の不統一**: 日付サフィックス式(`xwork_footer_240618`)とSalesforce 18桁ID(`7015i000000...`)が混在。
4. **会員登録LPの変数命名不統一**: lp_otherのみcamelCase、他6つsnake_case。
5. **スカウトSMSのcampaignに `at_` あり/なしが混在**（`at_agent_fee_media_*` / `at_agent_media_*_fee_*` / `agent_media_*`）。接頭辞で束ねる運用なのに接頭辞が3通りあり、30日で5,249séss（agent系の約10%）が `at_agent` 絞りから漏れる。配信基盤側の設定。
6. **`utm_content` の用法が2系統に割れている**（自社メール＝リンク位置 / スカウトSMS＝文面AB）。どちらも妥当だが、新規施策はどちらに寄せたかを本ドキュメントに明記すること。

## GA4で見るときの注意

- **UTM別の数字が意味を持つのは流入UTM（§1〜5）のみ**。サイト内リンクUTM（§サイト内）はセッション集計に出ない。
- SMS(§4)はcampaign粒度が数万種。接頭辞（`at_agent` / `agent_media` / `at_direct` / `scout_`）で束ねる。
- GA4 Data API のディメンション名: `sessionSource` / `sessionMedium` / `sessionCampaignName` / `sessionManualAdContent`(=utm_content) / `sessionManualTerm`(=utm_term)。BQ Export では `collected_traffic_source.manual_content` / `.manual_term`。
- **utm_content を軸に足すと、使っている配信だけ行が割れる**（使っていない配信は `(not set)` 1行のまま）。campaignまでの粒度で見たいときは content を畳む。
- 全GA4集計はデフォルトで国=日本フィルタ適用（bot対策、bot-traffic-analysis-2026-07-13.md）。
- 2026-08-11〜のUnassignedインシデント中はsource欠落セッションが増えており、チャネル別の絶対数は割り引いて見る（project_unassigned_incident）。

---

## ダッシュボードで見る

- **UTM別レポート `/utm-report`**: source×medium×campaign×**content**別のセッション/ユーザー/CV/期待売上換算。各UTMの意味・発行タイミングと、content が何を分けているかを注記（辞書 `lib/constants/utmCatalog.ts` の `describeUtm` / `describeUtmContent`／API `app/api/utm-report/route.ts`）。medium別フィルタと「utm_contentで分ける」トグル（外すとcampaign粒度に畳む）つき。※GA4はUTMをセッション開始時のみ読むため、上記「サイト内リンクUTM」はこの画面には出ない（流入UTMのみ対象）。
- LINE専用 `/line-report`、チャネルグループ別 `/cv-types`。
- 生データの再取得: `scripts/tmp-utm-inventory.ts`（GA4 BQ collected_traffic_source をsource/medium/campaign別にセッション/会員登録CVで集計。dry run内蔵）。
- 新しいUTM施策を追加したら、`lib/constants/utmCatalog.ts` の RULES と本ドキュメント（＋用語集 `app/docs/glossary`・`lib/docs/knowledgeBase.ts`）に追記する。
