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
}

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
        extract: (m) => (m.reg > 0 ? m.regLine / m.reg : null),
        isRate: true, decimals: 1,
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
        extract: (m) => (m.sends > 0 ? m.jobAdBySource.scout / m.sends : null),
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
 * 目標が 1 件も無いプロダクトに最初だけ入れるテンプレート。
 * 2026 下期の目標（goal-tracker v4.2・2026-10-04 時点）を初期値として置くだけで、
 * **作られたあとは画面の設定が正**。ここを直しても既存の設定は変わらない。
 */
export const INITIAL_GOAL_TEMPLATE: ReadonlyArray<{
    metricKey: GoalMetricKey
    label: string
    target: number
    weight: number
    milestones: Record<string, number>
    note: string
}> = [
    {
        metricKey: 'jobad_product_line', label: '登録〜応募導線の改善',
        target: 160, weight: 35,
        milestones: { '2026-09': 124, '2026-10': 136, '2026-11': 148, '2026-12': 160 },
        note: '内訳目標はプロダクト経由 97→120・LINE公式 27→40',
    },
    {
        metricKey: 'jobad_scout', label: 'スカウトの土台構築と計測',
        target: 30, weight: 25,
        milestones: { '2026-09': 7, '2026-10': 16, '2026-11': 26, '2026-12': 30 },
        note: '12月30件のうち28件を代行が担う想定。一斉送信の応募率 0.057%→0.15% が前提',
    },
    {
        metricKey: 'jobad_line', label: 'LINE公式アカウント経由応募の拡大',
        target: 40, weight: 15,
        milestones: { '2026-09': 27, '2026-10': 31, '2026-11': 36, '2026-12': 40 },
        note: 'プロダクト経由＋LINE公式の内数',
    },
]
