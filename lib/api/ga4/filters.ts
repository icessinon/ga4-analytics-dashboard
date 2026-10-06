/**
 * GA4 Data API の dimensionFilter 組み立て。
 *
 * route ごとに `{ filter: { fieldName, stringFilter: { matchType, value } } }` を手書きしていた
 * （BEGINS_WITH 33 箇所 / EXACT 28 箇所 / orGroup・andGroup 18 ファイル）のを関数にする。
 *
 * 送信する JSON の形は手書き時代と同じにしてある:
 *  - and() / or() は式が 1 つなら group で包まない（包むと GA4 のレスポンスは同じだが
 *    リクエスト body が変わり、移行前後の比較で差分に見えるため）
 *  - anyOf() は値が 1 つでも orGroup にする（`orGroup: { expressions: values.map(...) }` の
 *    直書きがそう振る舞っていたため）
 * 国フィルタ（country=Japan）は client.ts が最後に AND するので、ここでは扱わない。
 */

export type Ga4FilterExpression = Record<string, unknown>

export type Ga4MatchType = 'EXACT' | 'BEGINS_WITH' | 'ENDS_WITH' | 'CONTAINS' | 'FULL_REGEXP' | 'PARTIAL_REGEXP'

/** 文字列フィルタ 1 本。`customEvent:click_label` のようなカスタム次元もそのまま渡せる */
export function stringFilter(fieldName: string, matchType: Ga4MatchType, value: string, caseSensitive?: boolean): Ga4FilterExpression {
    return {
        filter: {
            fieldName,
            stringFilter: {
                matchType,
                value,
                ...(caseSensitive !== undefined ? { caseSensitive } : {}),
            },
        },
    }
}

export const exact = (fieldName: string, value: string) => stringFilter(fieldName, 'EXACT', value)
export const beginsWith = (fieldName: string, value: string) => stringFilter(fieldName, 'BEGINS_WITH', value)
export const endsWith = (fieldName: string, value: string) => stringFilter(fieldName, 'ENDS_WITH', value)
export const contains = (fieldName: string, value: string) => stringFilter(fieldName, 'CONTAINS', value)
/** 全体一致の正規表現（`^/driver(/.*)?$` のような URL 配下指定に使う） */
export const regexp = (fieldName: string, pattern: string) => stringFilter(fieldName, 'FULL_REGEXP', pattern)
export const partialRegexp = (fieldName: string, pattern: string) => stringFilter(fieldName, 'PARTIAL_REGEXP', pattern)

/** inListFilter。値が多いときは EXACT の orGroup より短い */
export function inList(fieldName: string, values: string[], caseSensitive?: boolean): Ga4FilterExpression {
    return {
        filter: {
            fieldName,
            inListFilter: { values, ...(caseSensitive !== undefined ? { caseSensitive } : {}) },
        },
    }
}

/** 数値フィルタ。operation は GA4 の NumericFilter.Operation */
export function numeric(
    fieldName: string,
    operation: 'EQUAL' | 'LESS_THAN' | 'LESS_THAN_OR_EQUAL' | 'GREATER_THAN' | 'GREATER_THAN_OR_EQUAL',
    value: number,
): Ga4FilterExpression {
    const numericValue = Number.isInteger(value) ? { int64Value: String(value) } : { doubleValue: value }
    return { filter: { fieldName, numericFilter: { operation, value: numericValue } } }
}

/** 同じ次元が values のどれかに一致（matchType 省略時は EXACT）。値が 1 つでも orGroup にする */
export function anyOf(fieldName: string, values: readonly string[], matchType: Ga4MatchType = 'EXACT'): Ga4FilterExpression {
    return { orGroup: { expressions: values.map((v) => stringFilter(fieldName, matchType, v)) } }
}

/** AND。式が 1 つならそのまま返す */
export function and(...expressions: Ga4FilterExpression[]): Ga4FilterExpression {
    if (expressions.length === 1) return expressions[0]
    return { andGroup: { expressions } }
}

/** OR。式が 1 つならそのまま返す */
export function or(...expressions: Ga4FilterExpression[]): Ga4FilterExpression {
    if (expressions.length === 1) return expressions[0]
    return { orGroup: { expressions } }
}

export function not(expression: Ga4FilterExpression): Ga4FilterExpression {
    return { notExpression: expression }
}
