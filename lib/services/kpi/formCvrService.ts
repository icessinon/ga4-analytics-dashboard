/**
 * フォームの到達・完了を月次で返す（GA4 Data API）。
 *
 * **プロダクトDBでは取れない**（フォームを開いた数はサイト計測にしかない）ので、
 * 事業KPIの中でここだけ出典が GA4 になる。数字を並べるときは必ずその旨を出す。
 *
 * 定義は既存ページと揃える:
 * - 会員登録: 到達 = pagePath が /members/signup ちょうど、完了 = /members/signup/thanks 配下
 * - 応募: 到達 = view_label `EF__{key}__Area__Header`、完了 = click_label の送信ボタン
 *   （送信ボタンは入力完了まで disabled なのでクリック＝応募。2026-07-22 に求人広告 54 件で
 *     DynamoDB の実応募数と完全一致を確認済み。lib/services/cv/jobTypeLabels.ts 参照）
 *
 * 注意: 応募側はビューラベル基準なので「50%表示×1秒」の条件がかかり、page_view 基準より
 * 少なく出る。**完了率の水準ではなく種別間の差と時系列の変化で見る。**
 * ※ サーバー専用。
 */

import { anyOf, beginsWith, exact } from '@/lib/api/ga4/filters'
import type { Ga4Reporter } from '@/lib/api/ga4/report'
import { dim, metricInt, rowsOf } from '@/lib/api/ga4/rows'
import { JOB_TYPES, completeClickLabel, formLabel } from '@/lib/services/cv/jobTypeLabels'
import type { JobTypeKey, MonthlyFormCounts } from './businessKpiTypes'

const JOB_KEYS = JOB_TYPES.map((t) => t.key) as readonly JobTypeKey[]

const blank = (): MonthlyFormCounts => ({
    signupReach: 0, signupComplete: 0,
    entryReach: { JobR: 0, JobA: 0, JobH: 0 },
    entryComplete: { JobR: 0, JobA: 0, JobH: 0 },
    entryReachTotal: 0, entryCompleteTotal: 0,
})

/** GA4 の date（YYYYMMDD）→ 'YYYY-MM' */
const toMonth = (date: string) => `${date.slice(0, 4)}-${date.slice(4, 6)}`

/** ラベルから種別キーを引く。該当しなければ null */
function keyOfLabel(label: string, build: (k: string) => string): JobTypeKey | null {
    for (const k of JOB_KEYS) if (build(k) === label) return k
    return null
}

/**
 * 月次のフォーム到達・完了。reporter の期間は呼び出し側で与える。
 * 日別で取って月に畳むので、Data API の呼び出しは 4 回で済む。
 */
export async function runMonthlyFormCounts(reporter: Ga4Reporter): Promise<Map<string, MonthlyFormCounts>> {
    const reachFilter = anyOf('customEvent:view_label', JOB_KEYS.map(formLabel))
    const completeFilter = anyOf('customEvent:click_label', JOB_KEYS.map(completeClickLabel))

    const [signupReach, signupComplete, entryReach, entryComplete] = await reporter.runAll([
        { dimensions: ['date'], metrics: ['totalUsers'], dimensionFilter: exact('pagePath', '/members/signup'), limit: 1000 },
        { dimensions: ['date'], metrics: ['totalUsers'], dimensionFilter: beginsWith('pagePath', '/members/signup/thanks'), limit: 1000 },
        { dimensions: ['date', 'customEvent:view_label'], metrics: ['totalUsers'], dimensionFilter: reachFilter, limit: 5000 },
        { dimensions: ['date', 'customEvent:click_label'], metrics: ['totalUsers'], dimensionFilter: completeFilter, limit: 5000 },
    ])

    const byMonth = new Map<string, MonthlyFormCounts>()
    const at = (date: string) => {
        const m = toMonth(date)
        const cur = byMonth.get(m) ?? blank()
        byMonth.set(m, cur)
        return cur
    }

    for (const r of rowsOf(signupReach)) at(dim(r)).signupReach += metricInt(r)
    for (const r of rowsOf(signupComplete)) at(dim(r)).signupComplete += metricInt(r)
    for (const r of rowsOf(entryReach)) {
        const key = keyOfLabel(dim(r, 1), formLabel)
        if (!key) continue
        const c = at(dim(r))
        c.entryReach[key] += metricInt(r)
        c.entryReachTotal += metricInt(r)
    }
    for (const r of rowsOf(entryComplete)) {
        const key = keyOfLabel(dim(r, 1), completeClickLabel)
        if (!key) continue
        const c = at(dim(r))
        c.entryComplete[key] += metricInt(r)
        c.entryCompleteTotal += metricInt(r)
    }
    return byMonth
}
