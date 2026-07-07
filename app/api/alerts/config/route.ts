import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/client'
import { DEFAULT_ALERT_CONFIG } from '@/lib/services/alerts/cvDropAlertService'

const VALID_METRICS = ['sessions', 'applyCv', 'lpApplyCv', 'signupCv', 'cvr']

/** 全プロダクトのアラート設定を返す（未設定のプロダクトはデフォルト値） */
export async function GET() {
    try {
        const products = await prisma.product.findMany({
            where: { ga4PropertyId: { not: null } },
            include: { alertConfig: true },
            orderBy: { id: 'asc' },
        })
        const configs = products.map((p) => ({
            productId: p.id,
            productName: p.name,
            enabled: p.alertConfig?.enabled ?? true,
            dropThreshold: p.alertConfig?.dropThreshold ?? DEFAULT_ALERT_CONFIG.dropThreshold,
            minSessions: p.alertConfig?.minSessions ?? DEFAULT_ALERT_CONFIG.minSessions,
            minCv: p.alertConfig?.minCv ?? DEFAULT_ALERT_CONFIG.minCv,
            metrics: Array.isArray(p.alertConfig?.metrics) ? p.alertConfig?.metrics : null,
        }))
        return NextResponse.json({ configs })
    } catch (e) {
        console.error('[alertConfig] 取得失敗:', e)
        return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
    }
}

/** プロダクトのアラート設定を保存（upsert） */
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json()
        const productId = Number(body.productId)
        if (!Number.isInteger(productId) || productId <= 0) {
            return NextResponse.json({ error: 'productId が不正です' }, { status: 400 })
        }
        const dropThreshold = Number(body.dropThreshold)
        if (!(dropThreshold > 0 && dropThreshold < 1)) {
            return NextResponse.json({ error: 'dropThreshold は 0〜1 の間で指定してください（0.3 = 30%）' }, { status: 400 })
        }
        const minSessions = Number.isInteger(body.minSessions) && body.minSessions >= 0 ? body.minSessions : DEFAULT_ALERT_CONFIG.minSessions
        const minCv = Number.isInteger(body.minCv) && body.minCv >= 0 ? body.minCv : DEFAULT_ALERT_CONFIG.minCv
        let metrics: string[] | null = null
        if (Array.isArray(body.metrics)) {
            const filtered = body.metrics.filter((m: unknown): m is string => typeof m === 'string' && VALID_METRICS.includes(m))
            if (filtered.length === 0) {
                return NextResponse.json({ error: '監視対象指標を1つ以上選択してください' }, { status: 400 })
            }
            metrics = filtered.length === VALID_METRICS.length ? null : filtered // 全指標 = null
        }
        const enabled = body.enabled !== false

        const config = await prisma.alertConfig.upsert({
            where: { productId },
            create: { productId, enabled, dropThreshold, minSessions, minCv, metrics: metrics ?? Prisma.DbNull },
            update: { enabled, dropThreshold, minSessions, minCv, metrics: metrics ?? Prisma.DbNull },
        })
        return NextResponse.json({ success: true, config })
    } catch (e) {
        console.error('[alertConfig] 保存失敗:', e)
        return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
    }
}
