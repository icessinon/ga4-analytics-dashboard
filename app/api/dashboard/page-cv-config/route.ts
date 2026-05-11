/**
 * パスごとのCVイベント名設定の取得・保存
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'

const pageCvConfig = (prisma as unknown as { pageCvConfig: unknown }).pageCvConfig as {
    findMany: (args: { where: { productId: number }; select: { pagePath: true; cvEventName: true; cvDimension: true } }) => Promise<{ pagePath: string; cvEventName: string; cvDimension: string | null }[]>
    deleteMany: (args: { where: { productId: number; pagePath: string } }) => Promise<unknown>
    upsert: (args: { where: { productId_pagePath: { productId: number; pagePath: string } }; create: { productId: number; pagePath: string; cvEventName: string; cvDimension: string }; update: { cvEventName: string; cvDimension: string } }) => Promise<unknown>
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const productIdParam = searchParams.get('productId')
        const productId = productIdParam ? parseInt(productIdParam, 10) : null

        if (!productId || Number.isNaN(productId)) {
            return NextResponse.json(
                { error: 'productId is required' },
                { status: 400 }
            )
        }

        const configs = await pageCvConfig.findMany({
            where: { productId },
            select: { pagePath: true, cvEventName: true, cvDimension: true },
        })

        const configsMap: Record<string, { cvEventName: string; cvDimension: string | null }> = {}
        configs.forEach((c) => {
            configsMap[c.pagePath] = {
                cvEventName: c.cvEventName,
                cvDimension: c.cvDimension ?? 'eventName',
            }
        })

        return NextResponse.json({ configs: configsMap })
    } catch (error) {
        console.error('Page CV config GET error:', error)
        return NextResponse.json(
            { error: '設定の取得に失敗しました' },
            { status: 500 }
        )
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}))
        const { productId: productIdBody, pagePath, cvEventName, cvDimension } = body

        const productId = typeof productIdBody === 'number' ? productIdBody : parseInt(String(productIdBody), 10)
        if (!productId || Number.isNaN(productId) || typeof pagePath !== 'string' || pagePath === '') {
            return NextResponse.json(
                { error: 'productId and pagePath are required' },
                { status: 400 }
            )
        }

        const name = typeof cvEventName === 'string' ? cvEventName.trim() : ''
        const dim = typeof cvDimension === 'string' && cvDimension.trim() ? cvDimension.trim() : null

        if (name === '') {
            await pageCvConfig.deleteMany({
                where: { productId, pagePath },
            })
            return NextResponse.json({ success: true, cvEventName: null, cvDimension: null })
        }

        const allowedDimensions = ['eventName', 'customEvent:click_label', 'customEvent:view_label']
        const dimension = dim && allowedDimensions.includes(dim) ? dim : 'eventName'

        await pageCvConfig.upsert({
            where: {
                productId_pagePath: { productId, pagePath },
            },
            create: { productId, pagePath, cvEventName: name, cvDimension: dimension },
            update: { cvEventName: name, cvDimension: dimension },
        })

        return NextResponse.json({ success: true, cvEventName: name, cvDimension: dimension })
    } catch (error) {
        console.error('Page CV config POST error:', error)
        return NextResponse.json(
            { error: '設定の保存に失敗しました' },
            { status: 500 }
        )
    }
}
