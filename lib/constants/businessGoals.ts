/**
 * プロダクト目標で使う「自動カウントの対象指標」の一覧。
 *
 * 目標値そのものは DB（product_goals）に置いて画面から設定する。ここにあるのは
 * **数え方**だけで、どれを選んでも実績はプロダクトDB（BigQuery）から自動で数える。
 *
 * 新しい指標を足すときは BusinessKpiMonth に値を持たせてから、ここに extract を書く。
 */

import type { BusinessKpiMonth } from '@/lib/services/kpi/businessKpiTypes'

export interface GoalMetricDef {
    label: string
    /** 何を数えているかの一文。画面にそのまま出す */
    definition: string
    extract: (m: BusinessKpiMonth) => number | null
    /** 小数で出す指標 */
    decimals?: number
    /** 率（×100 して % で出す） */
    isRate?: boolean
    unit?: string
    /**
     * 率の指標を期間で合計するための分子・分母。
     * **率は月をまたいで足せない**ので、期の累計は Σ分子 ÷ Σ分母 で出す。
     * 率なのにこれが無い指標は期間平均を出さない。
     */
    numerator?: (m: BusinessKpiMonth) => number | null
    denominator?: (m: BusinessKpiMonth) => number | null
    /** GA4 由来。プロパティ未選択や計測前の期間では null になる */
    fromGa4?: boolean
}

/** 登録当日の応募（プロダクト経由＋LINE公式）。当日応募率の分子 */
const sameDayApplies = (m: BusinessKpiMonth) => m.breakdown.prodDay0 + m.breakdown.lineDay0

const entryReach = (m: BusinessKpiMonth, key?: 'JobA' | 'JobR' | 'JobH') =>
    m.forms == null ? null : key ? m.forms.entryReach[key] : m.forms.entryReachTotal
const entryComplete = (m: BusinessKpiMonth, key?: 'JobA' | 'JobR' | 'JobH') =>
    m.forms == null ? null : key ? m.forms.entryComplete[key] : m.forms.entryCompleteTotal
const ratio = (a: number | null, b: number | null) => (a == null || b == null || b === 0 ? null : a / b)

