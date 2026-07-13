import type { AbTest } from '@prisma/client'
import { fetchGA4Data, getGA4AccessToken } from '@/lib/api/ga4/client'
import { parseDateString } from '@/lib/utils/date'

const VARIANT_KEYS = ['A', 'B', 'C', 'D'] as const
export type VariantKey = (typeof VARIANT_KEYS)[number]

const AUTO_DIMENSIONS = ['customEvent:view_label', 'customEvent:click_label']
const AUTO_MAX_STEPS = 30

export type FunnelBasis = 'view' | 'click'

interface FunnelStepConfig {
    stepName: string
    dimension: string
    labels: Partial<Record<VariantKey, string[] | string>>
}

interface GA4CvrConfig {
    denominatorLabels?: string[] | string
    numeratorLabels?: string[] | string
}

export interface AbTestFunnelStep {
    stepName: string
    dimension: string
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
export async function computeAbTestFunnel(abTest: AbTest, basis: FunnelBasis): Promise<AbTestFunnelResult> {
    const ga4Config = abTest.ga4Config as unknown as {
        propertyId?: string
        funnelSteps?: FunnelStepConfig[]
        cvrB?: GA4CvrConfig
        cvrC?: GA4CvrConfig
        cvrD?: GA4CvrConfig
    }
    if (!ga4Config?.propertyId) {
        throw new FunnelConfigError('GA4設定がありません')
    }
    const propertyId = ga4Config.propertyId

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
            for (const { suffix } of detected) {
                detectedSuffixes.push(suffix)
                const report = await fetchGA4Data({
                    propertyId,
                    dateRanges: [{ startDate, endDate }],
                    dimensions: [{ name: 'customEvent:click_label' }],
                    metrics: [{ name: 'totalUsers' }],
                    dimensionFilter: {
                        filter: { fieldName: 'customEvent:click_label', stringFilter: { matchType: 'ENDS_WITH', value: `__${suffix}` } },
                    },
                    limit: 10000,
                }, accessToken)
                for (const row of report.rows ?? []) {
                    const label = row.dimensionValues?.[0]?.value?.trim() ?? ''
                    if (!label.endsWith(`__${suffix}`)) continue
                    const p = clickStepPrefix(label.slice(0, label.length - suffix.length - 2))
                    if (p) prefixes.set(p.prefix, p.stepName)
                }
            }
            if (prefixes.size === 0) {
                throw new FunnelConfigError('サフィックス付きクリックラベルからステップ（StepN_）を検出できませんでした')
            }

            const variantSuffix = new Map<VariantKey, string>()
            for (const { variant, suffix } of detected) variantSuffix.set(variant, suffix)
            clickVariants = ['A', ...variantSuffix.keys()]

            const tasks = [...prefixes.entries()].flatMap(([prefix, stepName]) =>
                (clickVariants as VariantKey[]).map((variant) => ({ prefix, stepName, variant }))
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
                    return countUsers(propertyId, accessToken, [{ startDate, endDate }], dimensionFilter)
                }))
                chunk.forEach((t, idx) => counts.set(`${t.prefix}|${t.variant}`, values[idx]))
            }

            clickStepsWithUsers = [...prefixes.entries()].map(([prefix, stepName]) => ({
                stepName,
                dimension: 'customEvent:click_label',
                users: Object.fromEntries(
                    (clickVariants as VariantKey[]).map((v) => [v, counts.get(`${prefix}|${v}`) ?? 0])
                ) as Partial<Record<VariantKey, number>>,
            }))
            mode = 'auto'
        }

        // ベースラベル（サフィックス除去後）→ ステップ設定（ビュー基準のみ）
        const stepsByKey = new Map<string, FunnelStepConfig>()
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
                        dimensionFilter: {
                            filter: {
                                fieldName: dimension,
                                stringFilter: { matchType: 'ENDS_WITH', value: `__${suffix}` },
                            },
                        },
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
                    const key = `${dimension} ${baseLabel}`
                    const existing = stepsByKey.get(key)
                    if (existing) {
                        existing.labels[variant] = [label]
                    } else {
                        stepsByKey.set(key, {
                            stepName: stepNameFromBaseLabel(baseLabel),
                            dimension,
                            labels: { A: [baseLabel], [variant]: [label] },
                        })
                    }
                }
                found = true
                break
            }
            if (!found) {
                throw new FunnelConfigError(`サフィックス「__${suffix}」の付いたラベルがGA4データに見つかりませんでした`)
            }
        }
        if (!clickStepsWithUsers) {
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
        return { stepName: step.stepName, dimension: step.dimension, users }
    })

    if (mode === 'auto') {
        // GTMのview_labelは「50%以上1秒連続表示」で発火するため、滞在の短いステップは
        // 実際より少なく計測されユーザー数順が崩れることがある（例: Step1 < Step2）。
        // ラベルにStep番号があればそれを優先し、無ければAユーザー数降順にフォールバック
        const allHaveOrder = stepsWithUsers.every((s) => stepOrderFromName(s.stepName) !== null)
        stepsWithUsers = stepsWithUsers
            .sort((a, b) =>
                allHaveOrder
                    ? stepOrderFromName(a.stepName)! - stepOrderFromName(b.stepName)!
                    : (b.users.A ?? 0) - (a.users.A ?? 0)
            )
            .slice(0, AUTO_MAX_STEPS)
    }

    const firstUsers: Partial<Record<VariantKey, number>> = {}
    const prevUsers: Partial<Record<VariantKey, number>> = {}
    const steps: AbTestFunnelStep[] = stepsWithUsers.map((step, index) => {
        const values: AbTestFunnelStep['values'] = {}
        for (const v of activeVariants) {
            const users = step.users[v]
            if (users == null) continue
            if (index === 0) firstUsers[v] = users
            const first = firstUsers[v]
            const prev = prevUsers[v]
            values[v] = {
                users,
                conversionRate: index > 0 && first != null && first > 0 ? users / first : null,
                dropoffRate: index > 0 && prev != null && prev > 0 ? Math.max(0, (prev - users) / prev) : null,
            }
            prevUsers[v] = users
        }
        return { stepName: step.stepName, dimension: step.dimension, values }
    })

    return {
        mode,
        basis: mode === 'auto' ? basis : 'view',
        detectedSuffixes,
        startDate,
        endDate,
        variants: activeVariants,
        steps,
    }
}
