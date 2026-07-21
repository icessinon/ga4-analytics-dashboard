import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { fetchGA4Data, getGA4AccessToken, type GA4ReportRequest } from '@/lib/api/ga4/client'
import { calculateCVR, type CvrConfig } from '@/lib/services/analytics/cvrService'
import {
    calculateStatisticalSignificance,
    getRequiredSignificanceByHybrid,
    getPeriodReliabilityLevel,
} from '@/lib/services/ab-test/statisticalService'
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
    cvrA?: GA4CvrConfig
    cvrB?: GA4CvrConfig
    cvrC?: GA4CvrConfig
    cvrD?: GA4CvrConfig
}

const VARIANT_KEYS = ['A', 'B', 'C', 'D'] as const
type VariantKey = (typeof VARIANT_KEYS)[number]

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

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const abTestId = parseInt(id, 10)
        if (isNaN(abTestId)) {
            return NextResponse.json({ error: 'Invalid AB test ID' }, { status: 400 })
        }

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

        const startDate = parseDateString(abTest.startDate.toISOString().split('T')[0])
        const today = parseDateString('today')
        const testEnd = abTest.endDate ? abTest.endDate.toISOString().split('T')[0] : null
        const endDate = testEnd && testEnd < today ? testEnd : today

        // 予約作成（開始日が未来）のテストはGA4に問い合わせず「開始前」を返す
        // サーバーはUTCのため、JST基準の当日で判定する
        const jstToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().split('T')[0]
        if (startDate > jstToday) {
            return NextResponse.json({ notStarted: true, startDate })
        }

        const dimensions: Array<{ name: string }> = Array.isArray(ga4Config.dimensions)
            ? ga4Config.dimensions
            : typeof ga4Config.dimensions === 'string'
            ? ga4Config.dimensions.split(',').map((d) => ({ name: d.trim() }))
            : []

        const metrics: Array<{ name: string }> = Array.isArray(ga4Config.metrics)
            ? ga4Config.metrics
            : typeof ga4Config.metrics === 'string'
            ? ga4Config.metrics.split(',').map((m) => ({ name: m.trim() }))
            : []

        const ga4Request: GA4ReportRequest = {
            propertyId: ga4Config.propertyId,
            dateRanges: [{ startDate, endDate }],
            dimensions,
            metrics,
            limit: Math.max(ga4Config.limit || 0, 10000),
        }

        const filterDimension = ga4Config.filter?.dimension
        const filterOperator = ga4Config.filter?.operator
        const filterExpression = ga4Config.filter?.expression
        if (filterDimension && filterOperator && filterExpression) {
            const expressions = filterExpression.split(',').map((s: string) => s.trim()).filter(Boolean)
            if (expressions.length > 1) {
                ga4Request.dimensionFilter = {
                    orGroup: {
                        expressions: expressions.map((exp: string) => ({
                            filter: {
                                fieldName: filterDimension,
                                stringFilter: { matchType: filterOperator.toUpperCase(), value: exp },
                            },
                        })),
                    },
                }
            } else if (expressions.length === 1) {
                ga4Request.dimensionFilter = {
                    filter: {
                        fieldName: filterDimension,
                        stringFilter: { matchType: filterOperator.toUpperCase(), value: expressions[0] },
                    },
                }
            }
        }

        const report = await fetchGA4Data(ga4Request, accessToken)
        const dimensionHeaders = report.dimensionHeaders || []
        const metricHeaders = report.metricHeaders || []

        const activeVariants = VARIANT_KEYS.filter((v) => ga4Config[`cvr${v}`])

        const variants = activeVariants.map((key) => {
            const result = calculateCVR(report, normalizeCvrConfig(ga4Config[`cvr${key}`]!), dimensionHeaders, metricHeaders)
            return { key, pv: result.pv, cv: result.cv, cvr: result.cvr }
        })

        const elapsedDays = Math.max(
            1,
            Math.floor((new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) / 86400000) + 1
        )

        const baseline = variants.find((v) => v.key === 'A')
        const comparisons = variants
            .filter((v) => v.key !== 'A')
            .map((v) => {
                if (!baseline) return null
                const stat = calculateStatisticalSignificance(v.cv, v.pv, baseline.cv, baseline.pv)
                const required = getRequiredSignificanceByHybrid(elapsedDays, baseline.cv, v.cv, baseline.pv, v.pv)
                return {
                    variant: v.key,
                    liftVsA: baseline.cvr > 0 ? (v.cvr - baseline.cvr) / baseline.cvr : null,
                    significance: stat.significance,
                    zScore: stat.zScore,
                    requiredSignificance: required.required,
                    isSufficient: stat.significance >= required.required,
                }
            })
            .filter((c): c is NonNullable<typeof c> => c !== null)

        const measured = variants.filter((v) => v.pv > 0)
        const leader = measured.length >= 2
            ? measured.reduce((best, v) => (v.cvr > best.cvr ? v : best)).key
            : null

        return NextResponse.json({
            success: true,
            abTestName: abTest.name,
            startDate,
            endDate,
            elapsedDays,
            reliability: getPeriodReliabilityLevel(elapsedDays),
            variants,
            comparisons,
            leader,
            fetchedAt: new Date().toISOString(),
        })
    } catch (error) {
        console.error('AB Test Current Result API Error:', error)
        return NextResponse.json(
            { error: '途中経過の取得に失敗しました', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
