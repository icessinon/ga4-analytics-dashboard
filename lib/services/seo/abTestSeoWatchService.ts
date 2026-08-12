import { prisma } from '@/lib/db/client'
import { gscQuery } from '@/lib/api/gsc/client'
import { sendSlackNotification, type SlackBlock } from '@/lib/services/notification/slackService'
import { callGemini } from '@/lib/api/gemini/callGemini'

/**
 * 実行中ABテストのSEO監視。
 * ga4Config.seoWatchPaths（パス正規表現の配列）が設定されたテストについて、
 * Search Consoleで「対象ページ群 vs サイト全体（対照）」の直近7日 vs テスト開始前7日を比較し、
 * 対照より有意に悪化していればSlack通知する（DiD: アルゴリズム更新・季節要因を対照で吸収）。
 * GSCは2〜3日ラグ・SEO反映は2〜6週のため、通知は「急落の早期検知」であり本判定は数週間後。
 */

const GSC_LAG_DAYS = 3
const WINDOW_DAYS = 7
// 対照比でクリックがこれ以上悪化したらアラート（-20%）
const CLICKS_DID_THRESHOLD = -0.2
// 対照比で平均順位がこれ以上悪化（数値増加）したらアラート
const POSITION_DID_THRESHOLD = 1.0
// ベースライン週の対象クリックがこれ未満なら判定しない（ノイズ対策）
const MIN_BASELINE_CLICKS = 50

interface WindowStat { clicks: number; impressions: number; position: number | null }

export interface SeoWatchResult {
    abTestId: number
    abTestName: string
    productId: number
    paths: string[]
    status: 'alert' | 'ok' | 'insufficient_data' | 'too_early'
    detail: string
    target?: { baseline: WindowStat; current: WindowStat }
    control?: { baseline: WindowStat; current: WindowStat }
    clicksDiD?: number
    positionDiD?: number
    aiComment?: string | null
}

function fmt(d: Date): string {
    return d.toISOString().slice(0, 10)
}

function addDays(d: Date, n: number): Date {
    const r = new Date(d)
    r.setDate(r.getDate() + n)
    return r
}

async function fetchWindow(startDate: string, endDate: string, pathsRegex: string | null): Promise<WindowStat> {
    const rows = await gscQuery({
        startDate, endDate,
        dimensions: [],
        ...(pathsRegex ? { filters: [{ dimension: 'page' as const, operator: 'includingRegex' as const, expression: pathsRegex }] } : {}),
    })
    return {
        clicks: rows[0]?.clicks ?? 0,
        impressions: rows[0]?.impressions ?? 0,
        position: rows[0]?.position ?? null,
    }
}

function changeRate(cur: number, base: number): number | null {
    return base > 0 ? cur / base - 1 : null
}

