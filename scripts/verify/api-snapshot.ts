/**
 * API レスポンスのスナップショット比較。route → service の載せ替えで振る舞いが変わっていないことを見る。
 *
 *   npx tsx scripts/verify/api-snapshot.ts --update            # 現在のレスポンスを .snapshots/ に保存
 *   npx tsx scripts/verify/api-snapshot.ts --compare           # 保存済みと比較（差分があれば exit 1）
 *   npx tsx scripts/verify/api-snapshot.ts --compare --only=occupation,cv-types
 *
 * - 対象は scripts/verify/cases.json。期間は絶対日付で固定する（相対指定だと日が変わると結果が変わる）
 * - volatile に挙げたキー（fetchedAt など）は比較前に落とす
 * - ローカルの `npm run dev` に ga4_auth=1 Cookie で叩く。SNAPSHOT_BASE_URL で向き先を変えられる
 * - .snapshots/ は gitignore。ベースラインは移行前のコードで 2 回取り、自己一致を確認してから使う
 *   （GA4 の (other) 行など、同じ期間でも揺れる値を先に把握するため）
 */

import fs from 'node:fs'
import path from 'node:path'

interface SnapshotCase {
    name: string
    path: string
    method?: 'GET' | 'POST'
    body?: Record<string, unknown>
    /** 比較から除くキー。'a.b.c' のドット区切りも可。配列要素には '*' を使う（例: 'rows.*.fetchedAt'） */
    volatile?: string[]
    /** 並び順が保証されない配列（同数タイを BQ が任意順で返す等）。要素を JSON 文字列順に並べ替えてから比較する */
    sorted?: string[]
}

const args = process.argv.slice(2)
const mode = args.includes('--update') ? 'update' : args.includes('--compare') ? 'compare' : null
const only = (args.find((a) => a.startsWith('--only='))?.slice('--only='.length) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
const baseUrl = process.env.SNAPSHOT_BASE_URL ?? 'http://localhost:3000'
const casesPath = path.resolve('scripts/verify/cases.json')
const snapshotDir = path.resolve('.snapshots')

if (!mode) {
    console.error('usage: api-snapshot.ts --update | --compare [--only=name,name]')
    process.exit(2)
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

function stripVolatile(value: Json, keyPath: string[]): void {
    if (keyPath.length === 0 || value === null || typeof value !== 'object') return
    const [head, ...rest] = keyPath
    if (Array.isArray(value)) {
        if (head === '*') for (const item of value) stripVolatile(item, rest)
        return
    }
    if (rest.length === 0) {
        delete value[head]
        return
    }
    if (head === '*') {
        for (const k of Object.keys(value)) stripVolatile(value[k], rest)
    } else if (head in value) {
        stripVolatile(value[head], rest)
    }
}

function sortArrayAt(value: Json, keyPath: string[]): void {
    if (value === null || typeof value !== 'object') return
    if (keyPath.length === 0) {
        if (Array.isArray(value)) value.sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1))
        return
    }
    const [head, ...rest] = keyPath
    if (Array.isArray(value)) {
        if (head === '*') for (const item of value) sortArrayAt(item, rest)
        return
    }
    if (head === '*') {
        for (const k of Object.keys(value)) sortArrayAt(value[k], rest)
    } else if (head in value) {
        sortArrayAt(value[head], rest)
    }
}

/** キー順を揃えて保存する（順序の違いを差分に見せない） */
function canonical(value: Json): Json {
    if (Array.isArray(value)) return value.map(canonical)
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]))
    }
    return value
}

function diff(a: Json, b: Json, prefix = '', out: string[] = [], limit = 30): string[] {
    if (out.length >= limit) return out
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) out.push(`${prefix || '(root)'}: 要素数 ${a.length} → ${b.length}`)
        for (let i = 0; i < Math.min(a.length, b.length); i++) diff(a[i], b[i], `${prefix}[${i}]`, out, limit)
        return out
    }
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
        const keys = new Set([...Object.keys(a), ...Object.keys(b)])
        for (const k of [...keys].sort()) {
            const p = prefix ? `${prefix}.${k}` : k
            if (!(k in a)) out.push(`${p}: 追加 ${JSON.stringify(b[k])}`)
            else if (!(k in b)) out.push(`${p}: 削除 ${JSON.stringify(a[k])}`)
            else diff(a[k], b[k], p, out, limit)
        }
        return out
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${prefix || '(root)'}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`)
    return out
}

async function fetchCase(c: SnapshotCase): Promise<{ status: number; body: Json }> {
    const method = c.method ?? (c.body ? 'POST' : 'GET')
    const res = await fetch(baseUrl + c.path, {
        method,
        headers: { Cookie: 'ga4_auth=1', ...(c.body ? { 'Content-Type': 'application/json' } : {}) },
        body: c.body ? JSON.stringify(c.body) : undefined,
        redirect: 'manual',
    })
    const text = await res.text()
    let body: Json
    try {
        body = JSON.parse(text) as Json
    } catch {
        throw new Error(`${c.name}: JSON 以外が返りました（HTTP ${res.status}）: ${text.slice(0, 120)}`)
    }
    for (const v of c.volatile ?? []) stripVolatile(body, v.split('.'))
    for (const v of c.sorted ?? []) sortArrayAt(body, v.split('.'))
    return { status: res.status, body: canonical(body) }
}

async function main() {
    const cases = (JSON.parse(fs.readFileSync(casesPath, 'utf8')) as SnapshotCase[]).filter(
        (c) => only.length === 0 || only.includes(c.name),
    )
    if (cases.length === 0) {
        console.error('対象ケースがありません')
        process.exit(2)
    }
    fs.mkdirSync(snapshotDir, { recursive: true })

    let failed = 0
    for (const c of cases) {
        const file = path.join(snapshotDir, `${c.name}.json`)
        const started = Date.now()
        const current = await fetchCase(c)
        const ms = Date.now() - started
        if (mode === 'update') {
            fs.writeFileSync(file, JSON.stringify(current, null, 2) + '\n')
            console.log(`saved   ${c.name.padEnd(28)} HTTP ${current.status}  ${ms}ms`)
            continue
        }
        if (!fs.existsSync(file)) {
            console.log(`missing ${c.name.padEnd(28)} （--update で先に保存してください）`)
            failed++
            continue
        }
        const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as Json
        const lines = diff(saved, current)
        if (lines.length === 0) {
            console.log(`same    ${c.name.padEnd(28)} HTTP ${current.status}  ${ms}ms`)
        } else {
            failed++
            console.log(`DIFF    ${c.name.padEnd(28)} HTTP ${current.status}  ${ms}ms`)
            for (const l of lines) console.log(`          ${l}`)
        }
    }
    if (mode === 'compare') {
        console.log(failed === 0 ? `ok: ${cases.length} ケース一致` : `ng: ${failed}/${cases.length} ケースに差分`)
        process.exit(failed === 0 ? 0 : 1)
    }
}

main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
})
