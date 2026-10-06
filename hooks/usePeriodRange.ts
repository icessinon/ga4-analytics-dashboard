'use client'

import { useMemo, useState } from 'react'
import { type DateRange, daysAgoStr, resolveRange } from '@/lib/utils/period'

/**
 * 期間プリセット＋カスタム日付レンジの状態をまとめて扱うフック。
 * range はカスタム未確定（開始>終了など）のとき null になるので、API 呼び出し側でガードする。
 *
 * initialRange を渡すと、プリセットではなくその日付でカスタム状態から始める
 * （DateInput 直置きだったページが「具体日付で初期化」していた挙動を引き継ぐため）。
 */
export function usePeriodRange(defaultPeriod = '30daysAgo', opts?: { initialRange?: DateRange }) {
    const [period, setPeriod] = useState(opts?.initialRange ? 'custom' : defaultPeriod)
    const [customStart, setCustomStart] = useState(opts?.initialRange?.startDate ?? daysAgoStr(30))
    const [customEnd, setCustomEnd] = useState(opts?.initialRange?.endDate ?? daysAgoStr(1))
    const range = useMemo(
        () => resolveRange(period, customStart, customEnd),
        [period, customStart, customEnd]
    )
    return { period, setPeriod, customStart, setCustomStart, customEnd, setCustomEnd, range }
}

export type PeriodRangeState = ReturnType<typeof usePeriodRange>