const GOAL_METRICS_DEF = {
    jobad_product_line: {
        label: 'プロダクト経由＋LINE公式の応募（求人広告）',
        definition: 'スカウト／人材紹介側の配信／応募同時登録／広告を除いた、会員の応募',
        extract: (m) => m.jobAdBySource.product + m.jobAdBySource.line,
        unit: '件',
    },
    jobad_scout: {
        label: 'スカウト経由の応募（求人広告）',
        definition: 'scout_id があるか applied_kind が scout_apply / scout_inquiry',
        extract: (m) => m.jobAdBySource.scout,
        unit: '件',
    },
    jobad_line: {
        label: 'LINE公式経由の応募（求人広告）',
        definition: 'utm source_last = line',
        extract: (m) => m.jobAdBySource.line,
        unit: '件',
    },
    jobad_product: {
        label: 'プロダクト経由の応募（求人広告）',
        definition: 'LINEプッシュと、どの配信にも当たらない会員の応募',
        extract: (m) => m.jobAdBySource.product,
        unit: '件',
    },
    jobad_apply_signup: {
        label: '応募同時登録の応募（求人広告）',
        definition: '応募と同時に会員登録した人の応募',
        extract: (m) => m.jobAdBySource.apply_signup,
        unit: '件',
    },
    jobad_hrs: {
        label: '人材紹介側の配信経由の応募（求人広告）',
        definition: 'utm source_last が ca / scout / crm_scout / bdash',
        extract: (m) => m.jobAdBySource.hrs,
        unit: '件',
    },
    apps_jobad: {
        label: '応募（求人広告）',
        definition: '契約種別が求人広告の応募すべて',
        extract: (m) => m.appsJobAd,
        unit: '件',
    },
    apps_agent: {
        label: '応募（人材紹介）',
        definition: '契約種別が人材紹介の応募',
        extract: (m) => m.appsAgent,
        unit: '件',
    },
    apps_hw: {
        label: '応募（ハローワーク）',
        definition: '契約種別がハローワークの応募',
        extract: (m) => m.appsHelloWork,
        unit: '件',
    },
    apps_total: {
        label: '応募合計',
        definition: '求人広告・人材紹介・ハローワークの合計',
        extract: (m) => m.appsTotal,
        unit: '件',
    },
    reg: {
        label: '会員登録',
        definition: '単独登録と応募同時登録の合計',
        extract: (m) => m.reg,
        unit: '人',
    },
    reg_plain: {
        label: '会員登録（単独）',
        definition: '応募と同時でない登録',
        extract: (m) => m.regPlain,
        unit: '人',
    },
    reg_apply_signup: {
        label: '会員登録（応募同時）',
        definition: '応募と同時に会員になった人',
        extract: (m) => m.regApplySignup,
        unit: '人',
    },
    reg_line: {
        label: 'LINE連携した登録',
        definition: 'その月の登録のうち line_user_id がある人',
        extract: (m) => m.regLine,
        unit: '人',
    },
    reg_line_rate: {
        label: '新規のLINE連携率',
        definition: 'その月の登録のうち LINE 連携した割合',
        extract: (m) => ratio(m.regLine, m.reg),
        numerator: (m) => m.regLine, denominator: (m) => m.reg,
        isRate: true, decimals: 1,
    },
    same_day_apply_rate: {
        label: '当日応募率（単独登録あたり）',
        definition: '登録当日の応募（プロダクト経由＋LINE公式）÷ 単独登録数',
        extract: (m) => ratio(sameDayApplies(m), m.regPlain),
        numerator: sameDayApplies, denominator: (m) => m.regPlain,
        isRate: true, decimals: 1,
    },
    jobad_product_linepush: {
        label: 'LINEプッシュ経由の応募（求人広告）',
        definition: 'utm source_last = product かつ medium_last = line',
        extract: (m) => m.breakdown.prodLinePush,
        unit: '件',
    },
    same_day_applies: {
        label: '登録当日の応募（求人広告）',
        definition: 'プロダクト経由＋LINE公式のうち、会員登録と同じ日の応募',
        extract: sameDayApplies,
        unit: '件',
    },
    signup_form_cvr: {
        label: '登録フォーム完了率',
        definition: '/members/signup/thanks 到達 ÷ /members/signup 到達（GA4・ユーザー基準）',
        extract: (m) => (m.forms == null ? null : ratio(m.forms.signupComplete, m.forms.signupReach)),
        numerator: (m) => m.forms?.signupComplete ?? null,
        denominator: (m) => m.forms?.signupReach ?? null,
        isRate: true, decimals: 1, fromGa4: true,
    },
    entry_form_cvr: {
        label: '応募フォーム完了率（全種別）',
        definition: '送信ボタンのクリック ÷ フォーム到達（GA4 のラベル基準・サイト内の通常フォームのみ）',
        extract: (m) => ratio(entryComplete(m), entryReach(m)),
        numerator: (m) => entryComplete(m), denominator: (m) => entryReach(m),
        isRate: true, decimals: 1, fromGa4: true,
    },
    entry_form_cvr_joba: {
        label: '応募フォーム完了率（求人広告）',
        definition: 'EF__JobA__Btn__応募する ÷ EF__JobA__Area__Header（サイト内の通常フォームのみ）',
        extract: (m) => ratio(entryComplete(m, 'JobA'), entryReach(m, 'JobA')),
        numerator: (m) => entryComplete(m, 'JobA'), denominator: (m) => entryReach(m, 'JobA'),
        isRate: true, decimals: 1, fromGa4: true,
    },
    entry_form_cvr_jobr: {
        label: '応募フォーム完了率（人材紹介）',
        definition: 'EF__JobR__Btn__話を聞いてみる ÷ EF__JobR__Area__Header（サイト内の通常フォームのみ）',
        extract: (m) => ratio(entryComplete(m, 'JobR'), entryReach(m, 'JobR')),
        numerator: (m) => entryComplete(m, 'JobR'), denominator: (m) => entryReach(m, 'JobR'),
        isRate: true, decimals: 1, fromGa4: true,
    },
    entry_form_cvr_jobh: {
        label: '応募フォーム完了率（ハローワーク）',
        definition: 'EF__JobH__Btn__話を聞いてみる ÷ EF__JobH__Area__Header（サイト内の通常フォームのみ）',
        extract: (m) => ratio(entryComplete(m, 'JobH'), entryReach(m, 'JobH')),
        numerator: (m) => entryComplete(m, 'JobH'), denominator: (m) => entryReach(m, 'JobH'),
        isRate: true, decimals: 1, fromGa4: true,
    },
    sends: {
        label: 'スカウト送信',
        definition: 'スカウト SMS の送信数',
        extract: (m) => m.sends,
        unit: '通',
    },
    scout_apply_rate: {
        label: '一斉送信の応募率',
        definition: 'スカウト経由の応募 ÷ スカウト SMS 送信数',
        extract: (m) => ratio(m.jobAdBySource.scout, m.sends),
        numerator: (m) => m.jobAdBySource.scout, denominator: (m) => m.sends,
        isRate: true, decimals: 3,
    },
    apps_per_job: {
        label: '求人あたり月間応募',
        definition: '求人広告の応募 ÷ 公開中の求人広告数',
        extract: (m) => m.appsPerJob,
        decimals: 3,
    },
} satisfies Record<string, GoalMetricDef>

