import type { AbTest } from '@prisma/client'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { parseDateString } from '@/lib/utils/date'
import { buildGa4ConfigDimensionFilter, type Ga4ConfigFilterSpec } from '@/lib/services/ab-test/ga4ConfigFilter'

const VARIANT_KEYS = ['A', 'B', 'C', 'D'] as const
export type VariantKey = (typeof VARIANT_KEYS)[number]

const AUTO_DIMENSIONS = ['customEvent:view_label', 'customEvent:click_label']
const AUTO_MAX_STEPS = 30

export type FunnelBasis = 'view' | 'click'

interface FunnelStepConfig {
    stepName: string
    dimension: string
    labels: Partial<Record<VariantKey, string[] | string>>
    /** 自動モードでStep番号マッチングした場合のステップ順序 */
    order?: number | null
    /** バリアントごとに設問文が違う場合の表示名（例: ステップ削減テスト） */
    variantStepNames?: Partial<Record<VariantKey, string>>
}

interface GA4CvrConfig {
    denominatorLabels?: string[] | string
    numeratorLabels?: string[] | string
}

export interface AbTestFunnelStep {
    stepName: string
    dimension: string
    /** バリアントごとに設問文が違う場合のみセット（ステップ削減・設問変更テスト用） */
    variantStepNames?: Partial<Record<VariantKey, string>>
    /** そのバリアントにステップ自体が存在しない場合、values にキーが入らない */
    values: Partial<Record<VariantKey, { users: number; conversionRate: number | null; dropoffRate: number | null }>>
}

export interface AbTestFunnelResult {
    mode: 'manual' | 'auto'
    basis: FunnelBasis
    detectedSuffixes: string[]
    startDate: string
    endDate: string
    variants: VariantKey[]
    steps: AbTestFunnelStep[]
    /** ga4Config.excludeFilter が設定されているか（UIのトグル表示判定用） */
    excludeFilterAvailable: boolean
    /** このレスポンスに除外フィルタが適用されているか */
    excludeApplied: boolean
}

/** 設定不備など呼び出し側が 400 として扱うべきエラー */
export class FunnelConfigError extends Error {}

function normalizeLabels(labels: string[] | string | undefined): string[] {
    if (Array.isArray(labels)) return labels.map((l) => l.trim()).filter(Boolean)
    if (typeof labels === 'string') return labels.split(',').map((l) => l.trim()).filter(Boolean)
    return []
}

// GTMタグ規則: Bバリアントのラベルは「{元ラベル}__B-{イシュー番号}」形式（Aはサフィックスなし）
function detectSuffix(cvr: GA4CvrConfig | undefined, variant: VariantKey): string | null {
    const labels = [...normalizeLabels(cvr?.denominatorLabels), ...normalizeLabels(cvr?.numeratorLabels)]
    for (const label of labels) {
        const m = label.match(/__([A-D]-\w+)$/)
        if (m && m[1].startsWith(variant)) return m[1]
    }
    return null
}

function stepNameFromBaseLabel(baseLabel: string): string {
    const segments = baseLabel.split('__')
    return segments[segments.length - 1] || baseLabel
}

// ラベル中の Step 番号（StepLast は末尾扱い）。見つからなければ null
function stepOrderFromName(stepName: string): number | null {
    if (/^StepLast[_＿]?/.test(stepName)) return Number.MAX_SAFE_INTEGER
    const m = stepName.match(/^Step(\d+)/)
    return m ? parseInt(m[1], 10) : null
}

// クリックラベル（例: SU__Driver__Label__Step1_大型免許）から StepN プレフィックスを抽出
function clickStepPrefix(baseLabel: string): { prefix: string; stepName: string } | null {
    const m = baseLabel.match(/^(.*?(Step(?:\d+|Last)))[_＿]/)
    if (!m) return null
    return { prefix: `${m[1]}_`, stepName: m[2] }
}

// バリアントサフィックス（__B-1741 等）が付いたラベルか
const VARIANT_SUFFIX_RE = /__[A-D]-\w+$/

