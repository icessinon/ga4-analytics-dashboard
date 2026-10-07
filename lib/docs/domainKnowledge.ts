/**
 * クロスワーク（x-work.jp）のドメイン知識。用語集ページ（/docs/glossary）と AI Q&A の知識ベース
 * （lib/docs/knowledgeBase.ts）の両方がここから生成される。片方だけ直すと食い違うので、必ずここを更新する。
 *
 * ブロックの種類: paragraph / list / table / component（ページ側が差し込む計算表）。
 * 文中は **太字**・`コード`・[リンク](href) の 3 つだけ使える（renderInline が解釈）。
 * audience: 'kb' は AI 向けの細かい一覧（UTM のキャンペーン別実測など）で、用語集には出さない。
 */

export type KnowledgeAudience = 'both' | 'kb' | 'glossary'

export type KnowledgeBlock =
    | { type: 'paragraph'; text: string; strong?: boolean; audience?: KnowledgeAudience }
    | { type: 'list'; items: string[]; audience?: KnowledgeAudience }
    | { type: 'table'; columns: string[]; rows: string[][]; audience?: KnowledgeAudience }
    | { type: 'subheading'; text: string; audience?: KnowledgeAudience }
    /** ページ側が描画する計算済みの表（CV 単価など）。kbText は AI 向けの要約 */
    | { type: 'component'; id: 'cvUnitTable'; kbText: string }

export interface KnowledgeSection {
    id: string
    title: string
    blocks: KnowledgeBlock[]
}

export const GTM_TAG_LEDGER_URL = 'https://docs.google.com/spreadsheets/d/1MloagdIuwrm5yK_cUZ7aO6e9j6sH6oFgcCXD45woVn4/edit'

