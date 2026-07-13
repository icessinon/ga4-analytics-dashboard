import { NextResponse } from 'next/server'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { parseDateString } from '@/lib/utils/date'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const {
            propertyId,
            startDate,
            endDate,
            metrics,
            dimensions,
            filter,
            limit = 10000,
            accessToken: customToken,
        } = body

        if (!propertyId) {
            return NextResponse.json(
                { error: 'propertyId is required' },
                { status: 400 }
            )
        }

        const accessToken = await getGA4AccessToken(customToken)
        const parsedStartDate = parseDateString(startDate || 'yesterday')
        const parsedEndDate = parseDateString(endDate || 'yesterday')

        const ga4Request: any = {
            propertyId,
            dateRanges: [{ startDate: parsedStartDate, endDate: parsedEndDate }],
            dimensions: dimensions || [],
            metrics: metrics || [],
            limit,
            // 国ディメンションを扱うクエリではデフォルトの country=Japan フィルタを外す
            includeAllCountries:
                (dimensions || []).some((d: unknown) => (typeof d === 'string' ? d : (d as { name?: string })?.name) === 'country') ||
                filter?.dimension === 'country',
        }

        if (filter?.dimension && filter?.operator && filter?.expression) {
            const expressions = filter.expression
                .split(',')
                .map((s: string) => s.trim())
                .filter(Boolean)

            if (expressions.length === 0) {
                // フィルタ式が空白の場合はフィルタを適用しない
            } else if (expressions.length > 1) {
                ga4Request.dimensionFilter = {
                    orGroup: {
                        expressions: expressions.map((exp: string) => ({
                            filter: {
                                fieldName: filter.dimension,
                                stringFilter: {
                                    matchType: filter.operator.toUpperCase(),
                                    value: exp,
                                },
                            },
                        })),
                    },
                }
            } else {
                ga4Request.dimensionFilter = {
                    filter: {
                        fieldName: filter.dimension,
                        stringFilter: {
                            matchType: filter.operator.toUpperCase(),
                            value: expressions[0],
                        },
                    },
                }
            }
        }

        const report = await fetchGA4Data(ga4Request, accessToken)

        const tableData = report.rows?.map((row) => {
            const rowData: any = {}

            report.dimensionHeaders?.forEach((header, index) => {
                rowData[header.name] = row.dimensionValues?.[index]?.value || ''
            })

            report.metricHeaders?.forEach((header, index) => {
                rowData[header.name] = row.metricValues?.[index]?.value || '0'
            })

            return rowData
        }) || []

        return NextResponse.json({
            success: true,
            data: {
                dimensionHeaders: report.dimensionHeaders || [],
                metricHeaders: report.metricHeaders || [],
                rows: tableData,
                rowCount: report.rowCount || 0,
            },
        })
    } catch (error) {
        console.error('GA4 Data API Error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json(
            {
                error: 'Failed to fetch GA4 data',
                message: errorMessage,
            },
            { status: 500 }
        )
    }
}
