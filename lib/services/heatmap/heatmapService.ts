/**
 * ヒートマップ（view ラベル）集計。
 * GTM が送る customEvent:view_label ごとのイベント数を、デバイス別に並べる。
 * ※ サーバー専用。クライアントは heatmapTypes を参照すること
 */

import type { Ga4Reporter } from '@/lib/api/ga4/report'
import { exact } from '@/lib/api/ga4/filters'
import { dim, metricInt, rowsOf } from '@/lib/api/ga4/rows'
import type { ViewLabelRow, ViewLabelsByDevice } from './heatmapTypes'

const VIEW_LABEL = 'customEvent:view_label'
const NOT_SET = '(not set)'

/** view_label が付いたイベントが 1 件でもあるページパス一覧（昇順） */
export async function runHeatmapPagePaths(reporter: Ga4Reporter): Promise<string[]> {
    const report = await reporter.run({
        dimensions: ['pagePath', VIEW_LABEL],
        metrics: ['eventCount'],
        limit: 5000,
    })
    const paths = new Set<string>()
    for (const row of rowsOf(report)) {
        const path = dim(row, 0)
        const label = dim(row, 1)
        if (path && path !== NOT_SET && label && label !== NOT_SET) paths.add(path)
    }
    return Array.from(paths).sort()
}

/**
 * view ラベル別イベント数をデバイス（mobile / desktop / tablet）ごとに降順で返す。
 * pagePath を渡すとそのページだけに絞る（EXACT）。
 */
export async function runViewLabelsByDevice(reporter: Ga4Reporter, pagePath?: string): Promise<ViewLabelsByDevice> {
    const path = pagePath?.trim() ?? ''
    const report = await reporter.run({
        dimensions: ['deviceCategory', VIEW_LABEL],
        metrics: ['eventCount'],
        dimensionFilter: path ? exact('pagePath', path) : undefined,
        limit: 1500,
    })

    const byDevice: Record<keyof ViewLabelsByDevice, Map<string, number>> = {
        mobile: new Map(),
        desktop: new Map(),
        tablet: new Map(),
    }
    for (const row of rowsOf(report)) {
        const device = dim(row, 0).toLowerCase() as keyof ViewLabelsByDevice
        const viewLabel = dim(row, 1).trim()
        if (!viewLabel || viewLabel === NOT_SET) continue
        const bucket = byDevice[device]
        if (!bucket) continue
        bucket.set(viewLabel, (bucket.get(viewLabel) ?? 0) + metricInt(row, 0))
    }

    const toRows = (map: Map<string, number>): ViewLabelRow[] =>
        Array.from(map, ([viewLabel, count]) => ({ viewLabel, count })).sort((a, b) => b.count - a.count)

    return { mobile: toRows(byDevice.mobile), desktop: toRows(byDevice.desktop), tablet: toRows(byDevice.tablet) }
}
