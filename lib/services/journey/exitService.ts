import { and, exact, type Ga4FilterExpression } from '@/lib/api/ga4/filters'
import type { Ga4Reporter } from '@/lib/api/ga4/report'
import { dim, firstMetricInt, metricFloat, metricInt, rowsOf } from '@/lib/api/ga4/rows'
import { categorizePath, categoryPathFilter } from './pathCategories'
import type { ExitReport } from './exitTypes'

/**
 * ページカテゴリで組んだファネルの各ステップのセッション数と、カテゴリ別の離脱傾向。
 * GA4 Data API に exits が無いので、離脱傾向 = 直帰率の PV 加重平均で代替している。
 */
export async function runExitReport(reporter: Ga4Reporter, steps: string[], deviceFilter?: string): Promise<ExitReport> {
    const devFilter: Ga4FilterExpression | null = deviceFilter ? exact('deviceCategory', deviceFilter) : null
    const withDevice = (f: Ga4FilterExpression) => (devFilter ? and(f, devFilter) : f)

    // ステップごとにセッション数を並列取得（フィルタ定義の無いカテゴリは 0）
    const stepQueries = steps.map((step) => {
        const stepFilter = categoryPathFilter(step)
        if (!stepFilter) return Promise.resolve(null)
        return reporter.run({ metrics: ['sessions'], dimensionFilter: withDevice(stepFilter), limit: 1 })
    })

    // ページ別バウンス率取得（exits は GA4 API 非対応のため代替）＋行動シグナル
    const exitQuery = reporter.run({
        dimensions: ['pagePath'],
        metrics: ['screenPageViews', 'bounceRate', 'activeUsers', 'scrolledUsers', 'userEngagementDuration'],
        dimensionFilter: devFilter ?? undefined,
        limit: 5000,
    })

    const [exitReport, ...stepResults] = await Promise.all([exitQuery, ...stepQueries])

    const rawSteps = steps.map((name, i) => ({ name, sessions: stepResults[i] ? firstMetricInt(stepResults[i]) : 0 }))
    const processedSteps = rawSteps.map((step, i) => {
        const prev = i > 0 ? rawSteps[i - 1].sessions : step.sessions
        const firstStep = rawSteps[0].sessions
        const dropoff = i > 0 ? Math.max(0, prev - step.sessions) : 0
        return {
            name: step.name,
            sessions: step.sessions,
            dropoff,
            dropoffRate: i > 0 && prev > 0 ? dropoff / prev : 0,
            retentionFromFirst: firstStep > 0 ? step.sessions / firstStep : 1,
        }
    })

    // 離脱ページ集計（カテゴリ別）
    // exitRate = 1 - engagementRate（低エンゲージ = 離脱しやすい）
    // estimatedExits = screenPageViews × (1 - engagementRate)
    const exitMap = new Map<string, { pageViews: number; bounceWeightedSum: number; users: number; scrolled: number; engagementSec: number }>()
    for (const row of rowsOf(exitReport)) {
        const pageViews = metricInt(row, 0)
        if (pageViews === 0) continue
        const cat = categorizePath(dim(row))
        if (cat === 'その他') continue
        const existing = exitMap.get(cat) || { pageViews: 0, bounceWeightedSum: 0, users: 0, scrolled: 0, engagementSec: 0 }
        exitMap.set(cat, {
            pageViews: existing.pageViews + pageViews,
            bounceWeightedSum: existing.bounceWeightedSum + metricFloat(row, 1) * pageViews,
            users: existing.users + metricInt(row, 2),
            scrolled: existing.scrolled + metricInt(row, 3),
            engagementSec: existing.engagementSec + metricFloat(row, 4),
        })
    }

    const exitCategories = [...exitMap.entries()]
        .map(([page, d]) => {
            const exitRate = d.pageViews > 0 ? d.bounceWeightedSum / d.pageViews : 0
            return {
                page,
                exits: Math.round(exitRate * d.pageViews),
                pageViews: d.pageViews,
                exitRate,
                engagementRate: 1 - exitRate,
                avgEngagementSec: d.users > 0 ? d.engagementSec / d.users : 0,
                scrollRate: d.users > 0 ? Math.min(1, d.scrolled / d.users) : 0,
            }
        })
        .filter((d) => d.pageViews >= 50)
        .sort((a, b) => b.exits - a.exits)
        .slice(0, 20)

    return { steps: processedSteps, exitCategories }
}