// ビューラベル（例: SU__Driver__Area__Step3_現在のご状況）を Step 番号でマッチングするために分解。
// ステップ削減・設問変更テストでは同じStep番号でも設問文が違うため、ラベル全文でなくStep番号で対応付ける
function splitStepLabel(baseLabel: string): { stem: string; order: number; stepName: string } | null {
    const m = baseLabel.match(/^(.*?)(Step(?:\d+|Last))(?:[_＿]|$)/)
    if (!m) return null
    const order = m[2] === 'StepLast' ? Number.MAX_SAFE_INTEGER : parseInt(m[2].slice(4), 10)
    return { stem: m[1], order, stepName: stepNameFromBaseLabel(baseLabel) }
}

/** フィルタ条件に合う totalUsers をディメンションなしで取得（複数ラベルをまたいだユニークユーザー数） */
async function countUsers(
    propertyId: string,
    accessToken: string,
    dateRanges: Array<{ startDate: string; endDate: string }>,
    dimensionFilter: Record<string, unknown>
): Promise<number> {
    const report = await fetchGA4Data({
        propertyId, dateRanges,
        dimensions: [],
        metrics: [{ name: 'totalUsers' }],
        dimensionFilter,
        limit: 1,
    }, accessToken)
    return parseInt(report.rows?.[0]?.metricValues[0]?.value ?? '0', 10)
}

/**
 * ABテストのバリアント別ステップファネルをGA4オンデマンド集計で計算する。
 * - basis=view: view_label（50%×1秒表示。即通過ステップは取りこぼしあり）
 * - basis=click: click_label のStepN_プレフィックス単位で「そのステップで何か操作した人」（表示条件なしで確実）
 * 設定不備は FunnelConfigError を投げる。
 */
