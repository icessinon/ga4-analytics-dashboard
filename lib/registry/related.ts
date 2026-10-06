import { CATEGORY_IDS } from './categories'
import { PAGES, PAGE_IDS, type PageId } from './pages'

/**
 * 関連ページの導出。47 ページ × N を手で書かずに済むよう、
 *   1. PAGES[id].related（明示。特に見せたいものだけ）
 *   2. 共有タグ数の多い順（同点は CATEGORY_IDS 順 → PAGE_IDS 順）
 *   3. 同カテゴリの兄弟
 * の順で詰め、自分自身とナビ非表示ページは除く。
 */
export function getRelatedPages(id: PageId, max = 5): PageId[] {
    const self = PAGES[id]
    const out: PageId[] = []
    const push = (pid: PageId) => {
        if (pid === id || out.includes(pid) || PAGES[pid].nav === false) return
        if (out.length < max) out.push(pid)
    }

    for (const pid of self.related ?? []) push(pid)

    const myTags = new Set(self.tags ?? [])
    if (myTags.size > 0) {
        const scored = PAGE_IDS
            .map((pid) => ({ pid, score: (PAGES[pid].tags ?? []).filter((t) => myTags.has(t)).length }))
            .filter((x) => x.score > 0)
            .sort((a, b) =>
                b.score - a.score
                || CATEGORY_IDS.indexOf(PAGES[a.pid].category) - CATEGORY_IDS.indexOf(PAGES[b.pid].category)
                || PAGE_IDS.indexOf(a.pid) - PAGE_IDS.indexOf(b.pid))
        for (const { pid } of scored) push(pid)
    }

    for (const pid of PAGE_IDS) {
        if (PAGES[pid].category === self.category) push(pid)
    }
    return out
}
