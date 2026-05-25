import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { fetchGA4Data, getGA4AccessToken, type GA4ReportRequest } from '@/lib/api/ga4/client'
import { calculateCVR, type CvrConfig, type CvrResult } from '@/lib/services/analytics/cvrService'
import { parseDateString } from '@/lib/utils/date'

interface GA4CvrConfig {
    denominatorDimension?: string
    denominatorLabels?: string[] | string
    denominatorFilters?: Array<{ dimension: string; operator: string; expression: string }>
    numeratorDimension?: string
    numeratorLabels?: string[] | string
    numeratorFilters?: Array<{ dimension: string; operator: string; expression: string }>
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

const ALLOWED_SEGMENT_DIMENSIONS = [
    'deviceCategory',
    'operatingSystem',
    'browser',
    'country',
    'sessionSource',
    'sessionMedium',
]

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

        const body = await request.json()
        const { segmentDimension = 'deviceCategory', startDate: reqStart, endDate: reqEnd } = body

        if (!ALLOWED_SEGMENT_DIMENSIONS.includes(segmentDimension)) {
            return NextResponse.json({ error: `segmentDimension must be one of: ${ALLOWED_SEGMENT_DIMENSIONS.join(', ')}` }, { status: 400 })
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

        const startDate = parseDateString(reqStart ?? abTest.startDate.toISOString().split('T')[0])
        const endDate = parseDateString(reqEnd ?? (abTest.endDate?.toISOString().split('T')[0] ?? 'yesterday'))

        const baseDimensions: Array<{ name: string }> = Array.isArray(ga4Config.dimensions)
            ? ga4Config.dimensions
            : typeof ga4Config.dimensions === 'string'
            ? ga4Config.dimensions.split(',').map((d) => ({ name: d.trim() }))
            : []

        const allDimensions = baseDimensions.some((d) => d.name === segmentDimension)
            ? baseDimensions
            : [...baseDimensions, { name: segmentDimension }]

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
            limit: ga4Config.limit || 50000,
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

        const segDimIdx = dimensionHeaders.findIndex((h) => h.name === segmentDimension)
        if (segDimIdx === -1) {
            return NextResponse.json({ error: 'セグメントディメンションが見つかりません' }, { status: 500 })
        }

        // Collect unique segment values
        const segmentValues = new Set<string>()
        for (const row of report.rows ?? []) {
            segmentValues.add(row.dimensionValues[segDimIdx]?.value ?? '(not set)')
        }

        type SegmentResult = {
            name: string
            dataA?: CvrResult
            dataB?: CvrResult
            dataC?: CvrResult
            dataD?: CvrResult
        }

        const calcForReport = (rows: typeof report.rows): SegmentResult => {
            const sub = { ...report, rows: rows ?? [] }
            const result: SegmentResult = { name: '' }
            if (ga4Config.cvrA) result.dataA = calculateCVR(sub, normalizeCvrConfig(ga4Config.cvrA!), dimensionHeaders, metricHeaders)
            if (ga4Config.cvrB) result.dataB = calculateCVR(sub, normalizeCvrConfig(ga4Config.cvrB!), dimensionHeaders, metricHeaders)
            if (ga4Config.cvrC) result.dataC = calculateCVR(sub, normalizeCvrConfig(ga4Config.cvrC!), dimensionHeaders, metricHeaders)
            if (ga4Config.cvrD) result.dataD = calculateCVR(sub, normalizeCvrConfig(ga4Config.cvrD!), dimensionHeaders, metricHeaders)
            return result
        }

        // Total (all segments combined)
        const totalResult = calcForReport(report.rows)
        totalResult.name = '全体'

        // Per-segment breakdown
        const segments: SegmentResult[] = []
        for (const segVal of [...segmentValues].sort()) {
            const filteredRows = (report.rows ?? []).filter(
                (r) => (r.dimensionValues[segDimIdx]?.value ?? '(not set)') === segVal
            )
            const seg = calcForReport(filteredRows)
            seg.name = segVal

            const totalPV = (seg.dataA?.pv ?? 0) + (seg.dataB?.pv ?? 0) + (seg.dataC?.pv ?? 0) + (seg.dataD?.pv ?? 0)
            if (totalPV > 0) segments.push(seg)
        }

        // Sort segments by total PV descending
        segments.sort((a, b) => {
            const pvA = (a.dataA?.pv ?? 0) + (a.dataB?.pv ?? 0)
            const pvB = (b.dataA?.pv ?? 0) + (b.dataB?.pv ?? 0)
            return pvB - pvA
        })

        return NextResponse.json({
            success: true,
            abTestName: abTest.name,
            startDate,
            endDate,
            segmentDimension,
            segments: [totalResult, ...segments],
        })
    } catch (error) {
        console.error('AB Test Segment API Error:', error)
        return NextResponse.json(
            { error: 'セグメント分析に失敗しました', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
