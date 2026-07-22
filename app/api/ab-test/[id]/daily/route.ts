import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { fetchGA4Data, getGA4AccessToken, type GA4ReportRequest } from '@/lib/api/ga4/client'
import { calculateCVR, type CvrConfig } from '@/lib/services/analytics/cvrService'
import { buildGa4ConfigDimensionFilter } from '@/lib/services/ab-test/ga4ConfigFilter'
import { parseDateString } from '@/lib/utils/date'

interface GA4CvrConfig {
    denominatorDimension?: string
    denominatorLabels?: string[] | string
    numeratorDimension?: string
    numeratorLabels?: string[] | string
    metric?: string
    [key: string]: unknown
}

interface GA4Config {
    propertyId: string
    dimensions?: Array<{ name: string }> | string
    metrics?: Array<{ name: string }> | string
    limit?: number
    filter?: { dimension?: string; operator?: string; expression?: string }
    excludeFilter?: { dimension?: string; operator?: string; expression?: string }
    cvrA?: GA4CvrConfig
    cvrB?: GA4CvrConfig
    cvrC?: GA4CvrConfig
    cvrD?: GA4CvrConfig
}

const VARIANT_KEYS = ['A', 'B', 'C', 'D'] as const
type VariantKey = (typeof VARIANT_KEYS)[number]

interface VariantDaily {
    pv: number
    cv: number
    cvr: number
    cumPv: number
    cumCv: number
    cumCvr: number
}

function normalizeCvrConfig(cvrConfig: GA4CvrConfig): CvrConfig {
    return {
        ...cvrConfig,
        denominatorLabels: Array.isArray(cvrConfig.denominatorLabels)
            ? cvrConfig.denominatorLabels
            : typeof cvrConfig.denominatorLabels === 'string'
            ? cvrConfig.denominatorLabels.split(',').map((l) => l.trim())
            : [],
        numeratorLabels: Array.isArray(cvrConfig.numeratorLabels)
            ? cvrConfig.numeratorLabels
            : typeof cvrConfig.numeratorLabels === 'string'
            ? cvrConfig.numeratorLabels.split(',').map((l) => l.trim())
            : [],
    } as CvrConfig
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const abTestId = parseInt(id, 10)
        if (isNaN(abTestId)) {
            return NextResponse.json({ error: 'Invalid AB test ID' }, { status: 400 })
        }

        const body = await request.json().catch(() => ({}))
        const { startDate: reqStart, endDate: reqEnd } = body

        const abTest = await prisma.abTest.findUnique({
            where: { id: abTestId },
            include: { product: { select: { ga4PropertyId: true, name: true } } },
        })

        if (!abTest) {
            return NextResponse.json({ error: 'AB test not found' }, { status: 404 })
        }

        const ga4Config = abTest.ga4Config as unknown as GA4Config
        if (!ga4Config?.propertyId) {
            return NextResponse.json({ error: 'GA4設定が不完全です' }, { status: 400 })
        }

        const accessToken = await getGA4AccessToken()

        const startDate = parseDateString(reqStart ?? abTest.startDate.toISOString().split('T')[0])
        const endDate = parseDateString(reqEnd ?? (abTest.endDate?.toISOString().split('T')[0] ?? 'yesterday'))

        const baseDimensions: Array<{ name: string }> = Array.isArray(ga4Config.dimensions)
            ? ga4Config.dimensions
            : typeof ga4Config.dimensions === 'string'
            ? ga4Config.dimensions.split(',').map((d) => ({ name: d.trim() }))
            : []

        const allDimensions = baseDimensions.some((d) => d.name === 'date')
            ? baseDimensions
            : [...baseDimensions, { name: 'date' }]

        const metrics: Array<{ name: string }> = Array.isArray(ga4Config.metrics)
            ? ga4Config.metrics
            : typeof ga4Config.metrics === 'string'
            ? ga4Config.metrics.split(',').map((m) => ({ name: m.trim() }))
            : []

        const ga4Request: GA4ReportRequest = {
            propertyId: ga4Config.propertyId,
            dateRanges: [{ startDate, endDate }],
            dimensions: allDimensions,
            metrics,
            // dateディメンション追加で行数が日数倍に膨らむため、設定値より大きめに取る（GA4上限は250,000）
            limit: Math.min(250000, Math.max(ga4Config.limit || 0, 100000)),
        }

        ga4Request.dimensionFilter = buildGa4ConfigDimensionFilter(ga4Config)

        const report = await fetchGA4Data(ga4Request, accessToken)

        const dimensionHeaders = report.dimensionHeaders || []
        const metricHeaders = report.metricHeaders || []

        const dateDimIdx = dimensionHeaders.findIndex((h) => h.name === 'date')
        if (dateDimIdx === -1) {
            return NextResponse.json({ error: 'dateディメンションが見つかりません' }, { status: 500 })
        }

        const activeVariants = VARIANT_KEYS.filter((v) => ga4Config[`cvr${v}`])

        // GA4のdateはYYYYMMDD — 日付ごとに行をグループ化
        const rowsByDate = new Map<string, typeof report.rows>()
        for (const row of report.rows ?? []) {
            const raw = row.dimensionValues[dateDimIdx]?.value ?? ''
            if (raw.length !== 8) continue
            const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
            const list = rowsByDate.get(date) ?? []
            list.push(row)
            rowsByDate.set(date, list)
        }

        const cumulative: Record<VariantKey, { pv: number; cv: number }> = {
            A: { pv: 0, cv: 0 }, B: { pv: 0, cv: 0 }, C: { pv: 0, cv: 0 }, D: { pv: 0, cv: 0 },
        }

        const days: Array<{ date: string } & Partial<Record<VariantKey, VariantDaily>>> = []
        for (const date of [...rowsByDate.keys()].sort()) {
            const sub = { ...report, rows: rowsByDate.get(date) ?? [] }
            const day: { date: string } & Partial<Record<VariantKey, VariantDaily>> = { date }
            for (const v of activeVariants) {
                const result = calculateCVR(sub, normalizeCvrConfig(ga4Config[`cvr${v}`]!), dimensionHeaders, metricHeaders)
                cumulative[v].pv += result.pv
                cumulative[v].cv += result.cv
                day[v] = {
                    pv: result.pv,
                    cv: result.cv,
                    cvr: result.cvr,
                    cumPv: cumulative[v].pv,
                    cumCv: cumulative[v].cv,
                    cumCvr: cumulative[v].pv > 0 ? cumulative[v].cv / cumulative[v].pv : 0,
                }
            }
            days.push(day)
        }

        return NextResponse.json({
            success: true,
            abTestName: abTest.name,
            startDate,
            endDate,
            variants: activeVariants,
            days,
        })
    } catch (error) {
        console.error('AB Test Daily CVR API Error:', error)
        return NextResponse.json(
            { error: '日次CVR推移の取得に失敗しました', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
