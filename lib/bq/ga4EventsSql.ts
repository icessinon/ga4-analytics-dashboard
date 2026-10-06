import { GA4_EXPORT_DATASET, GA4_EXPORT_DEFAULT_FILTER, GA4_EXPORT_PROJECT, GA4_EXPORT_START } from './ga4EventsClient'

/**
 * GA4 BigQuery Export を読むサービス（userFlow / lineAssociation …）の共通部分。
 *
 * どのサービスも「期間をエクスポート範囲に丸める → events_* を _TABLE_SUFFIX で絞る →
 * 既定フィルタ（国・ホスト名）を付ける」を同じコードで持っていたので 1 箇所にする。
 * 生成する SQL 文字列は各サービスが直書きしていたものと同一（スキャン量・結果は変わらない）。
 */

/** Date → 'YYYYMMDD'（_TABLE_SUFFIX の形） */
export function toSuffix(d: Date): string {
    return d.toISOString().slice(0, 10).replace(/-/g, '')
}

/** 'YYYYMMDD' → 'YYYY-MM-DD' */
export function toDisplay(suffix: string): string {
    return `${suffix.slice(0, 4)}-${suffix.slice(4, 6)}-${suffix.slice(6, 8)}`
}

/** JST 基準の昨日。BQ の日次エクスポートは前日分までなので、終端の上限になる */
export function yesterdayJstSuffix(now = Date.now()): string {
    const nowJst = new Date(now + 9 * 3600 * 1000)
    const yesterday = new Date(nowJst)
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)
    return toSuffix(yesterday)
}

export interface ExportWindow {
    /** 'YYYYMMDD' */
    start: string
    /** 'YYYYMMDD' */
    end: string
    /** 指定期間がエクスポート開始日より前、または maxDays を超えていて切り詰めたとき true */
    clamped: boolean
}

/**
 * 'YYYY-MM-DD' の期間をエクスポートの存在範囲に丸める。
 * - 終端が昨日より後なら昨日に
 * - 始端が GA4_EXPORT_START より前なら開始日に（clamped）
 * - maxDays 指定時はそれを超える分を古い側から切る（clamped）
 * - 始端 > 終端 になったら 1 日に潰す
 */
export function clampToExportWindow(startDate: string, endDate: string, opts: { maxDays?: number; now?: number } = {}): ExportWindow {
    const yesterdaySuffix = yesterdayJstSuffix(opts.now)
    let start = startDate.replace(/-/g, '')
    let end = endDate.replace(/-/g, '')
    if (end > yesterdaySuffix) end = yesterdaySuffix
    let clamped = false
    if (start < GA4_EXPORT_START) {
        start = GA4_EXPORT_START
        clamped = true
    }
    if (opts.maxDays) {
        const endDateObj = new Date(`${toDisplay(end)}T00:00:00Z`)
        const minStart = new Date(endDateObj)
        minStart.setUTCDate(minStart.getUTCDate() - (opts.maxDays - 1))
        const minStartSuffix = toSuffix(minStart)
        if (start < minStartSuffix) {
            start = minStartSuffix
            clamped = true
        }
    }
    if (start > end) start = end
    return { start, end, clamped }
}

/**
 * `FROM events_* WHERE _TABLE_SUFFIX BETWEEN … AND 既定フィルタ` の断片。
 * WHERE 句の先頭なので、追加条件はこの後ろに `AND …` で続ける。
 */
export function eventsFromWhere(window: Pick<ExportWindow, 'start' | 'end'>): string {
    return `FROM \`${GA4_EXPORT_PROJECT}.${GA4_EXPORT_DATASET}.events_*\`
  WHERE _TABLE_SUFFIX BETWEEN '${window.start}' AND '${window.end}'${GA4_EXPORT_DEFAULT_FILTER}`
}