export const DOMAIN_SECTIONS: KnowledgeSection[] = [
    {
        id: 'terms',
        title: '事業・サービス用語',
        blocks: [
            {
                type: 'table',
                columns: ['用語', '意味'],
                rows: [
                    ['クロスワーク', 'x-work.jp。ドライバー・建設・製造等の現場系職種に特化した求人転職プラットフォーム'],
                    ['Direct（求人広告事業）', '企業がクロスワークに広告として直接掲載する求人事業。応募後は求職者と企業が直接やりとり'],
                    ['HRS（人材紹介事業）', 'キャリアアドバイザー（CA）が間に入る紹介事業の総称。成約時に企業から紹介手数料を得る'],
                    ['DRS / CRS / MRS / SRS', '人材紹介の領域別ブランド: DRS=ドライバー、CRS=建設、MRS=製造、SRS=警備系。LP応募サンクス（/lp-thanks/drs 等）のslugに対応'],
                    ['Featured', 'CRM（スカウトSMS・メール・LINE）経由の既存ユーザー向け特設ページ（/featured）。**配信対象は人材紹介求人のみ**（求人広告・ハロワのfeatured応募は実データ上ゼロ）'],
                    ['スカウト', '企業管理画面から送信リクエスト → ScoutHistories(DynamoDB)にattempt(status=requested)記録 → DDB Streams → Lambda → Accrete SMS API でSMS送信（リンクは /scout/{scoutId}）。送信結果は sent / failed として DynamoDB に書き戻される（2026-10時点: requested 約1.7万件のうち failed 54件＝0.3%）。/scout/{scoutId} → /entry/{id}?scoutId= → source=scout_apply(求人広告)/scout_inquiry(人材紹介・HW)。送信→閲覧→応募は[スカウト効果ファネル](/scout)で確認'],
                    ['Matching', 'Salesforce上のオブジェクト（Matching__c）。人材紹介の応募1件ごとに1レコード作成される。種別フィールドに「自然応募」等の経路区分あり'],
                    ['CA', 'キャリアアドバイザー。求職者との面談・求人提案・選考支援を行う'],
                ],
            },
        ],
    },
    {
        id: 'contract-type',
        title: '求人の契約種別（contractType）',
        blocks: [
            {
                type: 'table',
                columns: ['', '求人広告', '人材紹介', 'ハローワーク'],
                rows: [
                    ['掲載元', '企業が直接掲載', '自社の紹介事業', 'ハローワーク求人の転載'],
                    ['CTAボタン', '「応募する」', '「話を聞いてみる」', '「話を聞いてみる」'],
                    ['会員登録', '必須（応募時に自動作成）', '不要（ゲスト応募可）', '不要（ゲスト応募可）'],
                    ['応募後', '企業と直接選考', 'CA面談→紹介', 'CA経由（紹介扱い）'],
                    ['収益', '掲載料', '成約時の紹介手数料', '（紹介への送客）'],
                    ['GTMラベル', 'JobA / ThxJobA', 'JobR / ThxJobR', 'JobH / ThxJobH'],
                    ['スカウト配信', 'ほぼなし', '**あり（配信の主対象）**', 'なし'],
                ],
            },
            {
                type: 'paragraph',
                text: '求人詳細URL（/{industry}/media_{id}）・応募フォーム（/entry/media_{id}）・サンクス（/entry/thanks）は**3種とも共通**のため、URLだけでは種別を判別できない。分解にはGTMラベル（JobA/JobR/JobH）を使う。',
            },
        ],
    },
    {
        id: 'cv-definition',
        title: 'CVの定義（ダッシュボードの指標）',
        blocks: [
            {
                type: 'table',
                columns: ['指標', '計測方法', '意味・注意点'],
                rows: [
                    ['応募CV', '/entry/thanks 到達ユーザー（page_view）', 'サイト内フォームからの応募。**求人広告・人材紹介・ハロワの3種が混在**（種別分解は[求人種別CV分析](/cv-types)で）'],
                    ['LP応募CV', '/lp-thanks/{slug} 到達ユーザー', '広告LP（/lp_*）経由の人材紹介リード。slugが事業領域（drs/crs/mrs/mrs_maker/srs/food）'],
                    ['会員登録CV', '/members/signup/thanks 到達ユーザー', '?occ=職種 パラメータで職種別に分解可能。**求人広告応募時の自動会員化は含まれない**'],
                    ['種別別応募完了', '送信ボタンのクリックラベル（EF__JobX__Btn__応募する/話を聞いてみる）', 'ボタンは入力完了までdisabledのため「クリック=応募実行」。**DynamoDB実応募数と一致確認済み**・bot耐性あり（2026-07-22検証）'],
                    ['自然応募（Salesforce用語）', 'Matching__c の種別=自然応募', 'スカウト・配信・CA経由でない応募。サイト計測ではなくSF連携（Zapier）由来のため、連携停止時に欠落する事故歴あり（2026-07）'],
                ],
            },
            {
                type: 'paragraph',
                text: '応募の全体像はレイヤー構造: ①サイト内フォーム（ダッシュボードで計測）②featured配信経由（別フォーム・GTMラベル未実装のため計測外。スカウトSMS経由の応募は scoutId で追えるため[スカウト効果ファネル](/scout)で計測可）③CA代理登録・電話応募（Web外）。②③はDynamoDB/Salesforceにのみ存在する。',
            },
        ],
    },
    {
        id: 'cv-unit-value',
        title: 'CV単価（期待売上換算）',
        blocks: [
            {
                type: 'paragraph',
                text: '**CV単価 ＝ そのCVをした人たちが最終的に生んだ確定売上 ÷ CV件数 ＝ 成約率 × 平均紹介手数料**。決め事や理論値ではなく、Salesforceの過去実績からの逆算値。算出は **登録履歴(RegistHistory__c) → そのCVのCA活動履歴(AgentActivityHistory__c) → 紐づくマッチングのうち「7.入社済」の受注額−返金想定額 ÷ CV件数**。求職者単位で全マッチングを合算せず（過大評価）、応募求人だけにも絞らない（CAが別求人＝特に人材紹介案件へ再マッチして生んだ成約を取りこぼす）**CA活動履歴基準**の中庸。ダッシュボードの金額表示（[CV単価・お金まわり](/cv-value)、求人種別CV分析、会員登録ファネル）はすべてこの係数（lib/constants/cvUnitValue.ts）を使う。',
            },
            {
                type: 'component',
                id: 'cvUnitTable',
                kbText: '現行値（2026-10-07 再算出・コホート登録2025-01〜2025-12／会員登録2025-08〜12）: 会員登録 約2.0万円(¥19,760、成約率2.2%×純手数料約89万) / 人材紹介応募 約1.6万円(¥15,912、2.0%×約81万) / 求人広告応募 約1.9万円(¥18,602、4.2%×約44万・売上主体はCAの人材紹介再マッチ) / ハローワーク応募 約9,200円(¥9,230、1.0%×約94万・HW自体は手数料ゼロ)。2026-08-27 比で人材紹介 +61 円・ハローワーク +504 円（コホートが成熟し入社が積み上がった分）、会員登録・求人広告は変化なし',
            },
            {
                type: 'paragraph',
                text: '**読み方の注意（誤読しやすいポイント）**: これは期待値（平均）であり、個々のCVに値札がつくわけではない。例えば登録100件のうち約98件は売上ゼロで、2件強が約89万円の成約を生む——均すと1件約2.0万円。正しい使い方は「登録を月100件増やす施策 ＝ 月約200万円の売上増と同等の価値」のように**件数×単価で施策同士を比較する**こと。会員登録がハロワ応募の約2.3倍なのは主に**成約率の差**（登録者は架電→面談→CA提案のエンジンに乗り、featured配信対象にもなる。ハロワ応募者はゲストのまま会員化されない）。応募3種別（JobR/JobA/JobH）は**同一入社の二重計上を除去済み**（優先度 人材紹介＞求人広告＞ハローワーク）。会員登録は「登録の下流価値」指標のため応募との重複を許容し据え置き（＝応募と合算しない前提。¥19,760＝純登録¥13,650＋下流価値¥6,110）。',
            },
            {
                type: 'paragraph',
                text: '**参考: 事業全体の平均手数料は約103万円/件**（2025-10〜2026-09 の入社済 5,495件・受注額約56億円。月400〜600件、月次平均は96万〜115万円で緩やかな上昇傾向。2026-10-07 時点）。Web経由CVコホートの平均（81万〜94万円）が全体よりやや低いのは、DRスカウト・エージェント経由など高単価領域の成約が全体には含まれるため。単価を再算出するときは**成約率とこの手数料相場の両方**が動いていないかを確認する。',
            },
            {
                type: 'paragraph',
                text: '**前提と更新ルール**: 受注額ベース（検収・入金ベースではない）。コホートは登録日2025-01〜2025-12（会員登録のみ2025-08〜2025-12）で、成約リードタイム確保のため直近2ヶ月のCVは除外して算出。内定・内定承諾のパイプラインは分子に含めない保守的な値。市況・CA運用・手数料相場で動くため**四半期に1回程度の再算出を推奨**。係数の実体は lib/constants/cvUnitValue.ts（算出根拠コメントつき）で、ここを更新すればこの表も含め全ページに自動反映される。',
            },
        ],
    },
    {
        id: 'application-source',
        title: '応募ソース（JobApplicationSource）',
        blocks: [
            {
                type: 'table',
                columns: ['source値', '意味'],
                rows: [
                    ['null（なし）', '通常応募＝自然応募。ユーザーが自力でサイトに来て応募'],
                    ['featured_apply / featured_inquiry', 'スカウト特設ページ（featured）の「応募する」/「話を聞いてみる」'],
                    ['featured_one_click_apply / _inquiry', 'featured の1クリック応募（フォーム入力なし）'],
                    ['scout_apply / scout_inquiry', 'scoutId付きで通常entryフォームから応募（スカウト経由）'],
                    ['ca_referral', 'CA紹介（代理登録）'],
                ],
            },
        ],
    },
    {
        id: 'persona',
        title: '求職者属性・ペルソナ（Salesforce 登録者）',
        blocks: [
            {
                type: 'paragraph',
                text: 'Salesforce CustomObject1__c（求職者、約134万件・2026-10-07時点）の属性分布。可視化は[求職者属性・ペルソナ](/persona)、スナップショットは lib/constants/personaSnapshot.ts（再生成は scripts/snapshots/regen-persona-snapshot.ts）。これは**登録者（人材紹介リード）**の姿で、サイト訪問者全体ではない。',
            },
            {
                type: 'list',
                items: [
                    '職種軸は**登録サービス（Field5__c＝事業領域）**を使う。全件に付与され、ドライバーが最大（約85万人）。次いで建設・施工管理18万、タクシー12万、製造・メーカー6万',
                    '希望職種（DesiredOccupation__c）は約2万件のみで施工・製造系に偏り、**ドライバー系の値が構造的に存在しない**。これで全体像を見るとドライバーが丸ごと消える',
                    '付与率: 事業領域100% / 年齢99.9% / 気持ち89% / 転職時期87% / 勤務地87% / 仕事状況85% / 雇用形態84% / **性別64%**（ドライバーは約57%）。女性比は性別回答者の部分集合上の値',
                    '全体像: 40〜60代が約7割・男性約89%と高年齢＆男性偏重。顕在層（転職時期「なるべく早く」〜3ヶ月以内）約67%、うち「なるべく早く」約34%・首都圏集中。事業領域で年齢構成は大きく異なる（タクシーは50代以上が過半、整備士は若手が多い）',
                    'サイト訪問者全体の年齢・性別を見たい場合は GA4 のデモグラフィック（別母集団・匿名）を参照',
                ],
            },
        ],
    },
    {
        id: 'url',
        title: 'URL構造',
        blocks: [
            {
                type: 'table',
                columns: ['パターン', 'ページ'],
                rows: [
                    ['/', 'トップページ（主要導線は検索モーダルと職種ボタン）。初回訪問者のみ表示（再訪は cookie で一覧へリダイレクト）'],
                    ['/{industry}', '大職種一覧。スラッグ14種: driver, sekokan, sekkei, soko, shokunin, seibi, hoshu, setsubi-sagyo, keibi, unkan, kojo-sagyo, food, unyu-sagyo, others'],
                    ['/{industry}/{sub}', '絞り込み（サブ職種 or 都道府県。例: /driver/taxi、/driver/tokyo）'],
                    ['/{industry}/media_{id}', '求人詳細（契約種別3種で共通フォーマット）'],
                    ['/entry/media_{id} → /entry/thanks', '応募フォーム→サンクス（3種共通）'],
                    ['/members/signup → /members/signup/thanks?occ=', '会員登録フォーム→サンクス（職種パラメータ付き）'],
                    ['/lp_{slug} → /lp-thanks/{slug}', '広告LP→LP応募サンクス（人材紹介リード）'],
                    ['/featured/...', 'スカウト特設（人材紹介のみ・GTMラベル未実装）'],
                    ['/scout/{scoutId}', 'スカウトSMSのリンク先。CTA から /entry/{id}?scoutId= へ'],
                    ['/search、/cond/license*、/journal', '検索結果、資格条件、コラム'],
                    ['/manage/*、/admin/*', '企業側管理・社内管理（専用GTMコンテナ）'],
                ],
            },
        ],
    },
    {
        id: 'gtm-ga4',
        title: 'GTM / GA4 の構成（重要: 二重構成）',
        blocks: [
            {
                type: 'table',
                columns: ['', '分析用（このダッシュボード）', 'マーケ用'],
                rows: [
                    ['GTMコンテナ', 'GTM-TG9PR444', 'GTM-W7NPT5M（広告タグ・Criteo・LINE Tag等も同居）'],
                    ['GA4プロパティ', '534098180（x-work.jpアカウント）', '351088797「X-Work - GA4」（X-Workアカウント）ほか複数'],
                    ['主なイベント', 'data_click_label / data_view_label / time_on_page / view_scout_featured_page', 'page_view / view_job_details_page / page_category / contract_type_event 等'],
                    ['カスタムディメンション', 'click_label / view_label / click_context / data_time_label / scout_id / company_id', '契約種別 / page_category / job_image_presence 等'],
                ],
            },
            {
                type: 'paragraph',
                text: '**両者の数字は定義が違うため一致しない**（イベント発火 vs 要素視認、国フィルタ有無、featured計測有無）。差異の詳細な検証結果は 2026-07-22 の調査で確定済み（求人種別CV分析ページの注記参照）。',
            },
            { type: 'subheading', text: 'ラベル規則' },
            {
                type: 'list',
                items: [
                    `全タグの仕様・実装状況は [GTMタグ管理台帳（スプレッドシート）](${GTM_TAG_LEDGER_URL}) が正。483タグ定義があり、未対応・対応中のタグも多い（欲しいラベルが無いときはまず台帳を確認）`,
                    '形式: `{Area}__{Section}__{Element}__{Label}`（例: CT__Recruitment__Btn__求人を見る）',
                    'Area: CT=トップ系（一覧ページでも使い回しあり）、SU=会員登録、EF=エントリーフォーム、MW=検索モーダル、HD=ヘッダー、FL=フローティング、FT=フッター、DL=求人詳細',
                    '種別セクション: EF__{JobR|JobA|JobH}（応募フォーム）、EF__Thx{JobR|JobA|JobH}（サンクス）、DL__Media__Area__{JobX}（詳細ページ）',
                    'ABテストのB/C/D側ラベル: 末尾に `__B-1618` のようなサフィックス（drm-frontのuseABTestが付与）。ダッシュボードのCVRラベルは `*` ワイルドカード可',
                ],
            },
            { type: 'subheading', text: '計測の性質（数字を読むときの注意）' },
            {
                type: 'list',
                items: [
                    '**view_label**: 要素が50%×1秒表示で発火（ONCE_PER_ELEMENT）→ 即離脱・高速スクロールで15〜20%取りこぼす。ファネルのステップ順はユーザー数でなくStep番号順で並べる',
                    '**click_label**: クリックで確実に発火。botの影響を受けない（botはクリックしない）',
                    '**ダッシュボードの全GA4集計はデフォルトで国=日本フィルタ適用**（2026-06にTencent Cloud SGの分散スクレイパーが日本と同規模のセッションを発生させたため）。国別分析のみ除外可能。BigQuery経路も GA4_EXPORT_DEFAULT_FILTER で同じ除外を必ず付ける',
                    '標準ディメンションの主な用途: pagePath（クエリなし）/ pageLocation（フルURL。userId= や utm_source=sms の判別に使用）/ pageReferrer（直前ページ近似）/ sessionDefaultChannelGroup（チャネル）',
                    '求人カードのタイトルリンクにはラベルなし（ボタンのみ計測）。検索結果→詳細遷移の約4割はタイトルリンク経由',
                    'GA4のトラフィックデータは2026-05以降のみ。キーイベント未設定のため、CVはすべてページ/ラベルベースで計測',
                ],
            },
        ],
    },
    {
        id: 'utm',
        title: 'UTM命名規則（配信・流入元の計測）',
        blocks: [
            {
                type: 'paragraph',
                text: 'UTM（utm_source / utm_medium / utm_campaign / utm_content）別に数字を見るときに、各値が「どの施策のリンクか」を引くための規則。送信側に共通ビルダーは無く各施策がバラバラに発行し、受信側のみ getUtmFromRequest / setUtmParamsToCookie で共通化されている。キャンペーン別の実測値まで含む完全版は `docs/utm-naming-convention.md`、UTM別の集計は[UTM別レポート](/utm-report)（各UTMの意味は lib/constants/utmCatalog.ts の describeUtm が注記）。',
            },
            {
                type: 'paragraph',
                text: '**最重要の読み分け**: ①**流入UTM**（メール/LINE/SMS通知・広告など外部→サイト）はGA4のセッション帰属に計上され、UTM別の数字が見れる。②**サイト内リンクUTM**（フッター/サイドバー/バナー/LP誘導ボタン）はGA4がUTMをセッション開始時のみ読むため**ほぼ計上されない**（既存セッションは元sourceを保持）。裏取り: utm_source=xwork / thanks のセッションは24日間で0件。フッター等のUTMはリンククリック計測・リンク先/Salesforce識別が目的で、流入計測用ではない。',
            },
            { type: 'subheading', text: '共通則' },
            {
                type: 'list',
                items: [
                    '`utm_source`=発信元: product（自社通知）/ line（LINE公式）/ ca（CA配信）/ scout・crm_scout（スカウト一斉配信）/ xwork（サイト内）/ thanks（サンクス）/ google・yahoo・facebook・Kbox（広告）/ youtube（インフルエンサー）',
                    '`utm_medium`=チャネル: email / line / social / sms / referral / cpc / cpm / influencer',
                    '`utm_campaign`=施策名、`utm_content`=配信内のどのリンクか、または文面バリアント（2系統。新規施策はどちらに寄せたかを docs に明記）。①リンク位置＝自社メール（profile_register / line_settings / search / keeps / conditions / unsubscribe / recommend_N）②文面バリアント＝AB（スカウトSMSの featured / featured_a / featured_b / normal。a/b は2026-09-26開始）③広告は媒体が自動付与（facebook=クリエイティブID、Kbox=Kbox_agent_media_{求人ID}）。utm_term は自社施策では未使用',
                    'GA4 Data API のディメンションは sessionManualAdContent（=utm_content）/ sessionManualTerm（=utm_term）',
                    '既知の不具合: キープリマインドの campaign が `keep_remider_{1st|2nd|3rd}`（keep_reminder のタイポ・n欠落。Reminder.ts:48-50。実データにもタイポのまま流入）／ logipoke フッター4件が `utm_media`（utm_medium の m 欠落・Footer.tsx）で GA4 が medium を認識しない／campaign 命名が日付式と Salesforce 18桁ID で混在',
                ],
            },
            { type: 'subheading', text: 'メール / SMS に LINE 導線を足すときの作法' },
            {
                type: 'list',
                items: [
                    'lin.ee / LIFF 直リンクは GA4 の外に出るので UTM を付けても何も測れない',
                    '① x-work.jp の中継ページに着地させる（ステップメール day3 が /members/settings?...&utm_content=line_settings の形）② 中継先ボタンに data-click-label を付ける（[LINEレポート](/line-report)のサイト→LINE連携はこれを集計）③ LINE 側の inflow-route を導線ごとに新規発行する（連携完了数は LINE 側でしか取れず、既存IDを共有すると区別不能。現状フッター/サンクス/SNSカードが同一ID）',
                ],
            },
            { type: 'subheading', text: 'キャンペーン別の実測（30日セッション / 登録CV。AI 向け詳細）', audience: 'kb' },
            {
                type: 'list',
                audience: 'kb',
                items: [
                    '自社通知（product）: line/job_description（おすすめ求人→詳細 681）・line/entry_form（46）・email/lp_thanks（257・発行元コード未特定）・email/signup_complete（ウェルカム 101）・email/application_complete（応募完了メールのおすすめ求人 30）・email/signup_step_day{1,3,7,14,30}（会員登録ステップメール 計94・2026-10リリース）・email/keep_remider_{1st|2nd|3rd}（キープリマインド 計163）・sms/scout_{scoutId}（本体スカウト通知SMS 1,386・2026-09に sms/scout から改名）',
                    'LINE公式（line/social・LINE側設定）: survey_thanks_scout（サーベイ完了→スカウト誘導 333/68=20.4%と突出）・richmenu_member_jobsearch（571/2）・richmenu_all_jobsearch（479/22=4.6%）・richmenu_member_scoutcheck（279/0）・richmenu_seibi_jobsearch（62/1）・richmenu_all_registration（47/5=10.6%）',
                    'スカウト一斉配信（最大ボリューム・会員登録目的でないため登録CVほぼ0）: scout/sms/at_agent_fee_media_{求人ID}_{日付}_{セグメント}＋at_agent_media_{ID}_fee_{日付}_{セグメント}（人材紹介 101,364）・scout/sms/agent_media_{ID}_{日付}_{配信時刻}（at_なし系統 5,399。at_agent絞りから漏れる・800=朝/1700=夕）・scout|crm_scout/sms/media_{ID}_{日付}（少量系統 196）・crm_scout/sms/at_direct_{日付}_{県}_{職種}_media_{ID}[_groupa|_groupb|_age4555]（求人広告 2,566・utm_content が文面AB）。medium=email のスカウトメールも配信（scout/email 5,528・crm_scout/email 1,795）。campaign 粒度は数万種→接頭辞（at_agent / agent_media / media_ / at_direct）で束ねる',
                    '広告: google/yahoo cpc（約450）・facebook cpm（240・content=クリエイティブID / term=広告セットID）・Kbox cpc（求人ボックス有料枠 48・content=Kbox_agent_media_{求人ID} で求人単位CPAが出せる）・youtube influencer（33）',
                    '非UTM: (direct) 42,153 séss / LP応募 28,240 / 登録 731（LP応募と登録CVの最大源）・organic 37,883・google_jobs_apply（Googleしごと検索 1,146 / 応募19）・referral 約3,500（SF管理画面 / 求人ボックス.com / docomo / uber 等）・chatgpt.com ai-assistant 59（新興チャネル）',
                    'サイト内リンクUTM（コードに実在するが GA4 に出ない）: xwork/referral/xwork_footer_*・xwork_sidebar_*・kyuyo_240606・special_uber-taxi・top_magazine_241107、thanks/referral/thankspage_banner_0228・_popupbanner_0228',
                ],
            },
        ],
    },
    {
        id: 'data-platform',
        title: 'データ基盤',
        blocks: [
            {
                type: 'table',
                columns: ['システム', '内容'],
                rows: [
                    ['DynamoDB（本体AWS 662907192686・読み取り専用で参照）', 'JobApplication-prd（会員応募。source が featured_* / scout_* / ca_referral / null=自然、jobDescription に contractType 埋め込み）/ GuestJobApplication-prd（ゲスト応募。articleId で JobDescriptions-prd と突合）/ JobDescriptions-prd（求人マスタ。pk=media_ID, sk=\'info\'、contractType）/ MemberUsers-prd（会員。応募との時刻差10分以内で「応募と同時の登録」判定）/ ScoutHistories-prd（スカウト。pk=CANDIDATE#… の履歴と pk=SCOUT#{scoutId} のページ用データが同居）/ DeliveryRecords・SignupStepMails（通知基盤の送達記録・ステップメール予定）'],
                    ['Salesforce', 'Matching__c（紹介の応募・成約管理。種別=Field65__c）/ Order__c（求人）/ CustomObject1__c（求職者。約134万件。属性: 年齢層Field90__c・性別Field13__c・**登録サービス=事業領域Field5__c**・希望職種DesiredOccupation__c・転職時期Field27__c・仕事の状況Field29__c）/ RegistHistory__c（登録履歴）/ AgentActivityHistory__c（CA活動履歴。CV単価の算出基準）。応募→SF連携はZapier経由（停止事故歴あり・死活監視推奨）'],
                    ['BigQuery（xmile-drm に一元化・2026-09-25）', 'ga4_analytics_dashboard（このダッシュボードの実行履歴・AB結果・AI最終レポート蓄積。テーブル定義は lib/bq/schemas.ts）/ analytics_534098180（GA4 BigQuery Export の生イベント、2026-08-06〜。セッション単位の経路分析はこちら）/ xwork（プロダクトデータ。ses_event_records など）'],
                    ['x-work.jp本体', 'Amplify Hosting（appId d3egkdlj4m310n）。アクセスログは generate-access-logs で取得可能。ソースは drm-front リポジトリ'],
                ],
            },
        ],
    },
    {
        id: 'incidents',
        title: '過去の重要インシデント（数字を読む前提知識）',
        blocks: [
            {
                type: 'list',
                items: [
                    '**2026-06/16〜26 シンガポールbot**: Tencent Cloud SG（ACEVILLE PTE.LTD.）の分散スクレイパーが約28万セッション（日本とほぼ同規模）。CV影響ゼロ。対策として全GA4クエリに国=日本フィルタ導入済み（docs/archive/bot-traffic-analysis-2026-07-13.md）',
                    '**2026-07 応募→Salesforce連携（Zapier）の断続停止**: 新規応募者でOwner Id空→クラッシュ→自動停止が頻発し、「自然応募が急減」に見えるデータ欠落が発生。修正済み。SFの応募数を見るときは連携欠落の可能性を疑うこと',
                    '**2026-08-11〜08下旬 Unassignedインシデント（収束済み）**: 一時セッションの40%超がsource欠落の孤児セッション化（session_startなしでカスタムイベントのみ到達、GTM変更疑い）。8月下旬以降は Unassigned 比率が週次0.8〜1.1%の平常水準に戻っている。**8/11〜8月下旬のチャネル別数値・セッション数は依然として信頼不可**（セッション分裂で過大計上・セッション分母CVRは過小）',
                    '**2026-08-13 社内IPの内部トラフィック除外を有効化**: 分析用プロパティ（534098180）にESS・LCD・中野坂上の5 IPを登録しデータフィルタを有効化（それまで社内アクセス＝ページ閲覧の約2%が計測に混入）。**この日以降PVは約2%減・CVRは微増して見える**（前後比較時は注意）',
                    '**2026-09-25〜 米仏の headless Chrome bot**: BigQuery 経路は GA4_EXPORT_DEFAULT_FILTER で除外。新しいBQクエリにも必ず付ける',
                ],
            },
        ],
    },
]

