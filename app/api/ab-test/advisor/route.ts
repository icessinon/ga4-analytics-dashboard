import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { getPastAbTests } from '@/lib/services/ab-test/advisorService'
import { buildBusinessContext } from '@/lib/services/ab-test/advisorContextService'
import { adviseOnAbTestProposal } from '@/lib/api/gemini/abTestAdvisor'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const proposal = typeof body.proposal === 'string' ? body.proposal.trim() : ''
        const productId = typeof body.productId === 'number' ? body.productId : undefined
        if (!proposal) {
            return NextResponse.json({ error: '施策提案を入力してください' }, { status: 400 })
        }

        // 事業コンテキスト（CV単価＋直近30日のGA4実測）。productのpropertyIdが引けなくても単価だけで続行
        let propertyId: string | null = null
        if (productId != null) {
            const product = await prisma.product.findUnique({ where: { id: productId } })
            propertyId = product?.ga4PropertyId ?? null
        }
        const [pastTests, businessContext] = await Promise.all([
            getPastAbTests(),
            buildBusinessContext(propertyId),
        ])
        const answer = await adviseOnAbTestProposal(proposal, pastTests, productId, businessContext)
        if (answer === null) {
            return NextResponse.json({ error: '環境変数 GEMINI_API_KEY が設定されていません' }, { status: 500 })
        }

        return NextResponse.json({
            answer,
            referencedTests: pastTests.slice(0, 15).map((t) => ({
                abTestId: t.abTestId,
                name: t.name,
                winnerVariant: t.winnerVariant,
                improvementVsAPct: t.improvementVsAPct,
                startDate: t.startDate,
                endDate: t.endDate,
            })),
        })
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
    }
}