export async function runAbTestSeoWatch(): Promise<SeoWatchResult[]> {
    const tests = await prisma.abTest.findMany({ where: { status: 'running' } })
    const results: SeoWatchResult[] = []

    for (const test of tests) {
        const config = test.ga4Config as { seoWatchPaths?: string[] } | null
        const paths = config?.seoWatchPaths?.filter((p) => typeof p === 'string' && p.trim()) ?? []
        if (paths.length === 0) continue

        const base: Omit<SeoWatchResult, 'status' | 'detail'> = {
            abTestId: test.id, abTestName: test.name, productId: test.productId, paths,
        }

        try {
            // 窓の設計: 現在窓 = GSCラグを除いた直近7日 / ベースライン窓 = テスト開始前日までの7日
            const curEnd = addDays(new Date(), -GSC_LAG_DAYS)
            const curStart = addDays(curEnd, -(WINDOW_DAYS - 1))
            const testStart = new Date(test.startDate)
            const baseEnd = addDays(testStart, -1)
            const baseStart = addDays(baseEnd, -(WINDOW_DAYS - 1))

            if (curStart <= baseEnd) {
                results.push({ ...base, status: 'too_early', detail: `テスト開始から日が浅くGSCラグ（${GSC_LAG_DAYS}日）を除いた比較窓がまだ確保できません` })
                continue
            }

            const pathsRegex = `^https://x-work\\.jp(${paths.join('|')})`
            const [targetBase, targetCur, controlBase, controlCur] = await Promise.all([
                fetchWindow(fmt(baseStart), fmt(baseEnd), pathsRegex),
                fetchWindow(fmt(curStart), fmt(curEnd), pathsRegex),
                fetchWindow(fmt(baseStart), fmt(baseEnd), null),
                fetchWindow(fmt(curStart), fmt(curEnd), null),
            ])

            const stats = { target: { baseline: targetBase, current: targetCur }, control: { baseline: controlBase, current: controlCur } }

            if (targetBase.clicks < MIN_BASELINE_CLICKS) {
                results.push({ ...base, ...stats, status: 'insufficient_data', detail: `ベースライン週の対象クリックが${targetBase.clicks}件（${MIN_BASELINE_CLICKS}件未満）のため判定なし` })
                continue
            }

            const targetChange = changeRate(targetCur.clicks, targetBase.clicks)
            const controlChange = changeRate(controlCur.clicks, controlBase.clicks) ?? 0
            const clicksDiD = targetChange != null ? targetChange - controlChange : null
            const positionDiD = (targetCur.position != null && targetBase.position != null && controlCur.position != null && controlBase.position != null)
                ? (targetCur.position - targetBase.position) - (controlCur.position - controlBase.position)
                : null

            const isAlert = (clicksDiD != null && clicksDiD <= CLICKS_DID_THRESHOLD)
                || (positionDiD != null && positionDiD >= POSITION_DID_THRESHOLD)

            const detail = `クリック: 対象${targetBase.clicks}→${targetCur.clicks}（${targetChange != null ? `${(targetChange * 100).toFixed(0)}%` : '－'}）` +
                ` / 全体${controlBase.clicks}→${controlCur.clicks}（${(controlChange * 100).toFixed(0)}%）` +
                `${clicksDiD != null ? ` / 対照比 ${(clicksDiD * 100).toFixed(0)}pt` : ''}` +
                `${positionDiD != null ? ` / 順位の対照比変化 ${positionDiD >= 0 ? '+' : ''}${positionDiD.toFixed(1)}` : ''}`

            const result: SeoWatchResult = {
                ...base, ...stats,
                status: isAlert ? 'alert' : 'ok',
                detail,
                clicksDiD: clicksDiD ?? undefined,
                positionDiD: positionDiD ?? undefined,
            }

            if (isAlert) {
                try {
                    result.aiComment = await callGemini(
                        `求人サイトx-work.jpでABテスト「${test.name}」実施中、SEO監視が対象ページ群の悪化を検知しました。\n` +
                        `対象パス: ${paths.join(', ')}\n` +
                        `比較: テスト開始前7日 vs 直近7日（対照=サイト全体とのDiD）\n${detail}\n` +
                        `対象: クリック${targetBase.clicks}→${targetCur.clicks}、表示${targetBase.impressions}→${targetCur.impressions}、平均順位${targetBase.position?.toFixed(1)}→${targetCur.position?.toFixed(1)}\n` +
                        `全体: クリック${controlBase.clicks}→${controlCur.clicks}、平均順位${controlBase.position?.toFixed(1)}→${controlCur.position?.toFixed(1)}\n` +
                        `この変動がABテスト起因か外部要因かの見立てと、確認すべきポイントを3行以内で簡潔に。SEO反映は2-6週かかる点も踏まえて。`,
                        'abTestSeoWatch',
                        test.productId
                    )
                } catch { /* AIコメントは取れなくても通知はする */ }
            }
            results.push(result)
        } catch (err) {
            results.push({ ...base, status: 'insufficient_data', detail: `取得エラー: ${err instanceof Error ? err.message.slice(0, 120) : 'unknown'}` })
        }
    }
    return results
}

function statusEmoji(s: SeoWatchResult['status']): string {
    return s === 'alert' ? '🚨' : s === 'ok' ? '✅' : s === 'too_early' ? '⏳' : 'ℹ️'
}

export function buildSeoWatchBlocks(results: SeoWatchResult[], weekly: boolean): SlackBlock[] {
    const blocks: SlackBlock[] = [
        { type: 'header', text: { type: 'plain_text', text: weekly ? '🔍 ABテストSEO監視 週次サマリー' : '🚨 ABテストSEO監視アラート' } },
    ]
    for (const r of results) {
        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `${statusEmoji(r.status)} *${r.abTestName}*（対象: ${r.paths.join(', ')}）\n${r.detail}`.slice(0, 2900),
            },
        })
        if (r.aiComment) {
            blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `🤖 ${r.aiComment}`.slice(0, 2900) } })
        }
    }
    blocks.push({ type: 'divider' })
    blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: '比較 = テスト開始前7日 vs 直近7日、対照はサイト全体（DiD）。SEOの反映は2〜6週かかるため、アラートは早期検知であり本判定はテスト後半〜終了後に /seo-report で確認してください。' },
    })
    return blocks
}

/** 日次実行のエントリポイント。alertがあれば通知、weekly=trueなら異常なしでもサマリー通知 */
export async function checkAbTestSeoAndNotify(weekly: boolean): Promise<SeoWatchResult[]> {
    const results = await runAbTestSeoWatch()
    const webhookUrl = process.env.SLACK_WEBHOOK_URL
    if (!webhookUrl || results.length === 0) return results
    const alerts = results.filter((r) => r.status === 'alert')
    if (alerts.length > 0 && !weekly) {
        await sendSlackNotification([webhookUrl], buildSeoWatchBlocks(alerts, false))
    } else if (weekly) {
        await sendSlackNotification([webhookUrl], buildSeoWatchBlocks(results, true))
    }
    return results
}
