/**
 * 履歴一覧。レポート実行・ABテスト実行・ファネル実行を 1 本の時系列にまとめる。
 *
 * もとは画面側で 3 つの API を 3 つのタブから別々に叩いていたが、ABテスト実行は
 * レポート実行としても記録されるため、2 つのタブにほぼ同じ行が並んでいた。
 * ここで種別を判定して重複なく 1 列にする。
 *
 * ページングは「各ソースから skip+limit 件だけ取って、createdAt 降順に並べて切る」方式。
 * 件数が数百のうちは素直で速い。
 */

import { prisma } from '@/lib/db/client'
import type { HistoryKind, HistoryListResult, HistoryQuery, HistoryRow } from './historyTypes'

type Where = Record<string, unknown>

function containsSearch(search: string) {
    return { contains: search, mode: 'insensitive' as const }
}

/** レポート実行の絞り込み。kind で「ABテスト由来 / それ以外」を切り分ける */
function reportExecutionWhere(productId: number | undefined, kind: HistoryKind | undefined, search: string): Where {
    const where: Where = {}
    if (productId) where.report = { productId }
    if (kind === 'abtest') where.abTestExecutions = { some: {} }
    if (kind === 'report') where.abTestExecutions = { none: {} }
    if (search) {
        where.OR = [
            { report: { name: containsSearch(search) } },
            { abTestExecutions: { some: { abTest: { name: containsSearch(search) } } } },
        ]
    }
    return where
}

/** レポート実行に紐づかないABテスト実行（失敗して結果が残らなかったものなど） */
function orphanAbTestWhere(productId: number | undefined, search: string): Where {
    const where: Where = { reportExecutionId: null }
    const abTest: Where = {}
    if (productId) abTest.productId = productId
    if (search) abTest.name = containsSearch(search)
    if (Object.keys(abTest).length > 0) where.abTest = abTest
    return where
}

function funnelWhere(productId: number | undefined, search: string): Where {
    const where: Where = {}
    if (productId) where.productId = productId
    if (search) where.name = containsSearch(search)
    return where
}

const formatDate = (d: Date) => d.toLocaleDateString('ja-JP')

export async function listHistory(query: HistoryQuery): Promise<HistoryListResult> {
    const { productId, kind, search = '', page, limit } = query
    const need = page * limit // 各ソースから「このページまでに必要な分」だけ取る

    const wantReports = kind === undefined || kind === 'abtest' || kind === 'report'
    const wantOrphans = kind === undefined || kind === 'abtest'
    const wantFunnels = kind === undefined || kind === 'funnel'

    const reportWhere = reportExecutionWhere(productId, kind, search)
    const orphanWhere = orphanAbTestWhere(productId, search)
    const funnelsWhere = funnelWhere(productId, search)

    const [reportExecutions, reportTotal, orphanExecutions, orphanTotal, funnelExecutions, funnelTotal] =
        await Promise.all([
            wantReports
                ? prisma.reportExecution.findMany({
                      where: reportWhere,
                      include: {
                          report: { select: { name: true } },
                          abTestExecutions: { include: { abTest: { select: { id: true, name: true } } }, take: 1 },
                      },
                      orderBy: { createdAt: 'desc' },
                      take: need,
                  })
                : [],
            wantReports ? prisma.reportExecution.count({ where: reportWhere }) : 0,
            wantOrphans
                ? prisma.abTestReportExecution.findMany({
                      where: orphanWhere,
                      include: { abTest: { select: { id: true, name: true } } },
                      orderBy: { createdAt: 'desc' },
                      take: need,
                  })
                : [],
            wantOrphans ? prisma.abTestReportExecution.count({ where: orphanWhere }) : 0,
            wantFunnels
                ? prisma.funnelExecution.findMany({
                      where: funnelsWhere,
                      orderBy: { createdAt: 'desc' },
                      take: need,
                  })
                : [],
            wantFunnels ? prisma.funnelExecution.count({ where: funnelsWhere }) : 0,
        ])

    const rows: HistoryRow[] = [
        ...reportExecutions.map((exec): HistoryRow => {
            const abTest = exec.abTestExecutions[0]?.abTest
            return {
                key: `report-${exec.id}`,
                kind: abTest ? 'abtest' : 'report',
                title: abTest?.name ?? exec.report.name,
                // ABテスト実行の元レポート名は常に「ABテストレポート」で情報量がないので出さない
                note: null,
                status: exec.status,
                createdAt: exec.createdAt.toISOString(),
                detailHref: exec.resultData ? `/reports/${exec.id}` : null,
                abTestHref: abTest ? `/ab-test/${abTest.id}` : null,
                deletePath: `/api/reports/history/${exec.id}`,
                errorMessage: exec.errorMessage,
            }
        }),
        ...orphanExecutions.map((exec): HistoryRow => ({
            key: `abtest-${exec.id}`,
            kind: 'abtest',
            title: exec.abTest.name,
            note: 'レポート未生成',
            status: exec.status,
            createdAt: exec.createdAt.toISOString(),
            detailHref: null,
            abTestHref: `/ab-test/${exec.abTestId}`,
            deletePath: null,
            errorMessage: exec.errorMessage,
        })),
        ...funnelExecutions.map((exec): HistoryRow => ({
            key: `funnel-${exec.id}`,
            kind: 'funnel',
            title: exec.name ?? 'ファネル分析',
            note: `${formatDate(exec.startDate)} 〜 ${formatDate(exec.endDate)}`,
            status: exec.status,
            createdAt: exec.createdAt.toISOString(),
            detailHref: exec.resultData ? `/funnel/${exec.id}` : null,
            abTestHref: null,
            deletePath: `/api/funnel/executions/${exec.id}`,
            errorMessage: null,
        })),
    ]

    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    const total = reportTotal + orphanTotal + funnelTotal
    const skip = (page - 1) * limit

    return {
        rows: rows.slice(skip, skip + limit),
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    }
}
