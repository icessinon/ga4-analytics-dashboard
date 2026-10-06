/**
 * API エンドポイント一覧（/docs/api と AI Q&A の知識ベースが使う）。
 *
 * 実在する route は lib/docs/apiList.generated.ts（scripts/check/gen-api-list.ts が app/api から生成）、
 * 表示名・パラメータ・カテゴリの注釈は lib/docs/apiAnnotations.ts。ここで 2 つを合成する。
 * route を足せば自動で一覧に載り、消せば消える（手書きだけだった頃は 19 本の未掲載と 1 本の幽霊があった）。
 */

import { GENERATED_ENDPOINTS, type GeneratedEndpoint } from './apiList.generated'
import { API_ANNOTATIONS, type ApiAnnotation } from './apiAnnotations'
import type { ApiEndpoint } from './apiTypes'

/** 表示順。ここに無いカテゴリは末尾に名前順で付く */
const CATEGORY_ORDER = [
    '認証',
    'ダッシュボード',
    'ABテスト',
    '分析・レポート',
    'トレンド',
    'ファネル',
    '集客・チャネル',
    'ユーザー行動分析',
    'ユーザー経路・離脱分析',
    '職種別CV分析',
    '求人種別CV分析',
    '月次インサイト',
    'ヒートマップ・その他',
    'アラート・定期配信',
    'ドキュメント',
    '設定・ツール',
]

/** 注釈の無い route のカテゴリをパスの先頭セグメントから推定する */
const CATEGORY_BY_SEGMENT: Record<string, string> = {
    auth: '認証',
    dashboard: 'ダッシュボード',
    'ab-test': 'ABテスト',
    analytics: '分析・レポート',
    reports: '分析・レポート',
    trend: 'トレンド',
    funnel: 'ファネル',
    'signup-funnel': 'ファネル',
    scout: '集客・チャネル',
    'line-report': '集客・チャネル',
    'utm-report': '集客・チャネル',
    'seo-report': '集客・チャネル',
    'signup-step-mails': '集客・チャネル',
    user: 'ユーザー行動分析',
    'user-flow': 'ユーザー行動分析',
    journey: 'ユーザー経路・離脱分析',
    exit: 'ユーザー経路・離脱分析',
    pageflow: 'ユーザー経路・離脱分析',
    'list-performance': 'ユーザー経路・離脱分析',
    occupation: '職種別CV分析',
    'cv-types': '求人種別CV分析',
    applications: '求人種別CV分析',
    insights: '月次インサイト',
    heatmap: 'ヒートマップ・その他',
    ga4: 'ヒートマップ・その他',
    alerts: 'アラート・定期配信',
    docs: 'ドキュメント',
    products: '設定・ツール',
    'ai-usage': '設定・ツール',
}

function annotationFor(e: GeneratedEndpoint): ApiAnnotation | undefined {
    const exact = API_ANNOTATIONS[`${e.method} ${e.path}`]
    if (exact) return exact
    // 手書き側の method が実体と食い違っている（GET と書いたが POST）ときは、その path に 1 メソッドしか無ければ採用する
    const sameRoute = GENERATED_ENDPOINTS.filter((g) => g.path === e.path)
    if (sameRoute.length !== 1) return undefined
    const key = Object.keys(API_ANNOTATIONS).find((k) => k.endsWith(` ${e.path}`))
    return key ? API_ANNOTATIONS[key] : undefined
}

function toEndpoint(e: GeneratedEndpoint): ApiEndpoint & { category: string } {
    const a = annotationFor(e)
    const segment = e.path.replace(/^\/api\//, '').split('/')[0]
    return {
        path: e.path,
        method: e.method,
        name: a?.name ?? (e.doc || e.path),
        description: a?.description ?? e.doc,
        params: a?.params,
        responseNote: a?.responseNote,
        category: a?.category ?? CATEGORY_BY_SEGMENT[segment] ?? 'その他',
    }
}

const all = GENERATED_ENDPOINTS.map(toEndpoint)
const categories = Array.from(new Set(all.map((e) => e.category))).sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a)
    const ib = CATEGORY_ORDER.indexOf(b)
    if (ia === -1 && ib === -1) return a.localeCompare(b, 'ja')
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
})

export const API_LIST: { category: string; endpoints: ApiEndpoint[] }[] = categories.map((category) => ({
    category,
    endpoints: all
        .filter((e) => e.category === category)
        .map(({ category: _c, ...rest }) => rest),
}))
