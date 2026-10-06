import type { CategoryId } from './categories'
import type { FeatureDocBody } from './pages'

/** UI ページを持たないバックグラウンド機能。機能ドキュメントには載せるがナビには出ない */
export interface BackgroundFeature {
    name: string
    category: CategoryId
    doc: FeatureDocBody
}

export const BACKGROUND_FEATURES: readonly BackgroundFeature[] = [
    {
        name: '週次AIサマリー配信',
        category: 'kpi',
        doc: {
            description: '毎週月曜 09:00 JST に先週（月〜日）の主要KPI・チャネル別セッション変動・実行中ABテストの途中経過を集計し、AIサマリー（ハイライト・気になる変化・今週のアクション）を添えて Slack に自動配信します。UIページはなくスケジューラが自動実行します。',
            capabilities: [
                '先週 vs 前週の KPI 比較（セッション・新規ユーザー・応募CV・LP応募CV・会員登録CV・全体CVR）',
                'チャネル別セッションの変動上位（前週比）',
                '実行中 AB テストの途中経過（バリアント別CVR・有意差）',
                'AI サマリー（先週のハイライト / 気になる変化 / 今週のアクション）',
            ],
            metrics: ['sessions', 'newUsers', 'totalUsers', 'sessionDefaultChannelGroup'],
            ai: true,
            apiRoute: 'POST /api/reports/weekly-summary',
        },
    },
]
