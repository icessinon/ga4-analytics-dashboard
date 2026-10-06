/**
 * GTM が送る click_label / view_label の値一覧。
 * LabelInput の補完候補（LabelContext）が使う。直近 90 日に 1 件でも出たラベルを集める。
 * ※ サーバー専用
 */

import type { Ga4Reporter } from '@/lib/api/ga4/report'
import { dim, rowsOf } from '@/lib/api/ga4/rows'

const NOT_SET = '(not set)'

export async function runLabelCatalog(reporter: Ga4Reporter): Promise<string[]> {
    const base = { metrics: ['eventCount'], limit: 10000 }
    // どちらかのカスタム次元が未登録のプロパティでも片方は返せるよう、失敗は null で握る
    const [clickResult, viewResult] = await Promise.all([
        reporter.run({ ...base, dimensions: ['customEvent:click_label'] }).catch(() => null),
        reporter.run({ ...base, dimensions: ['customEvent:view_label'] }).catch(() => null),
    ])

    const labels = new Set<string>()
    for (const row of [...rowsOf(clickResult), ...rowsOf(viewResult)]) {
        const v = dim(row, 0)
        if (v && v !== NOT_SET) labels.add(v)
    }
    return Array.from(labels).sort()
}
