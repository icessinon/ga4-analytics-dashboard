/**
 * ABテストの ga4Config に保存されたフィルタ設定から GA4 Data API の dimensionFilter を組み立てる。
 *
 * - filter: 含める条件。expression がカンマ区切りの場合は OR。
 * - excludeFilter: 除外条件（notExpression）。カンマ区切りの場合はすべて除外（AND of NOT）。
 *   例: LP経由ユーザーを除外する { dimension: 'pageLocation', operator: 'CONTAINS', expression: 'userId=' }
 */
export interface Ga4ConfigFilterSpec {
    dimension?: string
    operator?: string
    expression?: string
}

export function buildGa4ConfigDimensionFilter(config: {
    filter?: Ga4ConfigFilterSpec
    excludeFilter?: Ga4ConfigFilterSpec
}): Record<string, unknown> | undefined {
    const toExpressions = (spec?: Ga4ConfigFilterSpec): Array<Record<string, unknown>> => {
        if (!spec?.dimension || !spec?.operator || !spec?.expression) return []
        return spec.expression
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .map((value) => ({
                filter: {
                    fieldName: spec.dimension as string,
                    stringFilter: { matchType: (spec.operator as string).toUpperCase(), value },
                },
            }))
    }

    const includes = toExpressions(config.filter)
    const excludes = toExpressions(config.excludeFilter).map((e) => ({ notExpression: e }))

    const parts: Array<Record<string, unknown>> = []
    if (includes.length === 1) parts.push(includes[0])
    else if (includes.length > 1) parts.push({ orGroup: { expressions: includes } })
    parts.push(...excludes)

    if (parts.length === 0) return undefined
    if (parts.length === 1) return parts[0]
    return { andGroup: { expressions: parts } }
}
