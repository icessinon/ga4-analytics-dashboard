import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { fetchGA4Data, getGA4AccessToken, type GA4ReportRequest } from '@/lib/api/ga4/client'
import { calculateCVR, type CvrConfig } from '@/lib/services/analytics/cvrService'
import { buildGa4ConfigDimensionFilter } from '@/lib/services/ab-test/ga4ConfigFilter'
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
    excludeFilter?: { dimension?: string; operator?: string; expression?: string }
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

        ga4Request.dimensionFilter = buildGa4ConfigDimensionFilter(ga4Config)

        const activeVariants = VARIANT_KEYS.filter((v) => ga4Config[`cvr${v}`])

        const elapsedDays = Math.max(
            1,
            Math.floor((new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) / 86400000) + 1
        )

        // レポート（行集合）からバリアント別CVR・有意差・リードをまとめて計算する
        type GA4Report = Parameters<typeof calculateCVR>[0]
        const computeResults = (report: GA4Report) => {
            const dimensionHeaders = report.dimensionHeaders || []
            const metricHeaders = report.metricHeaders || []
            const variants = activeVariants.map((key) => {
                const result = calculateCVR(report, normalizeCvrConfig(ga4Config[`cvr${key}`]!), dimensionHeaders, metricHeaders)
                return {
                    key,
                    pv: result.pv,
                    cv: result.cv,
                    cvr: result.cvr,
                    // 複数ラベル指定時に「どのラベルが何件か」を表示するための内訳
                    pvByLabel: result.pvByLabel,
                    cvByLabel: result.cvByLabel,
                }
            })
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
            return { variants, comparisons, leader }
        }

        // フィルタ式が複数（カンマ区切りOR）のときは、フィルタディメンションを1列足した
        // 別レポートを取り、式ごとの内訳も計算する（全体の数値は従来レポートのまま変えない）
        const filterExpressions = (ga4Config.filter?.dimension && ga4Config.filter?.expression)
            ? ga4Config.filter.expression.split(',').map((s) => s.trim()).filter(Boolean)
            : []
        const needBreakdown = filterExpressions.length >= 2

        const segmentRequest: GA4ReportRequest | null = needBreakdown
            ? {
                ...ga4Request,
                dimensions: dimensions.some((d) => d.name === ga4Config.filter!.dimension)
                    ? dimensions
                    : [...dimensions, { name: ga4Config.filter!.dimension! }],
                limit: Math.max(ga4Config.limit || 0, 50000),
            }
            : null

        const [report, segmentReport] = await Promise.all([
            fetchGA4Data(ga4Request, accessToken),
            segmentRequest ? fetchGA4Data(segmentRequest, accessToken) : Promise.resolve(null),
        ])

        const { variants, comparisons, leader } = computeResults(report)

        // フィルタ式ごとの内訳: フィルタディメンション値が式にマッチする行だけで再計算
        const matchValue = (value: string, operator: string, expr: string): boolean => {
            switch (operator.toUpperCase()) {
                case 'EXACT': return value === expr
                case 'BEGINS_WITH': return value.startsWith(expr)
                case 'ENDS_WITH': return value.endsWith(expr)
                case 'FULL_REGEXP': try { return new RegExp(`^(?:${expr})$`).test(value) } catch { return false }
                case 'PARTIAL_REGEXP': try { return new RegExp(expr).test(value) } catch { return false }
                default: return value.includes(expr) // CONTAINS
            }
        }
        let filterSegments: Array<{ expression: string } & ReturnType<typeof computeResults>> | undefined
        if (segmentReport) {
            const segHeaders = segmentReport.dimensionHeaders || []
            const filterDimIndex = segHeaders.findIndex((h: { name: string }) => h.name === ga4Config.filter!.dimension)
            if (filterDimIndex >= 0) {
                const operator = ga4Config.filter!.operator || 'CONTAINS'
                filterSegments = filterExpressions.map((expr) => {
                    const rows = (segmentReport.rows || []).filter(
                        (r: { dimensionValues?: Array<{ value?: string }> }) =>
                            matchValue(r.dimensionValues?.[filterDimIndex]?.value ?? '', operator, expr)
                    )
                    return { expression: expr, ...computeResults({ ...segmentReport, rows }) }
                })
            }
        }

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
            // フィルタ式が複数のときのみ: 式ごとの内訳（UIで全体⇔式別を切り替え表示）
            filterDimension: needBreakdown ? ga4Config.filter?.dimension : undefined,
            filterSegments,
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
