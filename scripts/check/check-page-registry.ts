/**
 * app/**\/page.tsx と lib/registry/pages.ts を突合する。
 *   - ページがあるのにレジストリに無い（サイドバー・機能ドキュメント・AI Q&A から漏れる）
 *   - レジストリにあるのにページが無い（リンク切れ）
 *   - href の重複
 *   - related の参照先がナビ非表示ページ
 * があれば一覧して非ゼロ終了する。`npm run check` から呼ばれ、deploy の verify ジョブで本番前に止まる。
 */
import { readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { PAGES, PAGE_IDS, getRelatedPages, type PageId } from '../../lib/registry'

const APP_DIR = join(__dirname, '..', '..', 'app')
/** レジストリに載せないページ */
const IGNORED_HREFS = new Set(['/login'])

function collectPageHrefs(dir: string): string[] {
    const out: string[] = []
    for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) {
            // API route は対象外。ただし app/docs/api のような下層の「api」ディレクトリは除外しない
            if (full === join(APP_DIR, 'api')) continue
            out.push(...collectPageHrefs(full))
        } else if (name === 'page.tsx') {
            const rel = relative(APP_DIR, dir).split(sep).join('/')
            out.push(rel === '' ? '/' : `/${rel}`)
        }
    }
    return out
}

const errors: string[] = []
const warnings: string[] = []

const actual = new Set(collectPageHrefs(APP_DIR).filter((h) => !IGNORED_HREFS.has(h)))
const registered = new Map<string, PageId>()
for (const id of PAGE_IDS) {
    const href = PAGES[id].href
    if (registered.has(href)) errors.push(`href が重複: ${href}（${registered.get(href)} と ${id}）`)
    registered.set(href, id)
}

for (const href of [...actual].sort()) {
    if (!registered.has(href)) errors.push(`レジストリ未登録のページ: ${href}  → lib/registry/pages.ts の PAGE_IDS / PAGES に追加する`)
}
for (const [href, id] of registered) {
    if (!actual.has(href)) errors.push(`ページが存在しない: ${href}（${id}）  → page.tsx を作るかレジストリから外す`)
}

for (const id of PAGE_IDS) {
    for (const rel of PAGES[id].related ?? []) {
        if (PAGES[rel].nav === false) errors.push(`${id}.related に ナビ非表示ページ ${rel} が入っている`)
    }
}

// 関連導線から一度も参照されないナビページ（孤島）。壊れてはいないので警告に留める
const navIds = PAGE_IDS.filter((id) => PAGES[id].nav !== false)
const inbound = new Map<PageId, number>(navIds.map((id) => [id, 0]))
for (const id of navIds) for (const rel of getRelatedPages(id)) inbound.set(rel, (inbound.get(rel) ?? 0) + 1)
for (const [id, n] of inbound) if (n === 0) warnings.push(`関連導線からの被参照が 0: ${id}（${PAGES[id].href}）`)

for (const w of warnings) console.warn(`warn: ${w}`)
if (errors.length > 0) {
    for (const e of errors) console.error(`error: ${e}`)
    console.error(`\n${errors.length} 件の不整合`)
    process.exit(1)
}
console.log(`ok: ${actual.size} ページがレジストリと一致（警告 ${warnings.length} 件）`)
