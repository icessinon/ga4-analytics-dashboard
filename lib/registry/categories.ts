/**
 * サイドバーのグループ＝機能ドキュメントの章。1 箇所で定義し、両方がここから引く。
 * CATEGORY_IDS を先に宣言して Record<CategoryId, …> で受けるので、定義漏れ・余剰キー・
 * ページ側の存在しないカテゴリ指定（旧 category: '可視化' のような孤立値）は型で止まる。
 *
 * 並び順 = サイドバーのグループ順 = 機能ドキュメントの章順。
 * 分析のワークフロー順（全体 → CV → 集客 → サイト内行動 → ユーザー → 施策検証 → ツール → 設定）に
 * 並べ、各グループに「このグループで答えられる問い」を持たせている。
 */
export const CATEGORY_IDS = [
    'kpi',
    'apply',
    'signup',
    'channel',
    'behavior',
    'users',
    'abtest',
    'tools',
    'settings',
] as const
export type CategoryId = (typeof CATEGORY_IDS)[number]

export interface CategoryDef {
    /** サイドバー・機能ドキュメント見出し */
    label: string
    /** このグループで答えられる問い。トップのグループ説明に使う。空なら出さない */
    hint: string
    /** 機能ドキュメントのカード色。白面・濃い面どちらでも 3:1 を満たす値（lib/constants/chartColors.ts と同系） */
    color: { border: string; bg: string; label: string }
    /** 機能ドキュメントの章にするか。既定 true */
    showInDocs?: boolean
}

export const CATEGORIES: Record<CategoryId, CategoryDef> = {
    kpi: {
        label: '全体KPI',
        hint: '全体の数字はどう動いているか',
        color: { border: '#3b82f6', bg: 'rgba(96,165,250,0.08)', label: '#3b82f6' },
    },
    apply: {
        label: '応募',
        hint: '応募はどれだけ・どの種別で・フォームのどこで止まるか',
        color: { border: '#16a34a', bg: 'rgba(74,222,128,0.08)', label: '#16a34a' },
    },
    signup: {
        label: '会員登録',
        hint: '会員登録はどう増え、誰が登録しているか',
        color: { border: '#0891b2', bg: 'rgba(34,211,238,0.08)', label: '#0891b2' },
    },
    channel: {
        label: '集客・チャネル',
        hint: 'どこから来た人が成果を出しているか',
        color: { border: '#d97706', bg: 'rgba(251,191,36,0.08)', label: '#d97706' },
    },
    behavior: {
        label: '行動・経路・離脱',
        hint: 'サイト内でどう動き、どこで離脱しているか',
        color: { border: '#ef4444', bg: 'rgba(248,113,113,0.08)', label: '#ef4444' },
    },
    users: {
        label: 'ユーザー・定着',
        hint: 'どんなユーザーが、どれだけ戻ってくるか',
        color: { border: '#8b5cf6', bg: 'rgba(99,102,241,0.08)', label: '#8b5cf6' },
    },
    abtest: {
        label: 'ABテスト・施策',
        hint: '施策は効いたか、次に何をやるか',
        color: { border: '#ea580c', bg: 'rgba(234,88,12,0.08)', label: '#ea580c' },
    },
    tools: {
        label: 'データ・ツール',
        hint: '生データを自分で見たい',
        color: { border: '#9ca3af', bg: 'rgba(156,163,175,0.08)', label: '#9ca3af' },
    },
    settings: {
        label: '設定・ドキュメント',
        hint: '',
        color: { border: '#9ca3af', bg: 'rgba(156,163,175,0.08)', label: '#9ca3af' },
    },
}
