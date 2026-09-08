/**
 * Notion REST API の薄いラッパー。
 * NOTION_API_KEY（内部インテグレーションのトークン）が未設定なら null を返し、呼び出し側で no-op にする。
 * 施策カード（課題・施策アイディアDB）を AB最終レポート生成に使うためだけの最小実装。
 */

const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

export function getNotionKey(): string | null {
    const key = process.env.NOTION_API_KEY
    return key && key.trim() ? key.trim() : null
}

export function isNotionEnabled(): boolean {
    return getNotionKey() !== null
}

async function notionFetch(path: string, init: RequestInit): Promise<any | null> {
    const key = getNotionKey()
    if (!key) return null
    const res = await fetch(`${NOTION_API}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${key}`,
            'Notion-Version': NOTION_VERSION,
            'Content-Type': 'application/json',
            ...(init.headers ?? {}),
        },
    })
    if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`Notion API ${res.status}: ${body.slice(0, 200)}`)
    }
    return res.json()
}

export interface NotionQueryFilter {
    [key: string]: unknown
}

/** データベースをフィルタ付きでクエリ（先頭ページのみ、最大 pageSize 件） */
export async function queryDatabase(
    databaseId: string,
    filter: NotionQueryFilter,
    pageSize = 3,
): Promise<any[] | null> {
    const data = await notionFetch(`/databases/${databaseId}/query`, {
        method: 'POST',
        body: JSON.stringify({ filter, page_size: pageSize }),
    })
    if (!data) return null
    return Array.isArray(data.results) ? data.results : []
}

/** ブロックの子を取得（1ページ最大100件、cursor で続き取得） */
async function getBlockChildren(blockId: string, startCursor?: string): Promise<any | null> {
    const qs = new URLSearchParams({ page_size: '100' })
    if (startCursor) qs.set('start_cursor', startCursor)
    return notionFetch(`/blocks/${blockId}/children?${qs.toString()}`, { method: 'GET' })
}

function richTextToPlain(rt: any[]): string {
    if (!Array.isArray(rt)) return ''
    return rt.map((t) => t?.plain_text ?? '').join('')
}

/**
 * ページ本文を素朴なプレーンテキストに変換する。
 * 見出し・段落・箇条書き・引用・コールアウト・テーブルを対象に、深さ2まで再帰。
 * blockCap / charCap で総量を制限（レポートのプロンプトに載る量に抑える）。
 */
export async function getPagePlainText(
    pageId: string,
    opts: { charCap?: number; blockCap?: number } = {},
): Promise<string | null> {
    const charCap = opts.charCap ?? 4000
    const blockCap = opts.blockCap ?? 250
    const lines: string[] = []
    let blockCount = 0
    let totalChars = 0

    async function walk(blockId: string, depth: number): Promise<void> {
        if (depth > 2 || blockCount >= blockCap || totalChars >= charCap) return
        let cursor: string | undefined
        do {
            const page = await getBlockChildren(blockId, cursor)
            if (!page) return
            for (const b of page.results ?? []) {
                if (blockCount >= blockCap || totalChars >= charCap) return
                blockCount++
                const type: string = b.type
                const node = b[type] ?? {}
                let text = ''
                switch (type) {
                    case 'heading_1':
                    case 'heading_2':
                    case 'heading_3':
                        text = `# ${richTextToPlain(node.rich_text)}`
                        break
                    case 'paragraph':
                    case 'quote':
                    case 'callout':
                    case 'toggle':
                        text = richTextToPlain(node.rich_text)
                        break
                    case 'bulleted_list_item':
                    case 'numbered_list_item':
                    case 'to_do':
                        text = `- ${richTextToPlain(node.rich_text)}`
                        break
                    case 'table_row': {
                        const cells: any[][] = node.cells ?? []
                        text = cells.map((c) => richTextToPlain(c)).filter(Boolean).join(' | ')
                        break
                    }
                    default:
                        text = ''
                }
                text = text.trim()
                if (text) {
                    lines.push(text)
                    totalChars += text.length
                }
                // テーブル等は子（行）を辿る
                if (b.has_children && ['table', 'column_list', 'column', 'toggle'].includes(type)) {
                    await walk(b.id, depth + 1)
                }
            }
            cursor = page.has_more ? page.next_cursor : undefined
        } while (cursor && blockCount < blockCap && totalChars < charCap)
    }

    try {
        await walk(pageId, 0)
    } catch {
        // 途中で失敗しても、取れた分だけ返す
    }
    const out = lines.join('\n').trim()
    return out ? out.slice(0, charCap) : null
}
