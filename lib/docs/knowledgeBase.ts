import { FEATURE_LIST } from '@/app/docs/features/featureList'
import { API_LIST } from '@/app/docs/api/apiList'

/**
 * ドキュメントQ&A用の知識ベースを組み立てる。
 * 機能・APIドキュメントはデータからそのまま生成し、ドメイン知識は下の要約を使う。
 * 注: ドメイン知識を更新したら app/docs/glossary/page.tsx と内容を揃えること。
 */

const DOMAIN_KNOWLEDGE = `
# クロスワーク（x-work.jp）ドメイン知識

## 事業・用語
- クロスワーク = x-work.jp。現場系職種特化の求人転職プラットフォーム
- Direct（求人広告事業）: 企業が広告として直接掲載。応募後は企業と直接やりとり
- HRS（人材紹介事業）: キャリアアドバイザー（CA）が間に入る紹介事業。成約時に紹介手数料。領域別にDRS=ドライバー、CRS=建設、MRS=製造、SRS=警備系
- Featured: CRM（スカウトSMS・メール・LINE）経由の既存ユーザー向け特設ページ（/featured）。配信対象は人材紹介求人のみ
- Matching: Salesforceのオブジェクト。人材紹介の応募1件=1レコード。種別フィールドに「自然応募」等の経路区分あり

## 求人の契約種別（contractType）
- 求人広告: CTA「応募する」、会員登録必須（応募時自動作成）、収益=掲載料、GTMラベル JobA
- 人材紹介: CTA「話を聞いてみる」、ゲスト応募可、収益=紹介手数料、GTMラベル JobR、スカウト配信の主対象
- ハローワーク: 転載求人。CTA「話を聞いてみる」、ゲスト応募可、GTMラベル JobH、スカウト配信なし
- 求人詳細URL（/{industry}/media_{id}）・応募フォーム（/entry/media_{id}）・サンクス（/entry/thanks）は3種共通。URLでは種別判別不可、GTMラベルで分解する

## CVの定義
- 応募CV: /entry/thanks 到達ユーザー（3種混在）
- LP応募CV: /lp-thanks/{slug} 到達（広告LP経由の人材紹介リード。slug=drs/crs/mrs/mrs_maker/srs/food）
- 会員登録CV: /members/signup/thanks 到達（?occ=職種 で職種分解可能。求人広告応募時の自動会員化は含まれない）
- 種別別応募完了: 送信ボタンのクリックラベル（EF__JobX__Btn__応募する/話を聞いてみる）。入力完了までボタンdisabledのため「クリック=応募実行」。DynamoDB実応募数と一致検証済み・bot耐性あり
- 応募のレイヤー: ①サイト内フォーム（ダッシュボードで計測）②featured/スカウト経由（別フォーム・ラベル未実装で計測外）③CA代理・電話応募（Web外）
- 応募ソース（JobApplicationSource）: null=自然応募、featured_apply/featured_inquiry/featured_one_click_*=スカウト特設経由、scout_apply/scout_inquiry=scoutId付きentry応募、ca_referral=CA紹介

## URL構造
- 大職種スラッグ14種: driver, sekokan, sekkei, soko, shokunin, seibi, hoshu, setsubi-sagyo, keibi, unkan, kojo-sagyo, food, unyu-sagyo, others
- /{industry}/{sub} = サブ職種または都道府県（例: /driver/taxi、/driver/tokyo）
- /{industry}/media_{id} = 求人詳細、/entry/media_{id}→/entry/thanks = 応募、/members/signup→thanks = 会員登録、/lp_{slug}→/lp-thanks/{slug} = 広告LP応募

## GTM/GA4の二重構成（数字の食い違い調査の必須知識）
- 分析用: GTM-TG9PR444 → GA4プロパティ 534098180（このダッシュボードが参照）。イベント=data_click_label/data_view_label/time_on_page、カスタムディメンション=click_label/view_label等
- マーケ用: GTM-W7NPT5M → 別アカウントのGA4「X-Work - GA4」351088797ほか。page_view/view_job_details_page/契約種別ディメンション等。広告タグ（Criteo・LINE Tag等）も同居
- 両者の数字は定義が違うため一致しない（イベント発火vs要素視認、国フィルタ有無、featured計測有無）
- ラベル規則: {Area}__{Section}__{Element}__{Label}。Area: CT=トップ系、SU=会員登録、EF=エントリーフォーム、MW=検索モーダル、HD=ヘッダー、FL=フローティング、FT=フッター、DL=求人詳細
- 全タグの仕様・実装状況は「GTMタグ管理台帳」スプレッドシートが正（483タグ定義、未対応・対応中も多い）: https://docs.google.com/spreadsheets/d/1MloagdIuwrm5yK_cUZ7aO6e9j6sH6oFgcCXD45woVn4/edit
- view_label は要素50%×1秒表示で発火 → 15〜20%取りこぼす。click_labelはbot耐性あり
- ダッシュボードの全GA4集計はデフォルトで国=日本フィルタ（bot対策）。国別分析のみ除外
- ABテストB/C/D側ラベルは末尾サフィックス（例: __B-1618）

## データ基盤
- DynamoDB: JobApplication-prd（会員応募）/ GuestJobApplication-prd（ゲスト応募）/ JobDescriptions-prd（求人、contractType保持）
- Salesforce: Matching__c（紹介応募・成約）、Order__c（求人）。応募→SF連携はZapier（停止事故歴あり）
- BigQuery: hrs-div.ga4_analytics_dashboard（実行履歴・AB結果・AI最終レポート蓄積）
- x-work.jp本体はAmplify Hosting。ソースはdrm-frontリポジトリ

## 重要インシデント
- 2026-06/16〜26: Tencent Cloud SG（ACEVILLE PTE.LTD.）の分散スクレイパーが約28万セッション発生（CV影響ゼロ）。対策=国フィルタ
- 2026-07: 応募→Salesforce連携（Zapier）が断続停止し「自然応募急減」に見えるデータ欠落が発生（修正済み）
- GA4のトラフィックデータは2026-05以降のみ。キーイベント未設定でCVはページ/ラベルベース
`

export function buildKnowledgeBase(): string {
    const features = FEATURE_LIST.map((f) => {
        const lines = [
            `### ${f.name}${f.href ? `（${f.href}）` : '（UIページなし）'}`,
            f.description,
            `できること: ${f.capabilities.join(' / ')}`,
        ]
        if (f.apiRoute) lines.push(`API: ${f.apiRoute}`)
        return lines.join('\n')
    }).join('\n\n')

    const apis = API_LIST.map((cat) =>
        `## ${cat.category}\n` + cat.endpoints.map((e) =>
            `- ${e.method} ${e.path}（${e.name}）: ${e.description}`
        ).join('\n')
    ).join('\n\n')

    return `# ダッシュボード機能一覧\n\n${features}\n\n# APIエンドポイント一覧\n\n${apis}\n\n${DOMAIN_KNOWLEDGE}`
}
