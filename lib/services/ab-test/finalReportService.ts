import { prisma } from '@/lib/db/client'
import { generateAbTestFinalReport, type FinalReportVariant, type FinalReportFunnel } from '@/lib/api/gemini/abTestFinalReport'
import { computeAbTestFunnel } from '@/lib/services/ab-test/abTestFunnelService'
import { insertAbTestFinalReportLog, jstReportDate, jstReportMonth, nowIso } from '@/lib/bq/write'

type CvrResult = { pv: number; cv: number; cvr: number }
type ResultData = {
    cvrResults?: { dataA?: CvrResult; dataB?: CvrResult; dataC?: CvrResult; dataD?: CvrResult }
    abTestEvaluation?: {
        recommendation?: string
        checks?: { significance?: { value?: number } }
    } | null
}

function toDateStr(d: Date | null): string | null {
    return d ? d.toISOString().slice(0, 10) : null
}

/**
 * ABテスト終了時のAI最終レポートを生成し、Postgres(AbTest.finalAiReport)と
 * BQ(ab_test_final_report_log)に保存する。
 * 既にレポートがある場合は再生成しない（force指定時を除く）。
 * 失敗しても throw しない（呼び出し元のフローを止めない）。
 */
export async function generateAndStoreFinalReport(
    abTestId: number,
    options: { force?: boolean } = {},
): Promise<string | null> {
    try {
        const abTest = await prisma.abTest.findUnique({ where: { id: abTestId } })
        if (!abTest) return null
        if (abTest.finalAiReport && !options.force) return abTest.finalAiReport

        const lastExec = await prisma.abTestReportExecution.findFirst({
            where: { abTestId, status: 'completed' },
            orderBy: { completedAt: 'desc' },
            select: { resultData: true },
        })
        const resultData = (lastExec?.resultData ?? null) as ResultData | null
        const cvrResults = resultData?.cvrResults
        if (!cvrResults) {
            console.warn(`[finalReport] abTest ${abTestId}: 実行結果がないためレポートを生成できません`)
            return null
        }

        const variantLabels: Record<string, string> = {
            A: abTest.variantAName,
            B: abTest.variantBName,
            C: 'バリアントC',
            D: 'バリアントD',
        }
        const variants: FinalReportVariant[] = []
        for (const name of ['A', 'B', 'C', 'D'] as const) {
            const data = cvrResults[`data${name}`]
            if (data) variants.push({ name, label: variantLabels[name], pv: data.pv ?? 0, cv: data.cv ?? 0, cvr: data.cvr ?? 0 })
        }
        if (variants.length < 2) {
            console.warn(`[finalReport] abTest ${abTestId}: バリアントが2つ未満のためレポートを生成できません`)
            return null
        }

        const significance = resultData?.abTestEvaluation?.checks?.significance?.value ?? null
        const recommendation = resultData?.abTestEvaluation?.recommendation ?? null
        const improvementVsA = abTest.improvementVsAPercent != null ? Number(abTest.improvementVsAPercent) : null
        const expectedImprovement = abTest.expectedImprovement != null ? Number(abTest.expectedImprovement) : null

        // ステップファネル（クリック基準優先。取れない設定のテストではビュー基準にフォールバック、それも無理なら省略）
        // CVR計算と条件を揃えるため、除外フィルタ（LP経由除外等）が設定されているテストでは適用する
        let funnel: FinalReportFunnel | null = null
        for (const basis of ['click', 'view'] as const) {
            try {
                const result = await computeAbTestFunnel(abTest, basis, { applyExcludeFilter: true })
                if (result.steps.length > 0) {
                    funnel = {
                        basis: result.basis,
                        variants: result.variants,
                        steps: result.steps.map((s) => ({
                            stepName: s.stepName,
                            users: Object.fromEntries(result.variants.map((v) => [v, s.values[v]?.users ?? null]).filter(([, u]) => u != null)) as Record<string, number>,
                            dropoffRate: Object.fromEntries(result.variants.map((v) => [v, s.values[v]?.dropoffRate ?? null])),
                        })),
                    }
                    break
                }
            } catch (err) {
                console.warn(`[finalReport] abTest ${abTestId}: ${basis}基準ファネル取得スキップ:`, err instanceof Error ? err.message : err)
            }
        }

        const report = await generateAbTestFinalReport({
            testName: abTest.name,
            hypothesis: abTest.hypothesis,
            expectedImprovementPct: expectedImprovement,
            startDate: toDateStr(abTest.startDate) ?? '',
            endDate: toDateStr(abTest.endDate),
            variants,
            winnerVariant: abTest.winnerVariant,
            improvementVsAPercent: improvementVsA,
            statisticalSignificance: significance,
            recommendation,
            victoryFactors: abTest.victoryFactors,
            defeatFactors: abTest.defeatFactors,
            funnel,
        }, abTest.productId)
        if (!report) return null

        await prisma.abTest.update({
            where: { id: abTestId },
            data: { finalAiReport: report, finalAiReportAt: new Date() },
        })

        await insertAbTestFinalReportLog({
            ab_test_id: abTestId,
            product_id: abTest.productId,
            ab_test_name: abTest.name,
            hypothesis: abTest.hypothesis,
            expected_improvement_pct: expectedImprovement,
            variant_a_name: abTest.variantAName,
            variant_b_name: abTest.variantBName,
            winner_variant: abTest.winnerVariant,
            improvement_vs_a_pct: improvementVsA,
            statistical_significance: significance,
            variants_summary: JSON.stringify(variants),
            victory_factors: abTest.victoryFactors,
            defeat_factors: abTest.defeatFactors,
            ai_report: report,
            start_date: toDateStr(abTest.startDate),
            end_date: toDateStr(abTest.endDate),
            report_month: jstReportMonth(),
            report_date: jstReportDate(),
            synced_at: nowIso(),
        })

        return report
    } catch (err) {
        console.error(`[finalReport] abTest ${abTestId} レポート生成失敗:`, err instanceof Error ? err.message : err)
        return null
    }
}
