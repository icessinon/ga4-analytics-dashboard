/**
 * 推移ページ（会員登録 / 応募）で使う期間バケットの共通処理。
 *
 * 週は月曜始まり。期間の端で日数が欠けるバケットは partial を立てて、画面で
 * 「一部の日」と断れるようにする（欠けた週を他の週と同じ高さで並べると必ず落ち込んで見える）。
 */

export interface TrendSpan {
    start: string
    end: string
    label: string
    partial: boolean
}

export const ymd = (d: Date) => d.toISOString().slice(0, 10)

export function addDays(d: string, n: number): string {
    const t = new Date(`${d}T00:00:00Z`)
    t.setUTCDate(t.getUTCDate() + n)
    return ymd(t)
}

/** その日を含む週（月曜始まり）の開始日 */
export function weekStart(d: string): string {
    const t = new Date(`${d}T00:00:00Z`)
    t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7))
    return ymd(t)
}

export const monthStart = (d: string) => `${d.slice(0, 7)}-01`

export function monthEnd(d: string): string {
    const t = new Date(`${d.slice(0, 7)}-01T00:00:00Z`)
    t.setUTCMonth(t.getUTCMonth() + 1)
    t.setUTCDate(0)
    return ymd(t)
}

export function dayCount(start: string, end: string): number {
    return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1
}

/** 期間を週（月曜始まり）に割る */
export function weekSpans(startDate: string, endDate: string): TrendSpan[] {
    const out: TrendSpan[] = []
    for (let s = weekStart(startDate); s <= endDate; s = addDays(s, 7)) {
        const fullEnd = addDays(s, 6)
        const start = s < startDate ? startDate : s
        const end = fullEnd > endDate ? endDate : fullEnd
        out.push({
            start, end,
            label: `${Number(start.slice(5, 7))}/${Number(start.slice(8, 10))}`,
            partial: s < startDate || fullEnd > endDate,
        })
    }
    return out
}

/** 期間を暦月に割る */
export function monthSpans(startDate: string, endDate: string): TrendSpan[] {
    const out: TrendSpan[] = []
    for (let s = monthStart(startDate); s <= endDate; s = addDays(monthEnd(s), 1)) {
        const fullEnd = monthEnd(s)
        const start = s < startDate ? startDate : s
        const end = fullEnd > endDate ? endDate : fullEnd
        out.push({
            start, end,
            label: `${Number(start.slice(5, 7))}月`,
            partial: s < startDate || fullEnd > endDate,
        })
    }
    return out
}
