import { FEATURE_LIST } from '@/lib/registry'
import { BQ_TABLES } from '@/lib/bq/schemas'
import { API_LIST } from '@/lib/docs/apiList'
import { domainKnowledgeToMarkdown } from '@/lib/docs/domainKnowledge'

/**
 * ドキュメントQ&A用の知識ベースを組み立てる。
 * 機能一覧はレジストリ、API 一覧は app/api からの生成物、ドメイン知識は lib/docs/domainKnowledge.ts
 * （用語集ページと同じデータ）から作るので、ここに手で文章を足す必要はない。
 */

// データスキーマ（BQはコード上のテーブル定義から自動生成し、実装と常に同期させる）
function buildSchemaSection(): string {
    const bqTables = Object.entries(BQ_TABLES).map(([tableId, fields]) => {
        const cols = (fields as ReadonlyArray<{ name: string; type: string; mode?: string }>)
            .map((f) => `${f.name}:${f.type}${f.mode === 'REQUIRED' ? '(必須)' : ''}`)
            .join(', ')
        return `- ${tableId}: ${cols}`
    }).join('\n')

    return `# データスキーマ

## BigQuery（プロジェクト xmile-drm / データセット ga4_analytics_dashboard）
ダッシュボードが書き込むログ蓄積用。GA4の生イベントは別データセット xmile-drm.analytics_534098180（2026-08-06〜、GA4 BigQuery Export）にあり、セッション単位の経路分析はそちらを使う。集計値はGA4 Data API経由でも取得する。
テーブルとカラム（コード上の定義 lib/bq/schemas.ts と同期）:
${bqTables}

## GA4（分析用プロパティ 534098180）
- 計測経路: GTM-TG9PR444（分析用コンテナ）→ このプロパティ。マーケ用GTM-W7NPT5Mは別プロパティ351088797（本ダッシュボード対象外）
- カスタムディメンション（イベントスコープ）: customEvent:click_label（クリックラベル。data_click_labelイベント）/ customEvent:view_label（視認ラベル。50%×1秒表示条件）/ customEvent:click_context / customEvent:data_time_label / customEvent:scout_id / customEvent:company_id（スカウト閲覧イベント用・2026-07追加）
- 主要カスタムイベント: data_click_label（クリック）、data_view_label（視認）、view_scout_featured_page（スカウトページ閲覧・scout_id/company_idパラメータ付き）
- ラベル命名規則: {Area}__{Section}__{Element}__{Label}（例 EF__JobA__Btn__応募する）。ABテストのB/C/D案は末尾に __B-{イシュー番号} サフィックス
- 標準ディメンションの主な用途: pagePath（クエリなし）/ pageLocation（フルURL。userId=やutm_source=smsの判別に使用）/ pageReferrer（直前ページ近似）/ sessionDefaultChannelGroup（チャネル）
- 注意: 全レポートにデフォルトで country=Japan フィルタ適用（bot対策）。ビューラベルは視認条件で1〜2割少なく出る。トラフィックデータは2026-05以降のみ

## 本体DynamoDB（読み取り専用で参照。クロスワーク本番データ）
- JobApplication-prd: 会員応募。pk, createdAt, userId, source（featured_*/scout_*/ca_referral/null=自然）, jobDescription（求人情報埋め込み。contractTypeで種別判定）, utm
- GuestJobApplication-prd: ゲスト応募（人材紹介/ハローワーク）。articleId（JobDescriptions-prdとの突合で種別判定）, source
- JobDescriptions-prd: 求人マスタ。pk=media_ID, sk='info', contractType（人材紹介/求人広告/ハローワーク）
- MemberUsers-prd: 会員。pk=sk=USER#{userId}, createdAt（応募との時刻差10分以内で「応募と同時の登録」判定）
- ScoutHistories-prd: スカウト。pk=CANDIDATE#...（履歴。attempts配列: scoutId/status[requested|sent|failed]/requestedAt/sentAt）と pk=SCOUT#{scoutId}（ページ用データ: companyName等）の2種が同居
`
}

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

    return `# ダッシュボード機能一覧\n\n${features}\n\n# APIエンドポイント一覧\n\n${apis}\n\n${buildSchemaSection()}\n\n${domainKnowledgeToMarkdown()}`
}
