import { and, anyOf, beginsWith, contains, exact, not } from '@/lib/api/ga4/filters'
import type { Ga4Reporter } from '@/lib/api/ga4/report'
import { dim, firstMetricInt, metricInt, rowsOf } from '@/lib/api/ga4/rows'
import type { CvTypeRow, CvTypesDailyPoint, CvTypesReport } from './cvTypesTypes'
import { FORM_FIELDS, JOB_TYPES, LIST_PATHS, channelKey, completeClickLabel, detailLabel, fieldLabel, formLabel } from './jobTypeLabels'

/**
 * 求人種別CV分析。
 * drm-front の GTM ラベル規則（contractType 別の JobR/JobA/JobH セクション）を利用して
 * 「応募CV」を人材紹介 / 求人広告 / ハローワークに分解し、会員登録と並べて返す。
 * 注: ビューラベルは「50%表示×1秒」条件のため page_view ベースの CV より少なく出る（構成比・比較用）。
 */
export async function runCvTypesReport(reporter: Ga4Reporter): Promise<CvTypesReport> {
    const viewLabelFilter = anyOf('customEvent:view_label', JOB_TYPES.flatMap((t) => [formLabel(t.key), detailLabel(t.key)]))
    const clickLabelFilter = anyOf('customEvent:click_label', JOB_TYPES.map((t) => completeClickLabel(t.key)))
    const detailLabelFilter = anyOf('customEvent:view_label', JOB_TYPES.map((t) => detailLabel(t.key)))
    const listReferrerFilter = anyOf('pageReferrer', LIST_PATHS.map((p) => `x-work.jp/${p}`), 'CONTAINS')

    const [labelReport, clickReport, clickDaily, signupForm, signupThanks, signupDaily, channelReport, viaListReport, listPagesReport, fieldReport, siteChannelReport] = await reporter.runAll([
        // 種別×ステージ（詳細・フォーム）のユーザー数（ビューラベル別）
        { dimensions: ['customEvent:view_label'], metrics: ['totalUsers'], dimensionFilter: viewLabelFilter, limit: 50 },
        // 完了（送信ボタンクリック）のユーザー数
        { dimensions: ['customEvent:click_label'], metrics: ['totalUsers'], dimensionFilter: clickLabelFilter, limit: 50 },
        // 完了クリックの日別推移
        { dimensions: ['date', 'customEvent:click_label'], metrics: ['totalUsers'], dimensionFilter: clickLabelFilter, limit: 1000 },
        // 会員登録: フォーム到達
        { metrics: ['totalUsers'], dimensionFilter: exact('pagePath', '/members/signup'), limit: 1 },
        // 会員登録: 完了
        { metrics: ['totalUsers'], dimensionFilter: beginsWith('pagePath', '/members/signup/thanks'), limit: 1 },
        // 会員登録: 完了の日別推移
        { dimensions: ['date'], metrics: ['totalUsers'], dimensionFilter: beginsWith('pagePath', '/members/signup/thanks'), limit: 200 },
        // 詳細閲覧の流入チャネル内訳（種別×チャネル）
        { dimensions: ['customEvent:view_label', 'sessionDefaultChannelGroup'], metrics: ['totalUsers'], dimensionFilter: detailLabelFilter, limit: 200 },
        // 一覧（検索・職種一覧）経由で詳細に到達したユーザー（referrer近似）
        { dimensions: ['customEvent:view_label'], metrics: ['totalUsers'], dimensionFilter: and(detailLabelFilter, listReferrerFilter), limit: 50 },
        // 一覧（検索・職種一覧）ページ自体の閲覧UU（詳細/media_を除く）
        {
            metrics: ['totalUsers'],
            dimensionFilter: and(
                anyOf('pagePath', LIST_PATHS.map((p) => `/${p}`), 'BEGINS_WITH'),
                not(contains('pagePath', '/media_')),
            ),
            limit: 1,
        },
        // 応募フォームの項目別タップ（EF__{key}__Field__{項目}）
        {
            dimensions: ['customEvent:click_label'],
            metrics: ['totalUsers'],
            dimensionFilter: and(beginsWith('customEvent:click_label', 'EF__'), contains('customEvent:click_label', '__Field__')),
            limit: 200,
        },
        // サイト全体の流入チャネル構成（セッション）
        { dimensions: ['sessionDefaultChannelGroup'], metrics: ['sessions', 'activeUsers'], limit: 30 },
    ])

    const labelUsers = new Map<string, number>()
    for (const r of rowsOf(labelReport)) labelUsers.set(dim(r), metricInt(r))
    for (const r of rowsOf(clickReport)) labelUsers.set(dim(r), metricInt(r))

    // 種別×チャネル（organic/direct/crm/paid/other）
    const channelByType = new Map<string, Partial<Record<ReturnType<typeof channelKey>, number>>>()
    for (const r of rowsOf(channelReport)) {
        const label = dim(r, 0)
        const group = dim(r, 1)
        const users = metricInt(r)
        const type = JOB_TYPES.find((t) => label === detailLabel(t.key))
        if (!type) continue
        const entry = channelByType.get(type.key) ?? {}
        const k = channelKey(group)
        entry[k] = (entry[k] ?? 0) + users
        channelByType.set(type.key, entry)
    }
    const viaListByType = new Map<string, number>()
    for (const r of rowsOf(viaListReport)) {
        const label = dim(r)
        const type = JOB_TYPES.find((t) => label === detailLabel(t.key))
        if (type) viaListByType.set(type.key, metricInt(r))
    }

    const fieldUsers = new Map<string, number>()
    for (const r of rowsOf(fieldReport)) fieldUsers.set(dim(r), metricInt(r))

    const jobTypes: CvTypeRow[] = JOB_TYPES.map((t) => {
        const detail = labelUsers.get(detailLabel(t.key)) ?? 0
        const form = labelUsers.get(formLabel(t.key)) ?? 0
        const completed = labelUsers.get(completeClickLabel(t.key)) ?? 0
        const fields = FORM_FIELDS.map((f) => ({ name: f, users: fieldUsers.get(fieldLabel(t.key, f)) ?? 0 }))
        const ch = channelByType.get(t.key) ?? {}
        const viaList = viaListByType.get(t.key) ?? 0
        return {
            key: t.key,
            label: t.label,
            detailViews: detail,
            formViews: form,
            completed,
            detailToForm: detail > 0 ? form / detail : null,
            formToComplete: form > 0 ? completed / form : null,
            overallRate: detail > 0 ? completed / detail : null,
            channels: {
                organic: ch.organic ?? 0,
                direct: ch.direct ?? 0,
                crm: ch.crm ?? 0,
                paid: ch.paid ?? 0,
                other: ch.other ?? 0,
            },
            viaList,
            viaListRate: detail > 0 ? viaList / detail : null,
            fields,
        }
    })

    // 日別推移（種別ごと・完了クリック）
    const dailyMap = new Map<string, Record<string, number>>()
    for (const r of rowsOf(clickDaily)) {
        const date = dim(r, 0)
        const label = dim(r, 1)
        const users = metricInt(r)
        const type = JOB_TYPES.find((t) => label === completeClickLabel(t.key))
        if (!type || !date) continue
        if (!dailyMap.has(date)) dailyMap.set(date, {})
        const entry = dailyMap.get(date) as Record<string, number>
        entry[type.key] = (entry[type.key] ?? 0) + users
    }
    for (const r of rowsOf(signupDaily)) {
        const date = dim(r)
        if (!date) continue
        if (!dailyMap.has(date)) dailyMap.set(date, {})
        const entry = dailyMap.get(date) as Record<string, number>
        entry.signup = metricInt(r)
    }
    const daily: CvTypesDailyPoint[] = [...dailyMap.entries()]
        .map(([date, values]) => ({ date, ...values }))
        .sort((a, b) => a.date.localeCompare(b.date))

    const signupFormUsers = firstMetricInt(signupForm)
    const signupCompleted = firstMetricInt(signupThanks)
    const listViews = firstMetricInt(listPagesReport)

    // サイト全体の流入チャネル構成（セッションシェア）
    const channelMix = rowsOf(siteChannelReport)
        .map((r) => ({
            channel: dim(r) || '(not set)',
            sessions: metricInt(r, 0),
            users: metricInt(r, 1),
        }))
        .sort((a, b) => b.sessions - a.sessions)

    return {
        jobTypes,
        listViews,
        channelMix,
        signup: {
            formViews: signupFormUsers,
            completed: signupCompleted,
            formToComplete: signupFormUsers > 0 ? signupCompleted / signupFormUsers : null,
        },
        daily,
    }
}
