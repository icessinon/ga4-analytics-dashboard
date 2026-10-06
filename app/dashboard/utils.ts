/**
 * ダッシュボードページ用ユーティリティ
 */

import type { MonthOption } from './types'
import { rangeForGranularity } from '@/lib/services/dashboard/pageMetricsPeriod'

/**
 * 月選択用のオプション一覧を生成する（直近24ヶ月）
 */
export function getMonthOptions(): MonthOption[] {
    const now = new Date()
    const options: MonthOption[] = []
    for (let i = 0; i < 24; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        options.push({ value: `${y}-${m}`, label: `${y}年${d.getMonth() + 1}月` })
    }
    return options
}

/** 集計単位に応じた日付範囲。サーバー（series API）と同じ式を lib から使う */
export const getRangeForGranularity = rangeForGranularity

/**
 * グラフの対象期間ラベルを返す
 */
export function getChartPeriodLabel(
    month: string,
    granularity: 'daily' | 'weekly' | 'monthly',
    customStart?: string | null,
    customEnd?: string | null
): string {
    const fmtYMD = (s: string) => {
        const [yy, mm, dd] = s.split('-')
        return yy + '/' + mm + '/' + dd
    }
    if (customStart && customEnd) {
        return '指定期間: ' + fmtYMD(customStart) + '〜' + fmtYMD(customEnd)
    }
    const { startDate, endDate } = getRangeForGranularity(month, granularity)
    if (granularity === 'daily') {
        const [y, m] = month.split('-')
        const lastDay = new Date(Number(y), Number(m), 0).getDate()
        return `${y}年${Number(m)}月（${m}/1〜${m}/${lastDay}）`
    }
    if (granularity === 'weekly') {
        return `直近12週間（${fmtYMD(startDate)}〜${fmtYMD(endDate)}）`
    }
    const [sy, sm] = startDate.split('-')
    const [ey, em] = endDate.split('-')
    return `直近12ヶ月（${sy}年${Number(sm)}月〜${ey}年${Number(em)}月）`
}

/**
 * 期間キーをタイムスタンプに変換する（グラフX軸用）
 */
export function periodToTimestamp(period: string, granularity: 'daily' | 'weekly' | 'monthly'): number {
    if (granularity === 'monthly' && period.length === 6) {
        return new Date(period.slice(0, 4) + '-' + period.slice(4, 6) + '-01').getTime()
    }
    if (period.length === 10) {
        return new Date(period).getTime()
    }
    if (period.length === 8) {
        const y = period.slice(0, 4)
        const m = period.slice(4, 6)
        const d = period.slice(6, 8)
        return new Date(y + '-' + m + '-' + d).getTime()
    }
    return new Date(period).getTime()
}

/**
 * グラフX軸の目盛りラベル用にタイムスタンプをフォーマットする
 */
export function formatTimestampForAxis(t: number, granularity: 'daily' | 'weekly' | 'monthly'): string {
    const d = new Date(t)
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const y = d.getFullYear()
    if (granularity === 'monthly') return y + '/' + m
    if (granularity === 'weekly') return 'Wk ' + m + '/' + day
    return m + '/' + day
}
