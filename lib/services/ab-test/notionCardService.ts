import { queryDatabase, getPagePlainText, isNotionEnabled } from '@/lib/api/notion/client'

// 課題・施策アイディア DB（プロダクト計画ハブ配下）
const ISSUE_IDEA_DB_ID = 'a8a18e3ea46543b9b5137cea3f5509bc'

export interface NotionCardContext {
    /** プロンプトに載せる整形済みテキスト（プロパティ＋本文の要約） */
    text: string
    /** 参照元カードのURL（レポートに出典として添えられる） */
    url: string
    /** カードタイトル */
    title: string
}

/** issueUrl（"1808" / "XWORK_PRODUCT-1808" / フルURL いずれも可）から数値の課題番号を取り出す */
function extractIssueNumber(issueUrl: string | null | undefined): string | null {
    if (!issueUrl) return null
    const m = issueUrl.match(/(\d{2,})/)
    return m ? m[1] : null
}

function selectName(prop: any): string | null {
    return prop?.select?.name ?? null
}

function titlePlain(prop: any): string {
    const arr = prop?.title
    return Array.isArray(arr) ? arr.map((t: any) => t?.plain_text ?? '').join('') : ''
}

/**
 * ABテストに対応する Notion 施策カードを探して、レポート生成に使える文脈テキストを返す。
 * 紐付けは Backlog番号（関連Backlog）優先、見つからなければ施策名（タイトル）で照合。
 * NOTION_API_KEY 未設定・カード不在・API失敗のいずれでも null を返す（呼び出し側を止めない）。
 */
export async function fetchAbTestCardContext(
    abTest: { name: string; issueUrl?: string | null },
): Promise<NotionCardContext | null> {
    if (!isNotionEnabled()) return null
    try {
        let results: any[] | null = null

        // 1) Backlog番号で照合
        const issueNo = extractIssueNumber(abTest.issueUrl)
        if (issueNo) {
            results = await queryDatabase(ISSUE_IDEA_DB_ID, {
                property: '関連Backlog',
                url: { contains: `XWORK_PRODUCT-${issueNo}` },
            }, 2)
        }

        // 2) 見つからなければ施策名（タイトル完全一致に近い contains）でフォールバック
        if ((!results || results.length === 0) && abTest.name) {
            results = await queryDatabase(ISSUE_IDEA_DB_ID, {
                property: '課題・アイデア',
                title: { contains: abTest.name },
            }, 2)
        }

        if (!results || results.length === 0) return null
        const page = results[0]
        const props = page.properties ?? {}
        const title = titlePlain(props['課題・アイデア']) || abTest.name
        const url: string = page.url ?? ''

        const metaParts = [
            selectName(props['ジャンル']) && `ジャンル: ${selectName(props['ジャンル'])}`,
            selectName(props['関連KPI']) && `関連KPI: ${selectName(props['関連KPI'])}`,
            selectName(props['ステータス']) && `ステータス: ${selectName(props['ステータス'])}`,
            selectName(props['ABテスト結果']) && `カード上のAB結果: ${selectName(props['ABテスト結果'])}`,
        ].filter(Boolean)

        const body = await getPagePlainText(page.id, { charCap: 2800 })

        const textParts = [
            `施策カード名: ${title}`,
            metaParts.length ? metaParts.join(' ／ ') : null,
            body ? `--- カード本文（背景・狙い・期待効果・想定インパクト等） ---\n${body}` : null,
        ].filter(Boolean)

        return { text: textParts.join('\n'), url, title }
    } catch (err) {
        console.warn(`[notionCard] abTest "${abTest.name}" のカード取得スキップ:`, err instanceof Error ? err.message : err)
        return null
    }
}
