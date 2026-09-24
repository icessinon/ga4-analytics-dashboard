/**
 * ラベルマッチングユーティリティ
 * CVR設定のラベルで `*` ワイルドカードをサポートする。
 * 例: `SU__*__Label__StepLast_求人を探しに行く__B-1800` → 全職種のラベルに一致
 * `*` を含まないラベルは従来どおり完全一致。
 */

/** 全角＊を半角*に正規化（IME入力対策） */
function normalizeWildcardChars(label: string): string {
    return label.replace(/＊/g, '*')
}

/** ラベルに * ワイルドカードが含まれるか（全角＊も対象） */
export function hasWildcard(label: string): boolean {
    return normalizeWildcardChars(label).includes('*')
}

/**
 * ワイルドカードパターンを正規表現に変換する。
 * `*` は任意文字列（.*）、他の文字はすべてエスケープし、全体を ^…$ でアンカーする。
 * アンカーにより A案パターン（サフィックスなし）が `__B-1800` 付きラベルへ誤一致しない。
 */
export function wildcardToRegExp(pattern: string): RegExp {
    const normalized = normalizeWildcardChars(pattern)
    const escaped = normalized
        .split('*')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*')
    return new RegExp(`^${escaped}$`)
}

export interface WildcardPattern {
    pattern: string
    regexp: RegExp
}

export interface LabelMatcher {
    /** 値がいずれかのラベル/パターンに一致するか */
    match(value: string): boolean
    /** 完全一致ラベル（内訳の0件シード用） */
    exactLabels: string[]
    /** ワイルドカードパターン（コンパイル済み） */
    wildcardPatterns: WildcardPattern[]
}

/** 正規化済みラベル配列から matcher を構築 */
export function createLabelMatcher(labels: string[]): LabelMatcher {
    const exactLabels: string[] = []
    const wildcardPatterns: WildcardPattern[] = []
    for (const label of labels) {
        if (hasWildcard(label)) {
            wildcardPatterns.push({ pattern: label, regexp: wildcardToRegExp(label) })
        } else {
            exactLabels.push(label)
        }
    }
    const exactSet = new Set(exactLabels)
    return {
        match(value: string): boolean {
            if (exactSet.has(value)) return true
            return wildcardPatterns.some((p) => p.regexp.test(value))
        },
        exactLabels,
        wildcardPatterns,
    }
}
