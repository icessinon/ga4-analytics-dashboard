'use client'

import Link from 'next/link'
import BackLink from '@/components/BackLink'
import DocsAsk from '@/components/docs/DocsAsk'
import { CV_UNIT_DERIVATIONS, CV_UNIT_VALUE_ASOF, formatYenApprox } from '@/lib/constants/cvUnitValue'
import styles from './GlossaryPage.module.css'

/**
 * x-work.jp（クロスワーク）のドメイン用語・計測仕様のリファレンス。
 * 2026-07 の一連の調査（bot対策・応募計測検証・DB突合）で確定した内容を集約。
 */

// CV単価は lib/constants/cvUnitValue.ts（ソース・オブ・トゥルース）から算出表示。定数を更新すれば表も自動追従する。
const fmtUnitYen = (yen: number) => (yen >= 10000 ? `約${(yen / 10000).toFixed(1)}万円` : `約${yen.toLocaleString()}円`)
// 単価cellに付ける補足（売上主体など。数値でないドメイン注記のみ）
const CV_UNIT_ROW_NOTE: Record<string, string> = {
    JobA: '売上主体はCAの人材紹介再マッチ・掲載課金は別',
    JobH: 'HW自体は手数料ゼロ・売上主体はCAの人材紹介再マッチ',
}

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

            <Section title="CV単価（期待売上換算）">
                <p className={styles.note}>
                    <strong>CV単価 ＝ そのCVをした人たちが最終的に生んだ確定売上 ÷ CV件数 ＝ 成約率 × 平均紹介手数料</strong>。
                    決め事や理論値ではなく、Salesforceの過去実績からの逆算値です。算出は
                    <strong>登録履歴(RegistHistory__c) → そのCVのCA活動履歴(AgentActivityHistory__c) → 紐づくマッチングのうち「7.入社済」の受注額−返金想定額 ÷ CV件数</strong>。
                    求職者単位で全マッチングを合算せず（過大評価）、応募求人だけにも絞らない（CAが別求人＝特に人材紹介案件へ再マッチして生んだ成約を取りこぼす）<strong>CA活動履歴基準</strong>の中庸。
                    ダッシュボードの金額表示（<Link href="/cv-value" className={styles.subLink}>CV単価・お金まわり</Link>、求人種別CV分析、会員登録ファネル）はすべてこの係数を使っています。
                </p>
                <table className={styles.table}>
                    <thead><tr><th>CV種別</th><th>成約率</th><th>平均手数料（純額）</th><th>単価</th></tr></thead>
                    <tbody>
                        {CV_UNIT_DERIVATIONS.map((d) => {
                            const rate = d.events > 0 ? (d.hires / d.events) * 100 : 0
                            const netFeePerHire = d.hires > 0 ? (d.grossFeeYen - d.refundYen) / d.hires : 0
                            const rowNote = CV_UNIT_ROW_NOTE[d.key]
                            return (
                                <tr key={d.key}>
                                    <td>{d.label}</td>
                                    <td>{rate.toFixed(1)}% /件</td>
                                    <td>{formatYenApprox(netFeePerHire)}</td>
                                    <td><strong>{fmtUnitYen(d.unitYen)}</strong>（¥{d.unitYen.toLocaleString()}{rowNote ? `。${rowNote}` : ''}）</td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
                <p className={styles.note}>
                    <strong>読み方の注意（誤読しやすいポイント）</strong>: これは期待値（平均）であり、個々のCVに値札がつくわけではない。
                    例えば登録100件のうち約98件は売上ゼロで、2件強が約89万円の成約を生む——均すと1件約2.0万円。
                    正しい使い方は「登録を月100件増やす施策 ＝ 月約200万円の売上増と同等の価値」のように<strong>件数×単価で施策同士を比較する</strong>こと。
                    会員登録がハロワ応募の約2.3倍なのは主に<strong>成約率の差</strong>（登録者は架電→面談→CA提案のエンジンに乗り、featured配信対象にもなる。
                    ハロワ応募者はゲストのまま会員化されない）。
                    応募3種別（JobR/JobA/JobH）は<strong>同一入社の二重計上を除去済み</strong>（優先度 人材紹介＞求人広告＞ハローワーク）。会員登録は「登録の下流価値」指標のため応募との重複を許容し据え置き（＝応募と合算しない前提。¥19,760＝純登録¥13,650＋下流価値¥6,110）。
                </p>
                <p className={styles.note}>
                    <strong>参考: 事業全体の平均手数料は約100万円/件</strong>（直近12ヶ月の入社済、月400〜600件。95万→105万円と緩やかな上昇傾向。2026-08時点）。
                    Web経由CVコホートの平均（81万〜98万円）が全体よりやや低いのは、DRスカウト・エージェント経由など高単価領域の成約が全体には含まれるため。
                    単価を再算出するときは<strong>成約率とこの手数料相場の両方</strong>が動いていないかを確認する。
                </p>
                <p className={styles.note}>
                    <strong>前提と更新ルール</strong>: 受注額ベース（検収・入金ベースではない）。コホートは登録日2025-01〜2025-12（会員登録のみ2025-08〜2025-12）で、成約リードタイム確保のため直近2ヶ月のCVは除外して算出。
                    内定・内定承諾のパイプラインは分子に含めない保守的な値。市況・CA運用・手数料相場で動くため<strong>四半期に1回程度の再算出を推奨</strong>。
                    係数の実体は lib/constants/cvUnitValue.ts（算出根拠コメントつき）で、ここを更新すればこの表も含め全ページに自動反映される（<strong>{CV_UNIT_VALUE_ASOF}算出・CA活動履歴基準</strong>）。
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
                    <li>
                        全タグの仕様・実装状況は
                        <a href="https://docs.google.com/spreadsheets/d/1MloagdIuwrm5yK_cUZ7aO6e9j6sH6oFgcCXD45woVn4/edit" target="_blank" rel="noreferrer" className={styles.extLink}>GTMタグ管理台帳（スプレッドシート）</a>
                        が正。483タグ定義があり、未対応・対応中のタグも多い（欲しいラベルが無いときはまず台帳を確認）
                    </li>
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

            <Section title="UTM命名規則（配信・流入元の計測）">
                <p className={styles.note}>
                    UTM（utm_source / utm_medium / utm_campaign）別に数字を見るときに、各値が「どの施策のリンクか」を引くための一覧。
                    送信側に共通ビルダーは無く各施策がバラバラに発行しているため、実コード(drm-front)とGA4 BQの実流入（collected_traffic_source）で突合した結果を集約している。
                    完全版は <code>docs/utm-naming-convention.md</code>。数値は2026-08-07〜08-30・国=日本・24日間のセッション/会員登録CV。
                </p>
                <p className={styles.note}>
                    <strong>最重要の読み分け</strong>: UTMには2種類ある。①<strong>流入UTM</strong>（メール/LINE/SMS通知・広告など外部→サイト）＝<strong>GA4のセッション帰属に計上され、UTM別の数字が見れる</strong>。
                    ②<strong>サイト内リンクUTM</strong>（フッター/サイドバー/バナー/LP誘導ボタン）＝GA4はUTMをセッション開始時のみ読むため<strong>ほぼ計上されない</strong>（既存セッションは元sourceを保持）。
                    裏取り: <code>utm_source=xwork</code> / <code>thanks</code> のセッションは24日間で0件。フッター等のUTMはリンククリック計測・リンク先/Salesforce識別が目的で、流入計測用ではない。
                </p>
                <h3 className={styles.subTitle}>共通則</h3>
                <ul className={styles.list}>
                    <li><code>utm_source</code>=発信元: product(自社通知) / line(LINE公式) / ca(CA配信) / scout・crm_scout(スカウトSMS) / xwork(サイト内) / thanks(サンクス) / google・yahoo・facebook(広告) / youtube(インフルエンサー)</li>
                    <li><code>utm_medium</code>=チャネル: email / line / social / sms / referral / cpc / cpm / influencer</li>
                    <li><code>utm_campaign</code>=施策名</li>
                </ul>
                <h3 className={styles.subTitle}>自社プロダクト通知（utm_source=product）</h3>
                <table className={styles.table}>
                    <thead><tr><th>施策</th><th>medium / campaign</th><th>実測 séss/登録CV</th></tr></thead>
                    <tbody>
                        <tr><td>おすすめ求人LINE（→詳細）</td><td>line / job_description</td><td>449 / 0</td></tr>
                        <tr><td>おすすめ求人LINE（→応募フォーム）</td><td>line / entry_form</td><td>24 / 0</td></tr>
                        <tr><td>LP応募サンクス系メール</td><td>email / lp_thanks</td><td>196 / 5</td></tr>
                        <tr><td>会員登録完了メール（ウェルカム）</td><td>email / signup_complete</td><td>54 / 5</td></tr>
                        <tr><td>キープ求人リマインド 1/2/3通目</td><td>email / <strong>keep_remider</strong>_&#123;1st|2nd|3rd&#125; ⚠️タイポ</td><td>37 / 22（2ndは閾値未満）</td></tr>
                    </tbody>
                </table>
                <p className={styles.note}>⚠️ <code>keep_remider</code> は <code>keep_reminder</code> のタイポ（n欠落・Reminder.ts:48-50）。実データにもタイポのまま流入している。<code>lp_thanks</code> は発行元コードが未特定（配信基盤側の可能性・要追跡）。</p>
                <h3 className={styles.subTitle}>LINE公式アカウント（source=line / medium=social）※drm-front外・LINE側設定</h3>
                <table className={styles.table}>
                    <thead><tr><th>campaign</th><th>実測 séss / 登録CV / CVR</th></tr></thead>
                    <tbody>
                        <tr><td>survey_thanks_scout（サーベイ完了→スカウト誘導）</td><td><strong>227 / 95 / 41.9% ★突出</strong></td></tr>
                        <tr><td>richmenu_all_jobsearch</td><td>405 / 17 / 4.2%</td></tr>
                        <tr><td>richmenu_all_registration</td><td>27 / 3 / 11.1%</td></tr>
                        <tr><td>richmenu_member_jobsearch / _scoutcheck</td><td>265 / 4、172 / 3</td></tr>
                    </tbody>
                </table>
                <h3 className={styles.subTitle}>スカウトSMS（マーケ配信・最大ボリューム 25,648séss）</h3>
                <ul className={styles.list}>
                    <li><code>scout</code> / sms / <code>at_agent_fee_media_&#123;求人ID&#125;_&#123;日付&#125;_&#123;セグメント&#125;</code>＝人材紹介スカウト（24,890séss/6CV）</li>
                    <li><code>crm_scout</code> / sms / <code>at_direct_&#123;日付&#125;_&#123;都道府県&#125;_&#123;職種&#125;_media_&#123;ID&#125;</code>＝求人広告スカウト（758séss/0CV）</li>
                    <li>求職者を求人詳細/スカウトページへ送客（会員登録目的でない）ため登録CVはほぼ0。campaign粒度は数百種→<strong>接頭辞(at_agent/at_direct)で束ねて見る</strong></li>
                </ul>
                <h3 className={styles.subTitle}>その他の流入・非UTM</h3>
                <ul className={styles.list}>
                    <li>広告: google/yahoo <code>cpc</code>（google-m-CP…）、facebook <code>cpm</code>、youtube <code>influencer</code></li>
                    <li>CA配信: <code>ca/line/job_propose_202412</code>（67séss）</li>
                    <li>非UTM: (direct)41,508séss/620CV（登録CV最大源）、organic約23,000、referral（SF管理画面/access.line.me等）、<strong>AIアシスタント（chatgpt.com・新興チャネル）</strong></li>
                </ul>
                <p className={styles.note}>
                    <strong>ダッシュボードで見る</strong>: UTM別（source×medium×campaign）の集計は <Link href="/utm-report" className={styles.subLink}>UTM別レポート</Link>（各UTMの意味・発行タイミング注記つき）。ほかに LINE専用の <Link href="/line-report" className={styles.subLink}>LINEレポート</Link>、チャネルグループ別の <Link href="/cv-types" className={styles.subLink}>求人種別CV分析</Link>。生データの再取得はBQ集計スクリプト（scripts/tmp-utm-inventory.ts）。
                </p>
            </Section>

            <Section title="データ基盤">
                <table className={styles.table}>
                    <thead><tr><th>システム</th><th>内容</th></tr></thead>
                    <tbody>
                        <tr><td>DynamoDB（本体AWS 662907192686）</td><td>JobApplication-prd（会員応募）/ GuestJobApplication-prd（ゲスト応募、articleIdのみ）/ JobDescriptions-prd（求人。pk=media_id, sk=&apos;info&apos;、contractType保持）</td></tr>
                        <tr><td>Salesforce</td><td>Matching__c（紹介の応募・成約管理。種別=Field65__c）/ Order__c（求人）/ CustomObject1__c（求職者。約130万件。属性: 年齢層Field90__c・性別Field13__c・<strong>登録サービス=事業領域Field5__c</strong>・希望職種DesiredOccupation__c・転職時期Field27__c・仕事の状況Field29__c）。応募→SF連携はZapier経由（停止事故歴あり・死活監視推奨）</td></tr>
                        <tr><td>BigQuery</td><td>hrs-div.ga4_analytics_dashboard（このダッシュボードの実行履歴・AB結果・AI最終レポート蓄積）</td></tr>
                        <tr><td>x-work.jp本体</td><td>Amplify Hosting（appId d3egkdlj4m310n）。アクセスログは generate-access-logs で取得可能。ソースは drm-front リポジトリ</td></tr>
                    </tbody>
                </table>
                <p className={styles.note}>
                    <strong>求職者属性でペルソナを見るときの注意（事業領域 vs 希望職種）</strong>: 登録者の職種軸は
                    <strong>登録サービス(Field5__c＝事業領域)を使う</strong>。全130万件に付与され、<strong>ドライバーが最大（約83万人）</strong>。
                    一方 <strong>希望職種(DesiredOccupation__c) は約2万件しか埋まっておらず施工・製造系に偏り、ドライバー系の値が構造的に存在しない</strong>ため、これで全体像を見るとドライバーが丸ごと消える。
                    また<strong>性別(Field13__c)は63%しか付与されていない</strong>（ドライバーは約56%）ので女性比は回答者の部分集合上の値。属性の可視化は
                    <Link href="/persona" className={styles.subLink}>求職者属性・ペルソナ</Link>（スナップショット lib/constants/personaSnapshot.ts）。
                </p>
            </Section>

            <Section title="過去の重要インシデント（数字を読む前提知識）">
                <ul className={styles.list}>
                    <li><strong>2026-06/16〜26 シンガポールbot</strong>: Tencent Cloud SG（ACEVILLE PTE.LTD.）の分散スクレイパーが約28万セッション（日本とほぼ同規模）。CV影響ゼロ。対策として全GA4クエリに国=日本フィルタ導入済み（docs/bot-traffic-analysis-2026-07-13.md）</li>
                    <li><strong>2026-07 応募→Salesforce連携（Zapier）の断続停止</strong>: 新規応募者でOwner Id空→クラッシュ→自動停止が頻発し、「自然応募が急減」に見えるデータ欠落が発生。修正済み。SFの応募数を見るときは連携欠落の可能性を疑うこと</li>
                    <li><strong>GA4のトラフィックデータは2026-05以降のみ</strong>。キーイベント未設定のため、CVはすべてページ/ラベルベースで計測</li>
                    <li><strong>2026-08-11〜 Unassignedインシデント（調査中）</strong>: セッションの40%超がsource欠落の孤児セッション化（session_startなしでカスタムイベントのみ到達）。GTM変更疑い。解決までチャネル別数値・セッション数は信頼不可</li>
                    <li><strong>2026-08-13 社内IPの内部トラフィック除外を有効化</strong>: 分析用プロパティ（534098180）にESS・LCD・中野坂上の5 IPを登録しデータフィルタを有効化（それまで社内アクセス＝ページ閲覧の約2%が計測に混入）。マーケ側（351088797）も既存「東京（ESS）」ルールに5 IPを追加。<strong>この日以降PVは約2%減・CVRは微増して見える</strong>（前後比較時は注意）</li>
                </ul>
            </Section>

            <div className={styles.footer}>
                <BackLink href="/">ダッシュボードに戻る</BackLink>
            </div>
        </div>
    )
}