export type GoalMetricKey = keyof typeof GOAL_METRICS_DEF

/**
 * `satisfies` だけだと省略した任意プロパティ（isRate など）が共用体の一部に現れず
 * 参照できないので、Record として公開し直す。キーの推論は上で済ませてある。
 */
export const GOAL_METRICS: Record<GoalMetricKey, GoalMetricDef> = GOAL_METRICS_DEF

export const GOAL_METRIC_KEYS = Object.keys(GOAL_METRICS) as GoalMetricKey[]

export const isGoalMetricKey = (v: unknown): v is GoalMetricKey =>
    typeof v === 'string' && v in GOAL_METRICS

/** 目標値の表示。率は % 、それ以外は単位つき */
export function formatGoalValue(v: number | null, key: GoalMetricKey): string {
    if (v == null) return '—'
    const def = GOAL_METRICS[key]
    if (def.isRate) return `${(v * 100).toFixed(def.decimals ?? 1)}%`
    if (def.decimals) return v.toFixed(def.decimals)
    return Math.round(v).toLocaleString()
}

/**
 * 期の累計。率は月をまたいで足せないので Σ分子 ÷ Σ分母 で出す。
 * 分子・分母が無い率（定義していないもの）は null を返す。
 */
export function cumulative(months: BusinessKpiMonth[], key: GoalMetricKey): number | null {
    const def = GOAL_METRICS[key]
    if (def.isRate) {
        if (!def.numerator || !def.denominator) return null
        let num = 0, den = 0, seen = false
        for (const m of months) {
            const a = def.numerator(m), b = def.denominator(m)
            if (a == null || b == null) continue
            num += a; den += b; seen = true
        }
        return seen && den > 0 ? num / den : null
    }
    let sum = 0, seen = false
    for (const m of months) {
        const v = def.extract(m)
        if (v == null) continue
        sum += v; seen = true
    }
    return seen ? sum : null
}

/** 'YYYY-MM' が期間（両端含む）に入るか。期間が未設定なら常に true */
export function inPeriod(month: string, start?: string | null, end?: string | null): boolean {
    if (start && month < start) return false
    if (end && month > end) return false
    return true
}

