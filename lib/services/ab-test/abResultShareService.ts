/**
 * 【仕様】ABテスト完了時の結果共有。
 * SEO等の通常通知 (SLACK_WEBHOOK_URL) とは別の「AB結果共有チャンネル」
 * (SLACK_WEBHOOK_URL_ABREPORT) へ、勝者・A比改善率・期間・バリアント別CVR・
 * 最終AIレポートのサマリー/勝因・ダッシュボードURL入りで投稿する。
 *
 * テスト完了の両経路（execute の最終レポート生成時 / ステータス変更APIでの手動完了時）
 * から呼ぶ。variants を渡さない場合は ab_test_results の最新実行分から CVR を復元する。
 */
import { prisma } from '@/lib/db/client'
import { sendSlackNotification, type SlackBlock } from '@/lib/services/notification/slackService'

export interface ShareVariant {
    name: string
    data: { pv: number; cv: number; cvr: number }
}

/** ab_test_results の最新 reportExecution 分から CVR を復元（variants 未指定時のフォールバック） */
async function loadVariantsFromResults(abTestId: number): Promise<ShareVariant[]> {
    const latest = await prisma.abTestResult.findFirst({
        where: { abTestId },
        orderBy: { id: 'desc' },
        select: { reportExecutionId: true },
    })
    if (!latest?.reportExecutionId) return []
    const rows = await prisma.abTestResult.findMany({
        where: { abTestId, reportExecutionId: latest.reportExecutionId },
    })
    return rows
        .map((r) => ({
            name: r.variant,
            data: { pv: r.pageViews, cv: r.conversions, cvr: Number(r.conversionRate) },
        }))
        .sort((a, b) => b.data.cvr - a.data.cvr)
}

export async function shareAbResult(abTestId: number, variants?: ShareVariant[]): Promise<void> {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL_ABREPORT
    if (!webhookUrl) return

    const ab = await prisma.abTest.findUnique({
        where: { id: abTestId },
        include: { product: { select: { name: true } } },
    })
    if (!ab) return

    const vs = variants && variants.length > 0 ? variants : await loadVariantsFromResults(abTestId)

    const base = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
    const url = base ? `${base}/ab-test/${abTestId}` : ''
    const d = (x: Date | null) => (x ? new Date(x).toISOString().slice(0, 10) : '-')
    const period = `${d(ab.startDate)} 〜 ${d(ab.endDate)}`
    const winner = ab.winnerVariant
    const improve = ab.improvementVsAPercent != null ? Number(ab.improvementVsAPercent) : null

    // 最終AIレポート(Markdown)から「サマリー/勝因/要因」セクションを抜き出し Slack mrkdwn へ
    const report = ab.finalAiReport || ''
    const victory = ab.victoryFactors || ''
    // Markdown → Slack mrkdwn。番号付き見出し（### 1. 結果サマリー 等）は ◽️＋太字にして段落を見やすく
    const mdToSlack = (t: string) =>
        t
            .split('\n')
            .map((line) => {
                const h = line.match(/^#{1,6}\s*(?:\d+[.．、]\s*)?(.+?)\s*$/)
                if (h) return `◽️ *${h[1].replace(/\*\*/g, '').trim()}*`
                return line.replace(/\*\*/g, '*').replace(/^\s*[*-]\s+/, '• ')
            })
            .join('\n')
            .trim()
    const pickSections = (md: string, kw: string[]) =>
        md
            .split(/\n(?=#{2,6}\s)/)
            .filter((p) => {
                const head = p.split('\n')[0] || ''
                return kw.some((k) => head.includes(k))
            })
            .join('\n\n')
    let summary = victory || pickSections(report, ['サマリー', '勝因', '勝利', '要因']) || report
    summary = mdToSlack(summary)
    if (summary.length > 1500) summary = summary.slice(0, 1500).trimEnd() + ' …'

    const headline =
        winner && improve != null
            ? `勝者は *${winner}*。A比 *${improve >= 0 ? '+' : ''}${improve.toFixed(1)}%* の改善。`
            : winner
            ? `勝者は *${winner}*。`
            : '結果を集計しました。'

    const cvrLine = (v: ShareVariant) => {
        const star = v.name === winner ? ' :trophy:' : ''
        return `*${v.name}群${star}:*\n${(v.data.cvr * 100).toFixed(1)}%（${v.data.cv}/${v.data.pv}）`
    }
    const fields = vs.map(cvrLine)
    fields.push(`*期間:*\n${period}`)

    const blocks: SlackBlock[] = [
        { type: 'header', text: { type: 'plain_text', text: `✅ ABテスト完了｜${ab.name}` } },
        { type: 'section', text: { type: 'mrkdwn', text: headline } },
    ]
    if (vs.length > 0) {
        blocks.push({ type: 'section', fields: fields.slice(0, 10).map((t) => ({ type: 'mrkdwn', text: t })) })
    }
    if (summary) {
        blocks.push({ type: 'divider' })
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '*📝 サマリー・勝因*\n' + summary } })
    }
    if (url) {
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `<${url}|📊 ダッシュボードで詳細を見る>` } })
    }
    blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: (ab.issueUrl ? `issue #${ab.issueUrl} ・ ` : '') + (url || ab.product.name) }],
    })

    await sendSlackNotification([webhookUrl], blocks)
}
