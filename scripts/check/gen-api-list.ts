/**
 * app/api/**\/route.ts を走査して API 一覧（lib/docs/apiList.generated.ts）を生成する。
 *
 * - 各 route の `export async function GET|POST|PUT|DELETE|PATCH` と、その直前の JSDoc（無ければファイル先頭の JSDoc）を拾う
 * - 手書きの名前・パラメータ・カテゴリは lib/docs/apiAnnotations.ts に置く（ここでは触らない）
 * - `--check` は生成結果とディスク上のファイルを比較し、差があれば exit 1（CI の npm run check で実行）
 *
 *   npx tsx scripts/check/gen-api-list.ts          # 生成
 *   npx tsx scripts/check/gen-api-list.ts --check  # 差分チェック
 */

import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'fs'
import { join, relative } from 'path'

const ROOT = join(__dirname, '..', '..')
const API_DIR = join(ROOT, 'app', 'api')
const OUT = join(ROOT, 'lib', 'docs', 'apiList.generated.ts')
const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const

interface Generated {
    path: string
    method: string
    /** route の JSDoc から取った説明（1 段落目）。無ければ '' */
    doc: string
    file: string
}

function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p, out)
        else if (name === 'route.ts') out.push(p)
    }
    return out
}

/** JSDoc ブロックを 1 段落のテキストに。`* ` を剥がし、空行までを採用 */
function docText(block: string): string {
    const lines = block
        .replace(/^\/\*\*?/, '').replace(/\*\/$/, '')
        .split('\n')
        .map((l) => l.replace(/^\s*\*\s?/, '').trimEnd())
    const firstPara: string[] = []
    for (const l of lines) {
        if (l.trim() === '' && firstPara.length > 0) break
        if (l.trim() === '') continue
        if (l.trim().startsWith('@')) break
        firstPara.push(l.trim())
    }
    return firstPara.join(' ').trim()
}

function extract(file: string): Generated[] {
    const src = readFileSync(file, 'utf8')
    const rel = relative(API_DIR, file).replace(/\/route\.ts$/, '').replace(/\\/g, '/')
    const path = `/api/${rel}`
    const fileDoc = src.match(/^\s*\/\*\*[\s\S]*?\*\//)
    const results: Generated[] = []
    for (const method of METHODS) {
        const re = new RegExp(`((?:/\\*\\*[\\s\\S]*?\\*/\\s*)?)export\\s+async\\s+function\\s+${method}\\b`)
        const m = src.match(re)
        if (!m) continue
        const own = m[1] ? docText(m[1]) : ''
        results.push({ path, method, doc: own || (fileDoc ? docText(fileDoc[0]) : ''), file: relative(ROOT, file) })
    }
    return results
}

function render(items: Generated[]): string {
    const body = items
        .sort((a, b) => (a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path)))
        .map((e) => `    { path: ${JSON.stringify(e.path)}, method: ${JSON.stringify(e.method)}, doc: ${JSON.stringify(e.doc)}, file: ${JSON.stringify(e.file)} },`)
        .join('\n')
    return `/**
 * 【自動生成】scripts/check/gen-api-list.ts が app/api/**\\/route.ts から生成。手で編集しない。
 * 名前・パラメータ・カテゴリの注釈は lib/docs/apiAnnotations.ts に書く。
 */

export interface GeneratedEndpoint {
    path: string
    method: string
    /** route の JSDoc 1 段落目 */
    doc: string
    file: string
}

export const GENERATED_ENDPOINTS: GeneratedEndpoint[] = [
${body}
]
`
}

const check = process.argv.includes('--check')
const content = render(walk(API_DIR).flatMap(extract))
if (check) {
    const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
    if (current !== content) {
        console.error(`ng: ${relative(ROOT, OUT)} が app/api の実体と一致しません。npx tsx scripts/check/gen-api-list.ts を実行してコミットしてください`)
        process.exit(1)
    }
    console.log(`ok: ${relative(ROOT, OUT)} は最新です`)
} else {
    writeFileSync(OUT, content)
    console.log(`generated: ${relative(ROOT, OUT)} (${content.split('\n').length - 1} lines)`)
}
