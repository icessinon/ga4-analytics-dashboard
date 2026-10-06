import { CATEGORIES, CATEGORY_IDS, type CategoryId } from './categories'
import { PAGES, PAGE_IDS, type FeatureDocBody } from './pages'
import { BACKGROUND_FEATURES } from './backgroundFeatures'

/**
 * 機能ドキュメント（/docs/features）と AI Q&A（lib/docs/knowledgeBase.ts）が読む一覧。
 * PAGES のうち doc を持つもの ＋ UI ページを持たないバックグラウンド機能を結合して生成する。
 * 手で別に保守していた旧 featureList.ts の代わり。
 */
export interface FeatureDoc extends FeatureDocBody {
    name: string
    /** UI ページがない機能は undefined */
    href?: string
    categoryId: CategoryId
    /** 表示用のカテゴリ名 */
    category: string
}

export const FEATURE_LIST: readonly FeatureDoc[] = [
    ...PAGE_IDS.flatMap((id): FeatureDoc[] => {
        const p = PAGES[id]
        if (!p.doc) return []
        return [{ name: p.title, href: p.href, categoryId: p.category, category: CATEGORIES[p.category].label, ...p.doc }]
    }),
    ...BACKGROUND_FEATURES.map((f): FeatureDoc => ({
        name: f.name, categoryId: f.category, category: CATEGORIES[f.category].label, ...f.doc,
    })),
]

/** 機能ドキュメントの章として出すカテゴリ（showInDocs !== false）。サイドバーと同じ順 */
export const FEATURE_CATEGORY_IDS: readonly CategoryId[] = CATEGORY_IDS.filter((id) => CATEGORIES[id].showInDocs !== false)
