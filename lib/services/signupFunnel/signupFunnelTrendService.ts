import { beginsWith, exact } from '@/lib/api/ga4/filters'
import type { Ga4Reporter } from '@/lib/api/ga4/report'
import { dim, metricInt, rowsOf } from '@/lib/api/ga4/rows'
import { BTN_LABEL_TO_FORM, JOBS_BTN_LABEL } from './signupFormLabels'
import type { SignupTrendReport } from './signupFunnelTypes'

/**
 * 会員登録フォームの推移（職種別×全体）。
 * - 流入: 職種選択ボタンクリック（SU__Jobs__Btn__{職種名}）を日別×職種別に集計
 * - 完了: /members/signup/thanks の ?occ= パラメータで職種別に分解
 * - 全体フォーム到達: pagePath=/members/signup のユーザー数（参考値）
 * 完走率 = 完了 / 職種選択クリック。
 */
export async function runSignupTrendReport(reporter: Ga4Reporter): Promise<SignupTrendReport> {
    const [clicksReport, thanksReport, formReport] = await reporter.runAll([
        { dimensions: ['date', 'customEvent:click_label'], metrics: ['totalUsers'], dimensionFilter: beginsWith('customEvent:click_label', 'SU__Jobs__Btn__'), limit: 5000 },
        { dimensions: ['date', 'pagePathPlusQueryString'], metrics: ['totalUsers'], dimensionFilter: beginsWith('pagePathPlusQueryString', '/members/signup/thanks'), limit: 5000 },
        { dimensions: ['date'], metrics: ['totalUsers'], dimensionFilter: exact('pagePath', '/members/signup'), limit: 400 },
    ])

    // 日付の全集合（イベントがない日も0で埋めるため昇順ソート）
    const dateSet = new Set<string>()
    for (const r of [...rowsOf(clicksReport), ...rowsOf(thanksReport), ...rowsOf(formReport)]) {
        const d = dim(r)
        if (d) dateSet.add(d)
    }
    const dates = [...dateSet].sort()
    const dateIndex = new Map(dates.map((d, i) => [d, i]))
    const zeros = () => dates.map(() => 0)

    const clicksByForm = new Map<string, number[]>()
    const completedByForm = new Map<string, number[]>()
    const overallClicks = zeros()
    const overallCompleted = zeros()
    const overallFormUsers = zeros()

    for (const r of rowsOf(clicksReport)) {
        const i = dateIndex.get(dim(r, 0))
        const btnLabel = dim(r, 1).replace('SU__Jobs__Btn__', '')
        const users = metricInt(r)
        if (i == null) continue
        const form = BTN_LABEL_TO_FORM[btnLabel]
        overallClicks[i] += users
        if (form) {
            if (!clicksByForm.has(form)) clicksByForm.set(form, zeros())
            clicksByForm.get(form)![i] += users
        }
    }

    for (const r of rowsOf(thanksReport)) {
        const i = dateIndex.get(dim(r, 0))
        const path = dim(r, 1)
        const users = metricInt(r)
        if (i == null) continue
        overallCompleted[i] += users
        const occ = path.match(/[?&]occ=([A-Za-z]+)/)?.[1]
        if (occ && JOBS_BTN_LABEL[occ]) {
            if (!completedByForm.has(occ)) completedByForm.set(occ, zeros())
            completedByForm.get(occ)![i] += users
        }
    }

    for (const r of rowsOf(formReport)) {
        const i = dateIndex.get(dim(r, 0))
        if (i != null) overallFormUsers[i] = metricInt(r)
    }

    const formKeys = new Set([...clicksByForm.keys(), ...completedByForm.keys()])
    const forms = [...formKeys]
        .map((key) => ({
            key,
            label: JOBS_BTN_LABEL[key] ?? key,
            clicks: clicksByForm.get(key) ?? zeros(),
            completed: completedByForm.get(key) ?? zeros(),
        }))
        .sort((a, b) => b.clicks.reduce((s, n) => s + n, 0) - a.clicks.reduce((s, n) => s + n, 0))

    return { dates, overall: { clicks: overallClicks, completed: overallCompleted, formUsers: overallFormUsers }, forms }
}