// ── Markdown 生成（AI Q&A の知識ベース用） ──

/** 文中の [text](href) を「text（href）」に。太字・コードはそのまま Markdown として残す */
function inlineToMarkdown(text: string): string {
    return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, href: string) => (href.startsWith('/') ? `${label}（${href}）` : `${label}（${href}）`))
}

export function domainKnowledgeToMarkdown(): string {
    const parts: string[] = ['# クロスワーク（x-work.jp）ドメイン知識']
    for (const section of DOMAIN_SECTIONS) {
        parts.push(`\n## ${section.title}`)
        for (const block of section.blocks) {
            if ('audience' in block && block.audience === 'glossary') continue
            switch (block.type) {
                case 'paragraph':
                    parts.push(inlineToMarkdown(block.text))
                    break
                case 'subheading':
                    parts.push(`### ${block.text}`)
                    break
                case 'list':
                    parts.push(block.items.map((i) => `- ${inlineToMarkdown(i)}`).join('\n'))
                    break
                case 'table':
                    parts.push(block.rows.map((row) => `- ${row.map((cell, i) => (block.columns[i] ? `${block.columns[i]}: ${inlineToMarkdown(cell)}` : inlineToMarkdown(cell))).filter(Boolean).join(' / ')}`).join('\n'))
                    break
                case 'component':
                    parts.push(block.kbText)
                    break
            }
        }
    }
    return parts.join('\n')
}