/** 期のプリセット。年度ではなく暦年の上半期・下半期で切る */
export function halfPeriods(from: string, to: string): { label: string; start: string; end: string }[] {
    const out: { label: string; start: string; end: string }[] = []
    const [fy] = from.split('-').map(Number)
    const [ty] = to.split('-').map(Number)
    for (let y = fy; y <= ty; y++) {
        out.push({ label: `${y}年 上半期`, start: `${y}-01`, end: `${y}-06` })
        out.push({ label: `${y}年 下半期`, start: `${y}-07`, end: `${y}-12` })
    }
    return out.filter((p) => p.end >= from && p.start <= to)
}

/**
 * 目標が 1 件も無いプロダクトに最初だけ入れるテンプレート（2026 下半期）。
 * 数値は goal-tracker v4.2（2026-10-04 時点）から引いたもので、**作られたあとは画面の設定が正**。
 * ここを直しても既存の設定は変わらない。目標値が決まっていないものは target を null にしてある。
 */
export const INITIAL_GOAL_TEMPLATE: ReadonlyArray<{
    metricKey: GoalMetricKey
    label: string
    target: number | null
    weight: number | null
    milestones: Record<string, number>
    note: string
}> = [
    {
        metricKey: 'jobad_product', label: 'プロダクト経由の応募',
        target: 120, weight: 25,
        milestones: { '2026-09': 97, '2026-12': 120 },
        note: '登録〜応募導線の改善。LINE公式と合わせて 12月 160 件',
    },
    {
        metricKey: 'jobad_line', label: 'LINE公式経由の応募',
        target: 40, weight: 10,
        milestones: { '2026-09': 27, '2026-10': 31, '2026-11': 36, '2026-12': 40 },
        note: 'プロダクト経由と合わせて 12月 160 件',
    },
    {
        metricKey: 'jobad_scout', label: 'スカウト経由の応募',
        target: 30, weight: 25,
        milestones: { '2026-09': 7, '2026-10': 16, '2026-11': 26, '2026-12': 30 },
        note: '12月30件のうち28件を代行が担う想定',
    },
    {
        metricKey: 'scout_apply_rate', label: 'スカウト一斉送信の応募率',
        target: 0.0015, weight: null,
        milestones: { '2026-09': 0.00057 },
        note: '0.057%→0.15% が目標',
    },
    {
        metricKey: 'reg_plain', label: '単独登録者数',
        target: null, weight: null, milestones: {},
        note: '応募と同時でない会員登録。当日応募率の分母',
    },
    {
        metricKey: 'same_day_apply_rate', label: '当日応募率（単独登録あたり）',
        target: 0.09, weight: null,
        milestones: { '2026-09': 0.079 },
        note: '7.9%→9% で 12月の登録当日 95 件に届く',
    },
    {
        metricKey: 'reg_line_rate', label: '新規のLINE連携率',
        target: 0.26, weight: null,
        milestones: { '2026-09': 0.237 },
        note: '全体の連携率は 21.3%→22% が目標',
    },
    {
        metricKey: 'jobad_product_linepush', label: 'LINEプッシュ経由の応募',
        target: 17, weight: null,
        milestones: { '2026-09': 11, '2026-12': 17 },
        note: 'プロダクト経由の内数',
    },
    {
        metricKey: 'signup_form_cvr', label: '登録フォーム完了率',
        target: null, weight: null, milestones: {},
        note: 'GA4 のユーザー基準',
    },
    {
        metricKey: 'entry_form_cvr_joba', label: '応募フォーム完了率（求人広告）',
        target: null, weight: null, milestones: {},
        note: 'GA4 のラベル基準',
    },
    {
        metricKey: 'entry_form_cvr_jobr', label: '応募フォーム完了率（人材紹介）',
        target: null, weight: null, milestones: {},
        note: 'GA4 のラベル基準',
    },
    {
        metricKey: 'entry_form_cvr_jobh', label: '応募フォーム完了率（ハローワーク）',
        target: null, weight: null, milestones: {},
        note: 'GA4 のラベル基準',
    },
]

/** テンプレートに入れる期（2026 下半期） */
export const INITIAL_GOAL_PERIOD = { start: '2026-07', end: '2026-12' } as const
