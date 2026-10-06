/**
 * サイドバーのグループ＝機能ドキュメントの章。1 箇所で定義し、両方がここから引く。
 * CATEGORY_IDS を先に宣言して Record<CategoryId, …> で受けるので、定義漏れ・余剰キー・
 * ページ側の存在しないカテゴリ指定（旧 category: '可視化' のような孤立値）は型で止まる。
 *
 * 並び順 = サイドバーのグループ順 = 機能ドキュメントの章順。
 */
export const CATEGORY_IDS = [
    'settings',
    'kpi',
    'cv',
    'channel',
    'abtest',
    'funnel',
    'visual',
    'users',
    'tools',
    'docs',
] as const
export type CategoryId = (typeof CATEGORY_IDS)[number]

export interface CategoryDef {
    /** サイドバー・機能ドキュメント見出し */
    label: string
    /** このグループで答えられる問い。トップのグループ説明に使う */
    hint: string
    /** 機能ドキュメントのカード色。白面・濃い面どちらでも 3:1 を満たす値（lib/constants/chartColors.ts と同系） */
    color: { border: string; bg: string; label: string }
    /** 機能ドキュメントの章にするか。既定 true */
    showInDocs?: boolean
}

export const CATEGORIES: Record<CategoryId, CategoryDef> = {
    settings: {
        label: '設定',
        hint: 'プロダクトやアラートの設定を変える',
        color: { border: '#ea580c', bg: 'rgba(234,88,12,0.08)', label: '#ea580c' },
    },
    kpi: {
        label: 'KPI・レポート',
        hint: '全体の数字はどう動いているか',
        color: { border: '#3b82f6', bg: 'rgba(96,165,250,0.08)', label: '#3b82f6' },
    },
    cv: {
        label: 'CV分析',
        hint: '応募・会員登録はどれだけ・どの種別で起きているか',
        color: { border: '#16a34a', bg: 'rgba(74,222,128,0.08)', label: '#16a34a' },
    },
    channel: {
        label: 'チャネル・集客',
        hint: 'どこから来た人が成果を出しているか',
        color: { border: '#0891b2', bg: 'rgba(34,211,238,0.08)', label: '#0891b2' },
    },
    abtest: {
        label: 'ABテスト',
        hint: '施策は効いたか、次に何をやるか',
        color: { border: '#d97706', bg: 'rgba(251,191,36,0.08)', label: '#d97706' },
    },
    funnel: {
        label: 'ファネル',
        hint: 'フォームや導線のどこで止まっているか',
        color: { border: '#16a34a', bg: 'rgba(52,211,153,0.08)', label: '#16a34a' },
    },
    visual: {
        label: '可視化',
        hint: 'サイト内でどう動き、どこで離脱しているか',
        color: { border: '#ef4444', bg: 'rgba(248,113,113,0.08)', label: '#ef4444' },
    },
    users: {
        label: 'ユーザー分析',
        hint: 'どんなユーザーが、どれだけ戻ってくるか',
        color: { border: '#8b5cf6', bg: 'rgba(99,102,241,0.08)', label: '#8b5cf6' },
    },
    tools: {
        label: 'データ・ツール',
        hint: '生データを自分で見たい',
        color: { border: '#9ca3af', bg: 'rgba(156,163,175,0.08)', label: '#9ca3af' },
    },
    docs: {
        label: 'ドキュメント',
        hint: '使い方・用語・APIを調べる',
        color: { border: '#9ca3af', bg: 'rgba(156,163,175,0.08)', label: '#9ca3af' },
        showInDocs: false,
    },
}
