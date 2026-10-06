import { prisma } from './client'

/**
 * productId → GA4 プロパティ ID。
 * body に propertyId が直接あればそれを優先し、無ければ productId から引く
 * （heatmap 系 route が個別に prisma.product.findUnique していた処理）。
 * どちらも無い・見つからないときは null。
 */
export async function resolvePropertyId(input: {
    propertyId?: string | number | null
    productId?: string | number | null
}): Promise<string | null> {
    if (input.propertyId !== undefined && input.propertyId !== null && String(input.propertyId) !== '') {
        return String(input.propertyId)
    }
    const id = Number(input.productId)
    if (!Number.isInteger(id) || id <= 0) return null
    const product = await prisma.product.findUnique({ where: { id }, select: { ga4PropertyId: true } })
    return product?.ga4PropertyId ?? null
}
