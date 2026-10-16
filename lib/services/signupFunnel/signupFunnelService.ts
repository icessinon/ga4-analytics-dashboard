import { beginsWith, exact, or, type Ga4FilterExpression } from '@/lib/api/ga4/filters'
import type { Ga4Reporter } from '@/lib/api/ga4/report'
import { dim, firstMetricInt, metricInt, rowsOf } from '@/lib/api/ga4/rows'
import { runGa4EventsQuery } from '@/lib/bq/ga4EventsClient'
import { JOBS_BTN_LABEL } from './signupFormLabels'
import type { SignupFunnelDb, SignupFunnelDbCounts, SignupFunnelQuestion, SignupFunnelReport } from './signupFunnelTypes'

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
 *
 * **骨格は click ラベルから作る。** ステップ見出しの view ラベルは GTM の要素可視性トリガーが
 * ページ読み込み時点の DOM しか見ないため **1問目しか発火しない**（2026-10 実測: Driver の
 * Step2_資格 533UU に対し Step3_郵便番号 4UU）。view を構造の正にすると2問目以降が丸ごと
 * 落ち、クリックの大半が未割当になる。view は「質問名」と「見たのに答えなかった人」を
 * 補足するための副データとして扱う。
 *
 * フェーズ: 2段階フォーム（drm-front buildStagedStepList・2026-10-06 恒久化）は
 * パスワードで会員が成立し、そこから先が職種別設問。「登録する」で終わるクリックラベルの
 * ステップを会員成立ラインとし、以降をフェーズ2として分ける。
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
    if (/^[A-D]-\d+$/.test(parts[parts.length - 1])) {
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

/** 会員成立ラインの進行ボタン。1880 の「まずは無料登録する」も拾う */
const REGISTER_BUTTON = /登録する$/

/**
 * view ラベルが無い質問の表示名。2段階フォームのフェーズ1は
 * 職種選択 → 資格 → 郵便番号 → 氏名+生まれ年 → 携帯/メール → パスワード で全職種共通なので、
 * 会員成立ラインからの相対位置で当てる（資格の無い職種・職種選択を省く流入でも番号がずれない）。
 * 文字列は drm-front RegisterSection.tsx の data-view-label と同じにして、
 * view ラベルが出た分と同じ質問に合流させる。並び替えが入ると外れるため nameInferred を立てる。
 */
const STAGED_PHASE1_NAMES: Record<number, string> = {
    0: 'パスワード',
    [-1]: '携帯番号',
    [-2]: 'お名前',
    [-3]: 'お住まいの郵便番号',
    [-4]: 'どんな資格をお持ちですか？',
}
function stagedQuestionName(offsetFromCutoff: number): string | null {
    return STAGED_PHASE1_NAMES[offsetFromCutoff] ?? null
}
const STAGED_NAME_SET = new Set(Object.values(STAGED_PHASE1_NAMES))

const MEMBER_USERS = '`xmile-drm.xwork.member_users`'

/**
 * プロダクトDBでの会員成立とフェーズ2の完了。
 * フェーズ2の最終設問「現在のご状況」= `employment_status` が空なら未完了とみなす。
 * この設問は全14職種の stepList に必ず入っており（drm-front occupationConfig）、
 * 1本フォームだった時代の会員にも入るため、フォーム構造が変わった期間をまたいでも壊れない。
 * （`profile_updated_at = profile_created_at` でも近い値になるが、1本フォーム時代は
 * 全設問を一度に保存していて更新が走らないため、完走した会員まで未完了に見えてしまう。）
 * GA4 のクリックラベルは最終段を1〜2割取りこぼす（2026-10-07〜13: DB 363 に対し GA4 334）ため、
 * 会員成立数とフェーズ2完了数はこちらを正とする。スキャンは約10MB（≒0.01円）。
 */
async function fetchPhaseDb(startDate: string, endDate: string): Promise<Map<string, SignupFunnelDbCounts> | null> {
    const sql = `
SELECT
    IFNULL(preferred_occupation_level_1_name, '(職種なし)') AS occ,
    COUNT(*) AS members,
    COUNTIF(employment_status IS NOT NULL) AS phase2_saved
FROM ${MEMBER_USERS}
WHERE signup_kind = 'plain_signup'
    AND user_created_at >= TIMESTAMP(DATETIME '${startDate} 00:00:00', 'Asia/Tokyo')
    AND user_created_at < TIMESTAMP(DATETIME_ADD(DATETIME '${endDate} 00:00:00', INTERVAL 1 DAY), 'Asia/Tokyo')
GROUP BY occ`
    try {
        const { rows } = await runGa4EventsQuery(sql)
        const out = new Map<string, SignupFunnelDbCounts>()
        for (const r of rows) {
            const members = parseInt(r.members ?? '0', 10)
            const phase2Saved = parseInt(r.phase2_saved ?? '0', 10)
            out.set(r.occ ?? '', { members, phase2Saved, phase2Unsaved: members - phase2Saved })
        }
        return out
    } catch {
        // プロダクトDB側が落ちても GA4 のファネルは出す
        return null
    }
}

function sumCounts(list: SignupFunnelDbCounts[]): SignupFunnelDbCounts {
    return list.reduce<SignupFunnelDbCounts>(
        (a, c) => ({
            members: a.members + c.members,
            phase2Saved: a.phase2Saved + c.phase2Saved,
            phase2Unsaved: a.phase2Unsaved + c.phase2Unsaved,
        }),
        { members: 0, phase2Saved: 0, phase2Unsaved: 0 },
    )
}

interface QuestionDraft {
    name: string
    /** 並び順。会員成立ラインからの相対位置（人数が最も多い読み）で並べる */
    orderUsers: Map<number, number>
    minStep: number
    /** フェーズ・成立ラインの判定は人数で多数決する（期間が構造変更をまたぐと変種ごとに位置が違うため） */
    phase1Users: number
    phase2Users: number
    cutoffUsers: number
    nameInferred: boolean
    hint: string | null
    hintUsers: number
    viewLabels: string[]
    clickLabels: string[]
    variants: Set<string>
}

/** 対象期間にフォームのラベルが 1 つも無ければ null（route は 404 にする） */
export async function runSignupFunnelReport(reporter: Ga4Reporter, requestedForm?: string): Promise<SignupFunnelReport | null> {
    const [views, clicks] = await Promise.all([fetchLabels(reporter, 'view_label'), fetchLabels(reporter, 'click_label')])

    // フォーム一覧は前進クリックから作る（view は1問目しか出ないので取りこぼす）。
    // ステップ番号を持つ Label ラベルは会員登録フォームにしか無いため、Jobs/Line/Thx/診断は自然に外れる。
    const formUsers = new Map<string, number>()
    for (const c of clicks) {
        if (c.element === 'Label' && c.step) formUsers.set(c.form, (formUsers.get(c.form) ?? 0) + c.users)
    }
    const forms = [...formUsers.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([key]) => ({ key, label: JOBS_BTN_LABEL[key] ?? key }))
    if (forms.length === 0) return null
    const form = requestedForm && formUsers.has(requestedForm) ? requestedForm : forms[0].key

    const areaLabels = views.filter((v) => v.form === form && v.element === 'Area' && v.step && v.text)

    // 前進クリック（「戻る」は前進ではないので除外）
    const forward = clicks.filter((c) => c.form === form && c.element === 'Label' && c.step && c.text !== '戻る')
    const unassignedClicks = clicks
        .filter((c) => c.form === form && c.element === 'Label' && !c.step)
        .reduce((s, c) => s + c.users, 0)

    // 変種ごとの会員成立ライン。`?occupation=` の職種確定流入はステップ番号が1つ前倒しになり
    // 同じ無印変種に2通りの番号が混ざるため、最小ではなく「最も人数の多い」ステップを採る。
    const registerUsers = new Map<string, Map<number, number>>()
    for (const c of forward) {
        if (!REGISTER_BUTTON.test(c.text ?? '')) continue
        const byStep = registerUsers.get(c.variant) ?? new Map<number, number>()
        byStep.set(c.stepNum as number, (byStep.get(c.stepNum as number) ?? 0) + c.users)
        registerUsers.set(c.variant, byStep)
    }
    const cutoffByVariant = new Map<string, number>()
    for (const [variant, byStep] of registerUsers) {
        const top = [...byStep.entries()].sort((a, b) => b[1] - a[1])[0]
        if (top) cutoffByVariant.set(variant, top[0])
    }
    const dominantCutoff = [...registerUsers.values()]
        .flatMap((m) => [...m.entries()])
        .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    const cutoffOf = (variant: string): number | null => cutoffByVariant.get(variant) ?? dominantCutoff

    /**
     * view ラベルの「会員成立ラインからの相対位置」。番号が1つ前倒しの職種確定流入で付いた
     * ラベルは、固定順（stagedQuestionName）と突き合わせて食い違ったら1つずらして読む。
     */
    const offsetOfView = (p: ParsedLabel, cutoff: number): number => {
        for (const c of [cutoff, cutoff - 1]) {
            const offset = (p.stepNum as number) - c
            const staged = stagedQuestionName(offset)
            if (staged == null || staged === p.text) return offset
        }
        return (p.stepNum as number) - cutoff
    }
    const nameByVariantOffset = new Map<string, { text: string; users: number }>()
    const nameByOffset = new Map<number, { text: string; users: number }>()
    for (const a of areaLabels) {
        const cutoff = cutoffOf(a.variant)
        if (cutoff == null) continue
        const offset = offsetOfView(a, cutoff)
        for (const [map, key] of [[nameByVariantOffset, `${a.variant}|${offset}`], [nameByOffset, offset]] as const) {
            const cur = (map as Map<string | number, { text: string; users: number }>).get(key)
            if (!cur || cur.users < a.users) {
                ;(map as Map<string | number, { text: string; users: number }>).set(key, { text: a.text as string, users: a.users })
            }
        }
    }

    /**
     * 質問名は「会員成立ラインからの相対位置」で決める。フェーズ1は全職種共通で固定なので
     * stagedQuestionName が最優先（view ラベルは職種確定流入の分が混ざって当てにならない）。
     * フェーズ2は職種別なので view ラベルから拾い、無ければステップ名のまま出す。
     */
    const resolveName = (p: ParsedLabel): { name: string; inferred: boolean } => {
        const cutoff = cutoffOf(p.variant)
        if (cutoff == null) {
            const viewName = nameByVariantOffset.get(`${p.variant}|${p.stepNum}`)?.text
            return viewName ? { name: viewName, inferred: false } : { name: p.step as string, inferred: true }
        }
        const offset = (p.stepNum as number) - cutoff
        const staged = stagedQuestionName(offset)
        if (staged) return { name: staged, inferred: true }
        // フェーズ2の位置にフェーズ1の固定名は使わない。期間が構造変更をまたぐと、旧フローの
        // view ラベル（A 群は StepLast がパスワードだった）が最終設問の名前として勝ってしまう。
        // 成立ラインより手前（会員登録前）はズレても同じ設問なので、そのまま合流させる。
        for (const cand of [nameByVariantOffset.get(`${p.variant}|${offset}`)?.text, nameByOffset.get(offset)?.text]) {
            if (cand && !(offset > 0 && STAGED_NAME_SET.has(cand))) return { name: cand, inferred: false }
        }
        return { name: p.step as string, inferred: true }
    }

    const questions = new Map<string, QuestionDraft>()
    for (const c of forward) {
        const step = c.stepNum as number
        const { name, inferred } = resolveName(c)
        const q = questions.get(name) ?? {
            name, orderUsers: new Map<number, number>(), minStep: step, phase1Users: 0, phase2Users: 0, cutoffUsers: 0, nameInferred: inferred,
            hint: null, hintUsers: 0, viewLabels: [], clickLabels: [], variants: new Set<string>(),
        }
        const cutoffForOrder = cutoffOf(c.variant)
        const order = cutoffForOrder == null ? step : step - cutoffForOrder
        q.orderUsers.set(order, (q.orderUsers.get(order) ?? 0) + c.users)
        q.minStep = Math.min(q.minStep, step)
        q.nameInferred = q.nameInferred && inferred
        const cutoff = cutoffOf(c.variant)
        if (cutoff != null && step > cutoff) q.phase2Users += c.users
        else q.phase1Users += c.users
        if (cutoff != null && step === cutoff) q.cutoffUsers += c.users
        if (c.users > q.hintUsers) { q.hint = c.text; q.hintUsers = c.users }
        q.clickLabels.push(c.raw)
        q.variants.add(c.variant)
        questions.set(name, q)
    }
    // view は同じ質問名の行に足す（見たのに答えなかった人の手がかり）
    for (const a of areaLabels) {
        questions.get(a.text as string)?.viewLabels.push(a.raw)
    }

    const orderKey = (q: QuestionDraft): number =>
        [...q.orderUsers.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? q.minStep
    const ordered = [...questions.values()].sort((a, b) => orderKey(a) - orderKey(b))

    // 起点: 職種選択ボタンのクリック
    const jobsBtn = JOBS_BTN_LABEL[form]
    const originPromise = jobsBtn ? distinctUsers(reporter, 'click_label', [`SU__Jobs__Btn__${jobsBtn}`]) : Promise.resolve(null)
    const { startDate, endDate } = reporter.ctx.dateRanges[0]
    const dbPromise = fetchPhaseDb(startDate, endDate)

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
            const phase: 1 | 2 = q.phase2Users > q.phase1Users ? 2 : 1
            return {
                name: q.name, view, click, variants: q.variants.size,
                phase, isCutoff: q.cutoffUsers * 2 > q.phase1Users + q.phase2Users,
                nameInferred: q.nameInferred, hint: q.nameInferred ? q.hint : null,
            }
        }))
        results.push(...rows)
    }
    const origin = await originPromise
    const memberCreated = results.find((q) => q.isCutoff)?.click ?? null

    const dbByOcc = await dbPromise
    let db: SignupFunnelDb | null = null
    if (dbByOcc) {
        const formCounts = jobsBtn ? dbByOcc.get(jobsBtn) ?? null : null
        db = { form: formCounts, overall: sumCounts([...dbByOcc.values()]) }
    }

    return { forms, form, formLabel: JOBS_BTN_LABEL[form] ?? form, origin, questions: results, memberCreated, unassignedClicks, db }
}
