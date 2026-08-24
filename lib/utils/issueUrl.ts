// Backlog Issue 入力（URL・課題キー・番号のみ）をリンクURLと表示テキストに解決する
const BACKLOG_VIEW_BASE = 'https://xmile.backlog.com/view'

// issue入力（URL・課題キー・番号）からissue番号だけを取り出す（例: "XWORK_PRODUCT-1741" → "1741"）
export function extractIssueNumber(input: string | null | undefined): string | null {
    const link = resolveIssueLink(input)
    if (!link) return null
    const m = link.text.match(/(\d+)\s*$/) ?? link.href.match(/(\d+)(?:[#?].*)?$/)
    return m ? m[1] : null
}

// カレンダー等での表示名: issue番号があり、名前にまだ [番号] が含まれていなければ先頭に付ける
export function displayTestName(name: string, issueUrl: string | null | undefined): string {
    const n = extractIssueNumber(issueUrl)
    if (!n || name.includes(`[${n}]`) || name.includes(n)) return name
    return `[${n}] ${name}`
}

export function resolveIssueLink(input: string | null | undefined): { href: string; text: string } | null {
    const v = (input ?? '').trim()
    if (!v) return null
    if (/^https?:\/\//.test(v)) {
        // URL入力: 表示は課題キー部分（/view/XXX）があればそれ、なければURL全体
        const m = v.match(/\/view\/([A-Z0-9_-]+)/i)
        return { href: v, text: m ? m[1] : v }
    }
    if (/^\d+$/.test(v)) {
        // 番号のみ: XWORK_PRODUCT-{n} とみなす
        return { href: `${BACKLOG_VIEW_BASE}/XWORK_PRODUCT-${v}`, text: `XWORK_PRODUCT-${v}` }
    }
    if (/^[A-Z0-9_]+-\d+$/i.test(v)) {
        // 課題キー（例: XWORK_PRODUCT-1804）
        return { href: `${BACKLOG_VIEW_BASE}/${v}`, text: v }
    }
    return null
}
