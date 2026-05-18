import { NextResponse } from 'next/server'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const propertyId = searchParams.get('propertyId')

        if (!propertyId) {
            return NextResponse.json({ error: 'propertyId is required' }, { status: 400 })
        }

        const accessToken = await getGA4AccessToken()

        const baseRequest = {
            propertyId,
            dateRanges: [{ startDate: '90daysAgo', endDate: 'yesterday' }],
            metrics: ['eventCount'],
            limit: 10000,
        }

        const [clickResult, viewResult] = await Promise.all([
            fetchGA4Data({ ...baseRequest, dimensions: ['customEvent:click_label'] }, accessToken).catch(() => null),
            fetchGA4Data({ ...baseRequest, dimensions: ['customEvent:view_label'] }, accessToken).catch(() => null),
        ])

        const labels = new Set<string>()

        for (const row of clickResult?.rows ?? []) {
            const v = row.dimensionValues?.[0]?.value
            if (v && v !== '(not set)') labels.add(v)
        }
        for (const row of viewResult?.rows ?? []) {
            const v = row.dimensionValues?.[0]?.value
            if (v && v !== '(not set)') labels.add(v)
        }

        return NextResponse.json({ labels: Array.from(labels).sort() })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json({ error: 'Failed to fetch labels', message }, { status: 500 })
    }
}
