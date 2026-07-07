import { prisma } from '@/lib/db/client'
import { bqListTableRows } from '@/lib/bq/client'

export interface PastAbTest {
    abTestId: number
    name: string
    hypothesis: string | null
    expectedImprovementPct: number | null
    winnerVariant: string | null
    improvementVsAPct: number | null
    statisticalSignificance: number | null
    victoryFactors: string | null
    defeatFactors: string | null
    aiReport: string | null
    startDate: string | null
    endDate: string | null
}

function toNum(v: string | null): number | null {
    if (v == null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
}

async function fetchFromBQ(): Promise<PastAbTest[]> {
    const rows = await bqListTableRows('ab_test_final_report_log')
    // 同一テストの再生成があるため report_date が最新の行のみ残す
    const byId = new Map<number, { reportDate: string; test: PastAbTest }>()
    for (const r of rows) {
        const abTestId = toNum(r.ab_test_id)
        if (abTestId == null) continue
        const reportDate = r.report_date ?? ''
        const existing = byId.get(abTestId)
        if (existing && existing.reportDate >= reportDate) continue
        byId.set(abTestId, {
            reportDate,
            test: {
                abTestId,
                name: r.ab_test_name ?? `ABテスト #${abTestId}`,
                hypothesis: r.hypothesis,
                expectedImprovementPct: toNum(r.expected_improvement_pct),
                winnerVariant: r.winner_variant,
                improvementVsAPct: toNum(r.improvement_vs_a_pct),
                statisticalSignificance: toNum(r.statistical_significance),
                victoryFactors: r.victory_factors,
                defeatFactors: r.defeat_factors,
                aiReport: r.ai_report,
                startDate: r.start_date,
                endDate: r.end_date,
            },
        })
    }
    return [...byId.values()].map((v) => v.test)
}

async function fetchFromPostgres(): Promise<PastAbTest[]> {
    const tests = await prisma.abTest.findMany({
        where: { status: 'completed' },
        orderBy: { updatedAt: 'desc' },
        take: 50,
    })
    return tests.map((t) => ({
        abTestId: t.id,
        name: t.name,
        hypothesis: t.hypothesis,
        expectedImprovementPct: t.expectedImprovement != null ? Number(t.expectedImprovement) : null,
        winnerVariant: t.winnerVariant,
        improvementVsAPct: t.improvementVsAPercent != null ? Number(t.improvementVsAPercent) : null,
        statisticalSignificance: null,
        victoryFactors: t.victoryFactors,
        defeatFactors: t.defeatFactors,
        aiReport: t.finalAiReport,
        startDate: t.startDate ? t.startDate.toISOString().slice(0, 10) : null,
        endDate: t.endDate ? t.endDate.toISOString().slice(0, 10) : null,
    }))
}

/**
 * 過去のABテスト実績を収集する。
 * BQ (ab_test_final_report_log) を長期蓄積の主ソースとし、
 * Postgres の完了済みテスト（BQに最終レポートがない古いテストを含む）をマージする。
 * 同一 abTestId は Postgres 側（メモが最新）を優先する。
 */
export async function getPastAbTests(): Promise<PastAbTest[]> {
    const byId = new Map<number, PastAbTest>()
    try {
        for (const t of await fetchFromBQ()) byId.set(t.abTestId, t)
    } catch (err) {
        console.error('[advisor] BQ read failed, falling back to Postgres only:', err instanceof Error ? err.message : err)
    }
    try {
        for (const t of await fetchFromPostgres()) byId.set(t.abTestId, t)
    } catch (err) {
        console.error('[advisor] Postgres read failed:', err instanceof Error ? err.message : err)
    }
    return [...byId.values()].sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? ''))
}
