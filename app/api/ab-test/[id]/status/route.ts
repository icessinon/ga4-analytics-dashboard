import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { generateAndStoreFinalReport } from '@/lib/services/ab-test/finalReportService'

/**
 * 直近の実行結果から勝利バリアントとA比改善率を算出
 */
function getWinnerFromResultData(resultData: unknown): { winnerVariant: string | null; improvementVsAPercent: number | null } {
    const data = resultData as { cvrResults?: Record<string, { cvr: number; pv: number; cv: number }> } | null
    if (!data?.cvrResults) return { winnerVariant: null, improvementVsAPercent: null }
    const cvrResults = data.cvrResults
    const variants = [
        cvrResults.dataA && { name: 'A', data: cvrResults.dataA },
        cvrResults.dataB && { name: 'B', data: cvrResults.dataB },
        cvrResults.dataC && { name: 'C', data: cvrResults.dataC },
        cvrResults.dataD && { name: 'D', data: cvrResults.dataD },
    ].filter(Boolean) as Array<{ name: string; data: { cvr: number } }>
    if (variants.length < 2) return { winnerVariant: null, improvementVsAPercent: null }
    variants.sort((a, b) => b.data.cvr - a.data.cvr)
    const winner = variants[0]
    const variantA = variants.find((v) => v.name === 'A')
    let improvementVsAPercent: number | null = null
    if (variantA && winner.name !== 'A' && variantA.data.cvr > 0) {
        improvementVsAPercent = (winner.data.cvr - variantA.data.cvr) / variantA.data.cvr * 100
    }
    return { winnerVariant: winner.name, improvementVsAPercent }
}

/**
 * 指定バリアントのA比改善率を算出（A勝ち・算出不能時はnull）
 */
function getImprovementForVariant(resultData: unknown, variant: string): number | null {
    if (variant === 'A') return null
    const data = resultData as { cvrResults?: Record<string, { cvr: number }> } | null
    const cvrResults = data?.cvrResults
    if (!cvrResults) return null
    const winnerCvr = cvrResults[`data${variant}`]?.cvr
    const aCvr = cvrResults.dataA?.cvr
    if (winnerCvr == null || aCvr == null || aCvr <= 0) return null
    return (winnerCvr - aCvr) / aCvr * 100
}

/**
 * ABテストのステータスを更新
 */
export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> | { id: string } }
) {
    try {
        const resolvedParams = params instanceof Promise ? await params : params
        const id = parseInt(resolvedParams.id, 10)

        if (isNaN(id)) {
            return NextResponse.json(
                { error: 'Invalid ID' },
                { status: 400 }
            )
        }

        const body = await request.json()
        const { status, victoryFactors, defeatFactors, winnerVariant } = body

        if (!status || !['running', 'completed', 'paused'].includes(status)) {
            return NextResponse.json(
                { error: 'Invalid status. Must be one of: running, completed, paused' },
                { status: 400 }
            )
        }

        // winnerVariantが明示指定された場合は妥当性チェック（null=判定なしは許可）
        if (winnerVariant !== undefined && winnerVariant !== null && !['A', 'B', 'C', 'D'].includes(winnerVariant)) {
            return NextResponse.json(
                { error: 'Invalid winnerVariant. Must be one of: A, B, C, D or null' },
                { status: 400 }
            )
        }

        const updateData: {
            status: string
            winnerVariant?: string | null
            improvementVsAPercent?: number | null
            victoryFactors?: string | null
            defeatFactors?: string | null
        } = { status }
        if (victoryFactors !== undefined) updateData.victoryFactors = victoryFactors === '' ? null : victoryFactors
        if (defeatFactors !== undefined) updateData.defeatFactors = defeatFactors === '' ? null : defeatFactors

        if (status === 'completed') {
            const lastExec = await prisma.abTestReportExecution.findFirst({
                where: { abTestId: id, status: 'completed' },
                orderBy: { completedAt: 'desc' },
                select: { resultData: true },
            })
            const auto = lastExec?.resultData
                ? getWinnerFromResultData(lastExec.resultData)
                : { winnerVariant: null, improvementVsAPercent: null }
            // ユーザーが勝者を選択していればそれを優先（数値だけで測れない場合の上書き）。
            // 未指定(undefined)なら自動判定（CVR1位）にフォールバック。null=判定なし。
            const finalWinner = winnerVariant !== undefined ? winnerVariant : auto.winnerVariant
            updateData.winnerVariant = finalWinner
            // 改善率は自動判定(CVR1位)と一致する勝者のときのみ算出する。
            // 手動で別バリアントに上書きした場合、単体対Aのマイナス改善率は誤解を招く
            // （例: B+C合算を勝ちにしたいがBを選択 → 単体BはA未満）ため空にし、
            // 合算などの勝敗・改善はAIレポート本文＋観点で表現させる。
            const isManualOverride = winnerVariant !== undefined && winnerVariant !== auto.winnerVariant
            updateData.improvementVsAPercent = finalWinner && !isManualOverride
                ? getImprovementForVariant(lastExec?.resultData, finalWinner)
                : null
        }

        const abTest = await prisma.abTest.update({
            where: { id },
            data: updateData,
            include: {
                product: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        })

        // 手動完了時にAI最終レポートを生成（メモ更新を反映するため再生成）
        if (status === 'completed') {
            const report = await generateAndStoreFinalReport(id, { force: true })
            if (report) {
                abTest.finalAiReport = report
                abTest.finalAiReportAt = new Date()
            }
        }

        return NextResponse.json({
            success: true,
            abTest,
        })
    } catch (error) {
        console.error('AB Test Status Update API Error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json(
            {
                error: 'Failed to update AB test status',
                message: errorMessage,
            },
            { status: 500 }
        )
    }
}
