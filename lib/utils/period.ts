// 期間プリセット＋カスタム日付指定の共通ロジック。
// クライアント側で具体日付（YYYY-MM-DD）に解決してAPIへ渡す。

export interface DateRange {
    startDate: string
    endDate: string
}

export function fmtYmd(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function daysAgoStr(days: number): string {
    const d = new Date()
    d.setDate(d.getDate() - days)
    return fmtYmd(d)
}

// 今月・前月はクライアントで具体日付に変換する（終端は昨日まで）
export function monthRange(offset: 0 | -1): DateRange {
    const now = new Date()
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    const last = offset === 0 ? (yesterday < first ? first : yesterday) : new Date(now.getFullYear(), now.getMonth(), 0)
    return { startDate: fmtYmd(first), endDate: fmtYmd(last) }
}

// period（プリセット or 'custom'）を具体日付レンジに解決。カスタム未入力・逆転時は null
export function resolveRange(period: string, customStart: string, customEnd: string): DateRange | null {
    if (period === 'thisMonth') return monthRange(0)
    if (period === 'lastMonth') return monthRange(-1)
    if (period === 'custom') {
        if (!customStart || !customEnd || customStart > customEnd) return null
        return { startDate: customStart, endDate: customEnd }
    }
    const m = period.match(/^(\d+)daysAgo$/)
    if (m) return { startDate: daysAgoStr(parseInt(m[1], 10)), endDate: daysAgoStr(1) }
    return { startDate: period, endDate: 'yesterday' }
}

export interface PeriodOption {
    value: string
    label: string
}

export const DEFAULT_PERIOD_OPTIONS: PeriodOption[] = [
    { value: '7daysAgo', label: '過去7日' },
    { value: '14daysAgo', label: '過去14日' },
    { value: '30daysAgo', label: '過去30日' },
    { value: '90daysAgo', label: '過去90日' },
    { value: 'thisMonth', label: '今月' },
    { value: 'lastMonth', label: '前月' },
    { value: 'custom', label: 'カスタム（日付指定）' },
]

// ページ固有のプリセットに 今月/前月/カスタム を追加する
export function withCustomOption(options: PeriodOption[]): PeriodOption[] {
    const extras: PeriodOption[] = []
    if (!options.some((o) => o.value === 'thisMonth')) extras.push({ value: 'thisMonth', label: '今月' })
    if (!options.some((o) => o.value === 'lastMonth')) extras.push({ value: 'lastMonth', label: '前月' })
    if (!options.some((o) => o.value === 'custom')) extras.push({ value: 'custom', label: 'カスタム（日付指定）' })
    return [...options, ...extras]
}
