'use client'

import Link from 'next/link'
import BackLink from '@/components/BackLink'
import DocsAsk from '@/components/docs/DocsAsk'
import styles from './GlossaryPage.module.css'

/**
 * x-work.jp（クロスワーク）のドメイン用語・計測仕様のリファレンス。
 * 2026-07 の一連の調査（bot対策・応募計測検証・DB突合）で確定した内容を集約。
 */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{title}</h2>
            {children}
        </section>
    )
}

export default function GlossaryPage() {
    return (
        <div className={styles.wrapper}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>用語・ドメイン知識</h1>
                    <p className={styles.lead}>
                        クロスワーク（x-work.jp）の事業用語・CV定義・GTM/GA4計測仕様・データ基盤のリファレンスです。
                        数字の食い違いを調査するときは、まず「どのプロパティ・どのラベル基準の数字か」をこのページで確認してください。
                    </p>
                </div>
                <div className={styles.headerLinks}>
                    <Link href="/docs/features" className={styles.subLink}>機能ドキュメント →</Link>
                    <BackLink href="/">ダッシュボードに戻る</BackLink>
                </div>
            </div>

            <DocsAsk />

            <Section title="事業・サービス用語">
                <table className={styles.table}>
                    <thead><tr><th>用語</th><th>意味</th></tr></thead>
                    <tbody>
                        <tr><td>クロスワーク</td><td>x-work.jp。ドライバー・建設・製造等の現場系職種に特化した求人転職プラットフォーム</td></tr>
                        <tr><td>Direct（求人広告事業）</td><td>企業がクロスワークに広告として直接掲載する求人事業。応募後は求職者と企業が直接やりとり</td></tr>
                        <tr><td>HRS（人材紹介事業）</td><td>キャリアアドバイザー（CA）が間に入る紹介事業の総称。成約時に企業から紹介手数料を得る</td></tr>
                        <tr><td>DRS / CRS / MRS / SRS</td><td>人材紹介の領域別ブランド: DRS=ドライバー、CRS=建設、MRS=製造、SRS=警備系。LP応募サンクス（/lp-thanks/drs 等）のslugに対応</td></tr>
                        <tr><td>Featured</td><td>CRM（スカウトSMS・メール・LINE）経由の既存ユーザー向け特設ページ（/featured）。<strong>配信対象は人材紹介求人のみ</strong>（求人広告・ハロワのfeatured応募は実データ上ゼロ）</td></tr>
                        <tr><td>Matching</td><td>Salesforce上のオブジェクト（Matching__c）。人材紹介の応募1件ごとに1レコード作成される</td></tr>
                        <tr><td>CA</td><td>キャリアアドバイザー。求職者との面談・求人提案・選考支援を行う</td></tr>
                    </tbody>
                </table>
            </Section>

            <Section title="求人の契約種別（contractType）">
                <table className={styles.table}>
                    <thead><tr><th></th><th>求人広告</th><th>人材紹介</th><th>ハローワーク</th></tr></thead>
                    <tbody>
                        <tr><td>掲載元</td><td>企業が直接掲載</td><td>自社の紹介事業</td><td>ハローワーク求人の転載</td></tr>
                        <tr><td>CTAボタン</td><td>「応募する」</td><td>「話を聞いてみる」</td><td>「話を聞いてみる」</td></tr>
                        <tr><td>会員登録</td><td>必須（応募時に自動作成）</td><td>不要（ゲスト応募可）</td><td>不要（ゲスト応募可）</td></tr>
                        <tr><td>応募後</td><td>企業と直接選考</td><td>CA面談→紹介</td><td>CA経由（紹介扱い）</td></tr>
                        <tr><td>収益</td><td>掲載料</td><td>成約時の紹介手数料</td><td>（紹介への送客）</td></tr>
                        <tr><td>GTMラベル</td><td>JobA / ThxJobA</td><td>JobR / ThxJobR</td><td>JobH / ThxJobH</td></tr>
                        <tr><td>スカウト配信</td><td>ほぼなし</td><td><strong>あり（配信の主対象）</strong></td><td>なし</td></tr>
                    </tbody>
                </table>
                <p className={styles.note}>
                    求人詳細URL（/{'{industry}'}/media_{'{id}'}）・応募フォーム（/entry/media_{'{id}'}）・サンクス（/entry/thanks）は
                    <strong>3種とも共通</strong>のため、URLだけでは種別を判別できない。分解にはGTMラベル（JobA/JobR/JobH）を使う。
                </p>
            </Section>

            <Section title="CVの定義（ダッシュボードの指標）">
                <table className={styles.table}>
                    <thead><tr><th>指標</th><th>計測方法</th><th>意味・注意点</th></tr></thead>
                    <tbody>
                        <tr><td>応募CV</td><td>/entry/thanks 到達ユーザー（page_view）</td><td>サイト内フォームからの応募。<strong>求人広告・人材紹介・ハロワの3種が混在</strong>（種別分解は求人種別CV分析ページで）</td></tr>
                        <tr><td>LP応募CV</td><td>/lp-thanks/{'{slug}'} 到達ユーザー</td><td>広告LP（/lp_*）経由の人材紹介リード。slugが事業領域（drs/crs/mrs/mrs_maker/srs/food）</td></tr>
                        <tr><td>会員登録CV</td><td>/members/signup/thanks 到達ユーザー</td><td>?occ=職種 パラメータで職種別に分解可能。<strong>求人広告応募時の自動会員化は含まれない</strong></td></tr>
                        <tr><td>種別別応募完了</td><td>送信ボタンのクリックラベル<br />（EF__JobX__Btn__応募する/話を聞いてみる）</td><td>ボタンは入力完了までdisabledのため「クリック=応募実行」。<strong>DynamoDB実応募数と一致確認済み</strong>・bot耐性あり（2026-07-22検証）</td></tr>
                        <tr><td>自然応募（Salesforce用語）</td><td>Matching__c の種別=自然応募</td><td>スカウト・配信・CA経由でない応募。サイト計測ではなくSF連携（Zapier）由来のため、連携停止時に欠落する事故歴あり（2026-07）</td></tr>
                    </tbody>
                </table>
                <p className={styles.note}>
                    応募の全体像はレイヤー構造: ①サイト内フォーム（ダッシュボードで計測）②featured/スカウト配信経由（別フォーム・ラベル未実装のため計測外）
                    ③CA代理登録・電話応募（Web外）。②③はDynamoDB/Salesforceにのみ存在する。
                </p>
            </Section>

            <Section title="応募ソース（JobApplicationSource）">
                <table className={styles.table}>
                    <thead><tr><th>source値</th><th>意味</th></tr></thead>
                    <tbody>
                        <tr><td>null（なし）</td><td>通常応募＝自然応募。ユーザーが自力でサイトに来て応募</td></tr>
                        <tr><td>featured_apply / featured_inquiry</td><td>スカウト特設ページ（featured）の「応募する」/「話を聞いてみる」</td></tr>
                        <tr><td>featured_one_click_apply / _inquiry</td><td>featured の1クリック応募（フォーム入力なし）</td></tr>
                        <tr><td>scout_apply / scout_inquiry</td><td>scoutId付きで通常entryフォームから応募（スカウト経由）</td></tr>
                        <tr><td>ca_referral</td><td>CA紹介（代理登録）</td></tr>
                    </tbody>
                </table>
            </Section>

            <Section title="URL構造">
                <table className={styles.table}>
                    <thead><tr><th>パターン</th><th>ページ</th></tr></thead>
                    <tbody>
                        <tr><td>/</td><td>トップページ（主要導線は検索モーダルと職種ボタン）</td></tr>
                        <tr><td>/{'{industry}'}</td><td>大職種一覧。スラッグ14種: driver, sekokan, sekkei, soko, shokunin, seibi, hoshu, setsubi-sagyo, keibi, unkan, kojo-sagyo, food, unyu-sagyo, others</td></tr>
                        <tr><td>/{'{industry}'}/{'{sub}'}</td><td>絞り込み（サブ職種 or 都道府県。例: /driver/taxi、/driver/tokyo）</td></tr>
                        <tr><td>/{'{industry}'}/media_{'{id}'}</td><td>求人詳細（契約種別3種で共通フォーマット）</td></tr>
                        <tr><td>/entry/media_{'{id}'} → /entry/thanks</td><td>応募フォーム→サンクス（3種共通）</td></tr>
                        <tr><td>/members/signup → /members/signup/thanks?occ=</td><td>会員登録フォーム→サンクス（職種パラメータ付き）</td></tr>
                        <tr><td>/lp_{'{slug}'} → /lp-thanks/{'{slug}'}</td><td>広告LP→LP応募サンクス（人材紹介リード）</td></tr>
                        <tr><td>/featured/...</td><td>スカウト特設（人材紹介のみ・GTMラベル未実装）</td></tr>
                        <tr><td>/search、/cond/license*、/journal</td><td>検索結果、資格条件、コラム</td></tr>
                        <tr><td>/manage/*、/admin/*</td><td>企業側管理・社内管理（専用GTMコンテナ）</td></tr>
                    </tbody>
                </table>
            </Section>

            <Section title="GTM / GA4 の構成（重要: 二重構成）">
                <table className={styles.table}>
                    <thead><tr><th></th><th>分析用（このダッシュボード）</th><th>マーケ用</th></tr></thead>
                    <tbody>
                        <tr><td>GTMコンテナ</td><td>GTM-TG9PR444</td><td>GTM-W7NPT5M（広告タグ・Criteo・LINE Tag等も同居）</td></tr>
                        <tr><td>GA4プロパティ</td><td>534098180（x-work.jpアカウント）</td><td>351088797「X-Work - GA4」（X-Workアカウント）ほか複数</td></tr>
                        <tr><td>主なイベント</td><td>data_click_label / data_view_label / time_on_page</td><td>page_view / view_job_details_page / page_category / contract_type_event 等</td></tr>
                        <tr><td>カスタムディメンション</td><td>click_label / view_label / click_context / data_time_label</td><td>契約種別 / page_category / job_image_presence 等</td></tr>
                    </tbody>
                </table>
                <p className={styles.note}>
                    <strong>両者の数字は定義が違うため一致しない</strong>（イベント発火 vs 要素視認、国フィルタ有無、featured計測有無）。
                    差異の詳細な検証結果は 2026-07-22 の調査で確定済み（求人種別CV分析ページの注記参照）。
                </p>
                <h3 className={styles.subTitle}>ラベル規則</h3>
                <ul className={styles.list}>
                    <li>形式: <code>{'{Area}__{Section}__{Element}__{Label}'}</code>（例: CT__Recruitment__Btn__求人を見る）</li>
                    <li>Area: CT=トップ系（※一覧ページでも使い回しあり）、SU=会員登録、EF=エントリーフォーム、MW=検索モーダル、HD=ヘッダー、FL=フローティング、FT=フッター、DL=求人詳細</li>
                    <li>種別セクション: EF__{'{JobR|JobA|JobH}'}（応募フォーム）、EF__Thx{'{JobR|JobA|JobH}'}（サンクス）、DL__Media__Area__{'{JobX}'}（詳細ページ）</li>
                    <li>ABテストのB/C/D側ラベル: 末尾に <code>__B-1618</code> のようなサフィックス（drm-frontのuseABTestが付与）</li>
                </ul>
                <h3 className={styles.subTitle}>計測の性質（数字を読むときの注意）</h3>
                <ul className={styles.list}>
                    <li><strong>view_label</strong>: 要素が50%×1秒表示で発火（ONCE_PER_ELEMENT）→ 即離脱・高速スクロールで15〜20%取りこぼす。ファネルのステップ順はユーザー数でなくStep番号順で並べる</li>
                    <li><strong>click_label</strong>: クリックで確実に発火。botの影響を受けない（botはクリックしない）</li>
                    <li><strong>ダッシュボードの全GA4集計はデフォルトで国=日本フィルタ適用</strong>（2026-06にTencent Cloud SGの分散スクレイパーが日本と同規模のセッションを発生させたため）。国別分析のみ除外可能</li>
                    <li>求人カードのタイトルリンクにはラベルなし（ボタンのみ計測）。検索結果→詳細遷移の約4割はタイトルリンク経由</li>
                </ul>
            </Section>

            <Section title="データ基盤">
                <table className={styles.table}>
                    <thead><tr><th>システム</th><th>内容</th></tr></thead>
                    <tbody>
                        <tr><td>DynamoDB（本体AWS 662907192686）</td><td>JobApplication-prd（会員応募）/ GuestJobApplication-prd（ゲスト応募、articleIdのみ）/ JobDescriptions-prd（求人。pk=media_id, sk=&apos;info&apos;、contractType保持）</td></tr>
                        <tr><td>Salesforce</td><td>Matching__c（紹介の応募・成約管理。種別=Field65__c）/ Order__c（求人）/ CustomObject1__c（求職者）。応募→SF連携はZapier経由（停止事故歴あり・死活監視推奨）</td></tr>
                        <tr><td>BigQuery</td><td>hrs-div.ga4_analytics_dashboard（このダッシュボードの実行履歴・AB結果・AI最終レポート蓄積）</td></tr>
                        <tr><td>x-work.jp本体</td><td>Amplify Hosting（appId d3egkdlj4m310n）。アクセスログは generate-access-logs で取得可能。ソースは drm-front リポジトリ</td></tr>
                    </tbody>
                </table>
            </Section>

            <Section title="過去の重要インシデント（数字を読む前提知識）">
                <ul className={styles.list}>
                    <li><strong>2026-06/16〜26 シンガポールbot</strong>: Tencent Cloud SG（ACEVILLE PTE.LTD.）の分散スクレイパーが約28万セッション（日本とほぼ同規模）。CV影響ゼロ。対策として全GA4クエリに国=日本フィルタ導入済み（docs/bot-traffic-analysis-2026-07-13.md）</li>
                    <li><strong>2026-07 応募→Salesforce連携（Zapier）の断続停止</strong>: 新規応募者でOwner Id空→クラッシュ→自動停止が頻発し、「自然応募が急減」に見えるデータ欠落が発生。修正済み。SFの応募数を見るときは連携欠落の可能性を疑うこと</li>
                    <li><strong>GA4のトラフィックデータは2026-05以降のみ</strong>。キーイベント未設定のため、CVはすべてページ/ラベルベースで計測</li>
                </ul>
            </Section>

            <div className={styles.footer}>
                <BackLink href="/">ダッシュボードに戻る</BackLink>
            </div>
        </div>
    )
}
