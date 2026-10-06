import { beginsWith, exact, or, type Ga4FilterExpression } from '@/lib/api/ga4/filters'
import type { Ga4Reporter } from '@/lib/api/ga4/report'
import { dim, firstMetricInt, metricInt, rowsOf } from '@/lib/api/ga4/rows'
import { JOBS_BTN_LABEL } from './signupFormLabels'
import type { SignupFunnelQuestion, SignupFunnelReport } from './signupFunnelTypes'

/**
 * 会員登録フォームファネル（ラベル自動復元方式）。
 * 固定ラベルを埋め込まず、期間内に実際に発火した SU__{Form}__ ラベルから
 * 質問構造（変種・ステップ番号・質問文）を復元して集計する。
 * これにより ABテストのサフィックス（__B-1234）やステップ番号の振り直し、
 * 質問文の変更があってもコード変更なしで追従できる。
 *
 * ラベル規則:
 *   画面表示: SU__{Form}__Area__Step{N}_{質問文}[__B-{issue}]
 *   クリック: SU__{Form}__Label__Step{N}_{選択肢|次へ}[__B-{issue}]
 *   職種選択: SU__Jobs__Btn__{職種名}
 * 変種間でステップ番号がズレる（短縮版で1つ前倒し等）ため、
 * 質問文ベースでグルーピングし、クリックは変種ごとの (variant, step)→質問 対応で割り当てる。
 */

type LabelField = 'view_label' | 'click_label'

interface ParsedLabel {
    raw: string
    form: string
    element: string // Area | Label | Btn
    step: string | null // Step0..StepN | StepLast
    stepNum: number | null
    text: string | null
    variant: string // '' = 無印
    users: number
}

function parseLabel(raw: string, users: number): ParsedLabel | null {
    const parts = raw.split('__')
    if (parts.length < 4 || parts[0] !== 'SU') return null
    let variant = ''
    if (/^B-\d+$/.test(parts[parts.length - 1])) {
        variant = parts.pop() as string
    }
    const [, form, element] = parts
    const rest = parts.slice(3).join('__')
    const m = rest.match(/^(Step\d+|StepLast)_(.+)$/)
    return {
        raw,
        form,
        element,
        step: m ? m[1] : null,
        stepNum: m ? (m[1] === 'StepLast' ? 999 : parseInt(m[1].slice(4), 10)) : null,
        text: m ? m[2] : rest,
        variant,
        users,
    }
}

async function fetchLabels(reporter: Ga4Reporter, field: LabelField): Promise<ParsedLabel[]> {
    const res = await reporter.run({
        dimensions: [`customEvent:${field}`],
        metrics: ['totalUsers'],
        dimensionFilter: beginsWith(`customEvent:${field}`, 'SU__'),
        limit: 1000,
    })
    const out: ParsedLabel[] = []
    for (const r of rowsOf(res)) {
        const p = parseLabel(dim(r), metricInt(r))
        if (p) out.push(p)
    }
    return out
}

// 「？」等を含むラベルは inList/EXACT でヒットしないことがあるため、
// その場合のみ「？」手前までの BEGINS_WITH で照合する（質問文は？手前で一意）
function labelExpression(field: string, label: string): Ga4FilterExpression {
    if (label.includes('？')) return beginsWith(field, label.split('？')[0])
    return exact(field, label)
}

/** ラベル群のどれかに当たったユニークユーザー数（日次の合算ではなく期間ユニーク） */
async function distinctUsers(reporter: Ga4Reporter, field: LabelField, labels: string[]): Promise<number> {
    if (labels.length === 0) return 0
    const fieldName = `customEvent:${field}`
    const res = await reporter.run({
        metrics: ['totalUsers'],
        dimensionFilter: or(...labels.map((l) => labelExpression(fieldName, l))),
        limit: 1,
    })
    return firstMetricInt(res)
}

/** 対象期間にフォームのラベルが 1 つも無ければ null（route は 404 にする） */
export async function runSignupFunnelReport(reporter: Ga4Reporter, requestedForm?: string): Promise<SignupFunnelReport | null> {
    const [views, clicks] = await Promise.all([fetchLabels(reporter, 'view_label'), fetchLabels(reporter, 'click_label')])

    // フォーム一覧（Areaラベルを持つもの）
    const formUsers = new Map<string, number>()
    for (const v of views) {
        if (v.element === 'Area' && v.step) formUsers.set(v.form, (formUsers.get(v.form) ?? 0) + v.users)
    }
    const forms = [...formUsers.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([key]) => ({ key, label: JOBS_BTN_LABEL[key] ?? key }))
    if (forms.length === 0) return null
    const form = requestedForm && formUsers.has(requestedForm) ? requestedForm : forms[0].key

    // 変種ごとの step→質問文 対応（Areaラベルから復元）
    const areaLabels = views.filter((v) => v.form === form && v.element === 'Area' && v.step && v.text)
    const stepToQuestion = new Map<string, string>() // `${variant}|${step}` -> 質問文
    for (const a of areaLabels) {
        const key = `${a.variant}|${a.step}`
        // 同一(variant, step)に複数質問文がある場合はユーザー数の多い方を採用
        if (!stepToQuestion.has(key)) stepToQuestion.set(key, a.text as string)
    }

    // 質問文ベースでグルーピング（変種横断）。表示順は最小ステップ番号
    interface Question { name: string; minStep: number; viewLabels: string[]; clickLabels: string[] }
    const questions = new Map<string, Question>()
    for (const a of areaLabels) {
        const q = questions.get(a.text as string) ?? { name: a.text as string, minStep: a.stepNum as number, viewLabels: [], clickLabels: [] }
        q.minStep = Math.min(q.minStep, a.stepNum as number)
        q.viewLabels.push(a.raw)
        questions.set(a.text as string, q)
    }

    // クリックを (variant, step) 対応で質問に割り当て（「戻る」は前進でないため除外）
    let unassignedClicks = 0
    for (const c of clicks) {
        if (c.form !== form || c.element !== 'Label' || !c.step || c.text === '戻る') continue
        const qName = stepToQuestion.get(`${c.variant}|${c.step}`)
        const q = qName ? questions.get(qName) : undefined
        if (q) q.clickLabels.push(c.raw)
        else unassignedClicks += c.users
    }

    const ordered = [...questions.values()].sort((a, b) => a.minStep - b.minStep)

    // 起点: 職種選択ボタンのクリック
    const jobsBtn = JOBS_BTN_LABEL[form]
    const originPromise = jobsBtn ? distinctUsers(reporter, 'click_label', [`SU__Jobs__Btn__${jobsBtn}`]) : Promise.resolve(null)

    // 質問ごとの実ユーザー数（同時実行を抑えつつ並列化）
    const results: SignupFunnelQuestion[] = []
    const CHUNK = 3
    for (let i = 0; i < ordered.length; i += CHUNK) {
        const chunk = ordered.slice(i, i + CHUNK)
        const rows = await Promise.all(chunk.map(async (q) => {
            const [view, click] = await Promise.all([
                distinctUsers(reporter, 'view_label', q.viewLabels),
                distinctUsers(reporter, 'click_label', q.clickLabels),
            ])
            return { name: q.name, view, click, variants: new Set(q.viewLabels.map((l) => parseLabel(l, 0)?.variant ?? '')).size }
        }))
        results.push(...rows)
    }
    const origin = await originPromise

    return { forms, form, formLabel: JOBS_BTN_LABEL[form] ?? form, origin, questions: results, unassignedClicks }
}