export async function computeAbTestFunnel(
    abTest: AbTest,
    basis: FunnelBasis,
    options?: { applyExcludeFilter?: boolean }
): Promise<AbTestFunnelResult> {
    const ga4Config = abTest.ga4Config as unknown as {
        propertyId?: string
        funnelSteps?: FunnelStepConfig[]
        excludeFilter?: Ga4ConfigFilterSpec
        cvrB?: GA4CvrConfig
        cvrC?: GA4CvrConfig
        cvrD?: GA4CvrConfig
    }
    if (!ga4Config?.propertyId) {
        throw new FunnelConfigError('GA4設定がありません')
    }
    const propertyId = ga4Config.propertyId

    // ga4Config.excludeFilter（例: LP経由の pageLocation CONTAINS userId= 除外）を
    // 全ステップ集計クエリに適用する（トグルON時のみ）
    const excludeFilterAvailable = Boolean(
        ga4Config.excludeFilter?.dimension && ga4Config.excludeFilter?.operator && ga4Config.excludeFilter?.expression
    )
    const excludeFilter = options?.applyExcludeFilter && excludeFilterAvailable
        ? buildGa4ConfigDimensionFilter({ excludeFilter: ga4Config.excludeFilter })
        : undefined
    const withExclude = (filter: Record<string, unknown>): Record<string, unknown> =>
        excludeFilter ? { andGroup: { expressions: [filter, excludeFilter] } } : filter

    const accessToken = await getGA4AccessToken()

    const startDate = parseDateString(abTest.startDate.toISOString().split('T')[0])
    const today = parseDateString('today')
    const testEnd = abTest.endDate ? abTest.endDate.toISOString().split('T')[0] : null
    const endDate = testEnd && testEnd < today ? testEnd : today

    const manualSteps = (ga4Config?.funnelSteps ?? []).filter((s) => s?.stepName && s?.dimension)
    let stepConfigs: FunnelStepConfig[] = manualSteps
    let mode: 'manual' | 'auto' = 'manual'
    const detectedSuffixes: string[] = []
    // クリック基準（basis=click）のときは集計済みステップを直接作る
    let clickStepsWithUsers: Array<{ stepName: string; dimension: string; users: Partial<Record<VariantKey, number>> }> | null = null
    let clickVariants: VariantKey[] | null = null

    if (manualSteps.length === 0) {
        // 自動モード: CVR設定のB/C/Dラベルからサフィックス（例: __B-1618）を検出し、
        // サフィックス付きタグ＝テスト対象範囲としてファネルを自動生成する
        const detected: { variant: VariantKey; suffix: string }[] = []
        for (const v of ['B', 'C', 'D'] as const) {
            const suffix = detectSuffix(ga4Config[`cvr${v}`], v)
            if (suffix) detected.push({ variant: v, suffix })
        }

        if (detected.length === 0) {
            throw new FunnelConfigError('ファネルステップが未設定で、CVRラベルからバリアントサフィックス（例: __B-1618）も検出できませんでした')
        }

        if (basis === 'click') {
            // クリック基準: サフィックス付き click_label から StepN_ プレフィックスを発見し、
            // ステップ×バリアントごとに「プレフィックスに一致するクリックをした人数」をGA4側の重複排除で数える
            const prefixes = new Map<string, string>() // prefix -> stepName
            const prefixVariants = new Map<string, Set<VariantKey>>() // prefix -> 存在するバリアント
            const markPrefix = (prefix: string, stepName: string, variant: VariantKey) => {
                prefixes.set(prefix, stepName)
                const set = prefixVariants.get(prefix) ?? new Set<VariantKey>()
                set.add(variant)
                prefixVariants.set(prefix, set)
            }
            for (const { variant, suffix } of detected) {
                detectedSuffixes.push(suffix)
                const report = await fetchGA4Data({
                    propertyId,
                    dateRanges: [{ startDate, endDate }],
                    dimensions: [{ name: 'customEvent:click_label' }],
                    metrics: [{ name: 'totalUsers' }],
                    dimensionFilter: withExclude({
                        filter: { fieldName: 'customEvent:click_label', stringFilter: { matchType: 'ENDS_WITH', value: `__${suffix}` } },
                    }),
                    limit: 10000,
                }, accessToken)
                for (const row of report.rows ?? []) {
                    const label = row.dimensionValues?.[0]?.value?.trim() ?? ''
                    if (!label.endsWith(`__${suffix}`)) continue
                    const p = clickStepPrefix(label.slice(0, label.length - suffix.length - 2))
                    if (p) markPrefix(p.prefix, p.stepName, variant)
                }
            }
            if (prefixes.size === 0) {
                throw new FunnelConfigError('サフィックス付きクリックラベルからステップ（StepN_）を検出できませんでした')
            }

            // A側のステップも実ラベルから探索（B側が廃止したステップの消失を防ぐ）
            const clickStems = new Set(
                [...prefixes.keys()].map((p) => p.replace(/Step(?:\d+|Last)_$/, ''))
            )
            for (const stem of clickStems) {
                const report = await fetchGA4Data({
                    propertyId,
                    dateRanges: [{ startDate, endDate }],
                    dimensions: [{ name: 'customEvent:click_label' }],
                    metrics: [{ name: 'totalUsers' }],
                    dimensionFilter: withExclude({
                        filter: { fieldName: 'customEvent:click_label', stringFilter: { matchType: 'BEGINS_WITH', value: `${stem}Step` } },
                    }),
                    limit: 10000,
                }, accessToken)
                for (const row of report.rows ?? []) {
                    const label = row.dimensionValues?.[0]?.value?.trim() ?? ''
                    if (!label || VARIANT_SUFFIX_RE.test(label)) continue
                    const p = clickStepPrefix(label)
                    if (p && p.prefix.startsWith(stem)) markPrefix(p.prefix, p.stepName, 'A')
                }
            }

            const variantSuffix = new Map<VariantKey, string>()
            for (const { variant, suffix } of detected) variantSuffix.set(variant, suffix)
            clickVariants = ['A', ...variantSuffix.keys()]

            // 各ステップは「そのバリアントにラベルが存在する」組み合わせのみ集計
            // （存在しないステップは0でなく欠損として扱い、ステップ削減テストで誤解を生まない）
            const tasks = [...prefixes.entries()].flatMap(([prefix, stepName]) =>
                (clickVariants as VariantKey[])
                    .filter((variant) => prefixVariants.get(prefix)?.has(variant))
                    .map((variant) => ({ prefix, stepName, variant }))
            )
            const counts = new Map<string, number>()
            const chunkSize = 5 // GA4のプロパティ同時リクエスト上限を考慮
            for (let i = 0; i < tasks.length; i += chunkSize) {
                const chunk = tasks.slice(i, i + chunkSize)
                const values = await Promise.all(chunk.map((t) => {
                    const beginFilter = {
                        filter: { fieldName: 'customEvent:click_label', stringFilter: { matchType: 'BEGINS_WITH', value: t.prefix } },
                    }
                    const suffix = variantSuffix.get(t.variant)
                    // Aはサフィックスなし = 全サフィックスを除外（プレフィックス一致だけだとB/C/Dラベルも前方一致してしまう）
                    const dimensionFilter = suffix
                        ? { andGroup: { expressions: [beginFilter, { filter: { fieldName: 'customEvent:click_label', stringFilter: { matchType: 'ENDS_WITH', value: `__${suffix}` } } }] } }
                        : {
                            andGroup: {
                                expressions: [
                                    beginFilter,
                                    ...[...variantSuffix.values()].map((s) => ({
                                        notExpression: { filter: { fieldName: 'customEvent:click_label', stringFilter: { matchType: 'ENDS_WITH', value: `__${s}` } } },
                                    })),
                                ],
                            },
                        }
                    return countUsers(propertyId, accessToken, [{ startDate, endDate }], withExclude(dimensionFilter))
                }))
                chunk.forEach((t, idx) => counts.set(`${t.prefix}|${t.variant}`, values[idx]))
            }

            clickStepsWithUsers = [...prefixes.entries()].map(([prefix, stepName]) => ({
                stepName,
                dimension: 'customEvent:click_label',
                // ラベルが存在するバリアントのみ値を持たせる（存在しないステップは欠損扱い）
                users: Object.fromEntries(
                    (clickVariants as VariantKey[])
                        .filter((v) => prefixVariants.get(prefix)?.has(v))
                        .map((v) => [v, counts.get(`${prefix}|${v}`) ?? 0])
                ) as Partial<Record<VariantKey, number>>,
            }))
            mode = 'auto'
        }

        // ビュー基準: Step番号でA/B/C/Dを対応付ける（ステップ削減・設問変更テストでは
        // 同じStep番号でも設問文が違うため、ラベル全文マッチングだとA=0の行やAだけのステップ消失が起きる）
        const stepsByKey = new Map<string, FunnelStepConfig>()
        const stems = new Set<string>() // `${dimension}|${stem}`: A側ステップの探索範囲
        const upsertStep = (
            dimension: string,
            variant: VariantKey,
            label: string,
            baseLabel: string,
        ) => {
            const sp = splitStepLabel(baseLabel)
            // Step番号を持つラベルはStep番号で、持たないラベルは従来どおりベースラベル全文で対応付け
            const key = sp ? `${dimension}|#${sp.order}|${sp.stem}` : `${dimension}|${baseLabel}`
            if (sp) stems.add(`${dimension}|${sp.stem}`)
            const stepName = stepNameFromBaseLabel(baseLabel)
            const existing = stepsByKey.get(key)
            if (existing) {
                const cur = existing.labels[variant]
                existing.labels[variant] = [...normalizeLabels(cur), label]
                existing.variantStepNames = { ...existing.variantStepNames, [variant]: stepName }
            } else {
                stepsByKey.set(key, {
                    stepName,
                    dimension,
                    order: sp ? sp.order : null,
                    // Step番号なしラベルはA側=ベースラベルと推定（従来挙動）。Step番号ありはA側を実ラベルから探索する
                    labels: sp ? { [variant]: [label] } : { A: [baseLabel], [variant]: [label] },
                    variantStepNames: { [variant]: stepName },
                })
            }
        }
        for (const { variant, suffix } of clickStepsWithUsers ? [] : detected) {
            detectedSuffixes.push(suffix)
            let found = false
            for (const dimension of AUTO_DIMENSIONS) {
                const report = await fetchGA4Data(
                    {
                        propertyId,
                        dateRanges: [{ startDate, endDate }],
                        dimensions: [{ name: dimension }],
                        metrics: [{ name: 'totalUsers' }],
                        dimensionFilter: withExclude({
                            filter: {
                                fieldName: dimension,
                                stringFilter: { matchType: 'ENDS_WITH', value: `__${suffix}` },
                            },
                        }),
                        limit: 10000,
                    },
                    accessToken
                )
                const rows = report.rows ?? []
                if (rows.length === 0) continue
                for (const row of rows) {
                    const label = row.dimensionValues?.[0]?.value?.trim() ?? ''
                    if (!label.endsWith(`__${suffix}`)) continue
                    const baseLabel = label.slice(0, label.length - suffix.length - 2)
                    if (!baseLabel) continue
                    upsertStep(dimension, variant, label, baseLabel)
                }
                found = true
                break
            }
            if (!found) {
                throw new FunnelConfigError(`サフィックス「__${suffix}」の付いたラベルがGA4データに見つかりませんでした`)
            }
        }
        if (!clickStepsWithUsers) {
            // A側のステップを実ラベルから探索（サフィックスなし × 同じstem × Step番号あり）。
            // これによりB側が廃止したステップ（例: Step0）もAの行として残る
            for (const stemKey of stems) {
                const [dimension, stem] = [stemKey.slice(0, stemKey.indexOf('|')), stemKey.slice(stemKey.indexOf('|') + 1)]
                const report = await fetchGA4Data(
                    {
                        propertyId,
                        dateRanges: [{ startDate, endDate }],
                        dimensions: [{ name: dimension }],
                        metrics: [{ name: 'totalUsers' }],
                        dimensionFilter: withExclude({
                            filter: { fieldName: dimension, stringFilter: { matchType: 'BEGINS_WITH', value: `${stem}Step` } },
                        }),
                        limit: 10000,
                    },
                    accessToken
                )
                for (const row of report.rows ?? []) {
                    const label = row.dimensionValues?.[0]?.value?.trim() ?? ''
                    if (!label || VARIANT_SUFFIX_RE.test(label)) continue
                    const sp = splitStepLabel(label)
                    if (!sp || sp.stem !== stem) continue
                    const key = `${dimension}|#${sp.order}|${sp.stem}`
                    const existing = stepsByKey.get(key)
                    if (existing) {
                        const cur = existing.labels.A
                        existing.labels.A = [...normalizeLabels(cur), label]
                        existing.variantStepNames = { ...existing.variantStepNames, A: sp.stepName }
                    } else {
                        stepsByKey.set(key, {
                            stepName: sp.stepName,
                            dimension,
                            order: sp.order,
                            labels: { A: [label] },
                            variantStepNames: { A: sp.stepName },
                        })
                    }
                }
            }
            stepConfigs = [...stepsByKey.values()]
            mode = 'auto'
        }
    }

    // ステップで使われているディメンションごとに1クエリで label→totalUsers を取得（ビュー基準・手動設定）
    const usersByDimension = new Map<string, Map<string, number>>()
    if (!clickStepsWithUsers) {
        const dimensions = [...new Set(stepConfigs.map((s) => s.dimension.trim()))]
        await Promise.all(
            dimensions.map(async (dimension) => {
                const report = await fetchGA4Data(
                    {
                        propertyId,
                        dateRanges: [{ startDate, endDate }],
                        dimensions: [{ name: dimension }],
                        metrics: [{ name: 'totalUsers' }],
                        dimensionFilter: excludeFilter,
                        limit: 100000,
                    },
                    accessToken
                )
                const map = new Map<string, number>()
                for (const row of report.rows ?? []) {
                    const label = row.dimensionValues?.[0]?.value?.trim() ?? ''
                    const users = parseInt(row.metricValues?.[0]?.value || '0', 10)
                    map.set(label, (map.get(label) ?? 0) + users)
                }
                usersByDimension.set(dimension, map)
            })
        )
    }

    const activeVariants = clickVariants ?? VARIANT_KEYS.filter((v) =>
        stepConfigs.some((s) => normalizeLabels(s.labels?.[v]).length > 0)
    )

    // ステップごとのユーザー数を先に集計（自動モードはA降順=ファネル順に並べ替えるため）
    let stepsWithUsers = clickStepsWithUsers ?? stepConfigs.map((step) => {
        const labelMap = usersByDimension.get(step.dimension.trim()) ?? new Map<string, number>()
        const users: Partial<Record<VariantKey, number>> = {}
        for (const v of activeVariants) {
            const labels = normalizeLabels(step.labels?.[v])
            if (labels.length === 0) continue
            users[v] = labels.reduce((sum, label) => sum + (labelMap.get(label) ?? 0), 0)
        }
        return {
            stepName: step.variantStepNames?.A ?? step.stepName,
            dimension: step.dimension,
            order: step.order ?? null,
            variantStepNames: step.variantStepNames,
            users,
        }
    })

    if (mode === 'auto') {
        // GTMのview_labelは「50%以上1秒連続表示」で発火するため、滞在の短いステップは
        // 実際より少なく計測されユーザー数順が崩れることがある（例: Step1 < Step2）。
        // Step番号（自動検出時は order、なければステップ名から抽出）を優先し、
        // 無ければAユーザー数降順にフォールバック
        const orderOf = (s: typeof stepsWithUsers[number]) =>
            ('order' in s && s.order != null ? s.order : stepOrderFromName(s.stepName))
        const allHaveOrder = stepsWithUsers.every((s) => orderOf(s) !== null)
        stepsWithUsers = stepsWithUsers
            .sort((a, b) =>
                allHaveOrder
                    ? (orderOf(a) as number) - (orderOf(b) as number)
                    : (b.users.A ?? 0) - (a.users.A ?? 0)
            )
            .slice(0, AUTO_MAX_STEPS)
    }

    const firstUsers: Partial<Record<VariantKey, number>> = {}
    const prevUsers: Partial<Record<VariantKey, number>> = {}
    const steps: AbTestFunnelStep[] = stepsWithUsers.map((step) => {
        const values: AbTestFunnelStep['values'] = {}
        for (const v of activeVariants) {
            const users = step.users[v]
            // ステップ自体がそのバリアントに存在しない場合はスキップ（ステップ削減テスト対応）
            if (users == null) continue
            // 起点・直前は「そのバリアントが持つ最初のステップ／直前のステップ」基準
            // （例: BがStep0を廃止した場合、BのファネルはStep1起点で計算する）
            const isVariantFirst = firstUsers[v] == null
            if (isVariantFirst) firstUsers[v] = users
            const first = firstUsers[v]
            const prev = prevUsers[v]
            values[v] = {
                users,
                conversionRate: !isVariantFirst && first != null && first > 0 ? users / first : null,
                dropoffRate: !isVariantFirst && prev != null && prev > 0 ? Math.max(0, (prev - users) / prev) : null,
            }
            prevUsers[v] = users
        }
        // 設問文がバリアント間で異なる場合のみ variantStepNames を出力
        const names: Partial<Record<VariantKey, string>> | undefined =
            'variantStepNames' in step ? (step.variantStepNames as Partial<Record<VariantKey, string>> | undefined) : undefined
        const uniqueNames = names ? new Set(Object.values(names).filter(Boolean)) : new Set()
        return {
            stepName: step.stepName,
            dimension: step.dimension,
            ...(uniqueNames.size > 1 ? { variantStepNames: names } : {}),
            values,
        }
    })

    return {
        mode,
        basis: mode === 'auto' ? basis : 'view',
        detectedSuffixes,
        startDate,
        endDate,
        variants: activeVariants,
        steps,
        excludeFilterAvailable,
        excludeApplied: Boolean(excludeFilter),
    }
}
