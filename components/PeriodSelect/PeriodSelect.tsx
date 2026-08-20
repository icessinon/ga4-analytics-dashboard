'use client'

import { useMemo, useState } from 'react'
import { DateRange, PeriodOption, daysAgoStr, resolveRange } from '@/lib/utils/period'

// 期間プリセット＋カスタム日付レンジの状態をまとめて扱うフック。
// range はカスタム未確定（開始>終了など）のとき null になるので、API呼び出し側でガードする。
export function usePeriodRange(defaultPeriod = '30daysAgo') {
    const [period, setPeriod] = useState(defaultPeriod)
    const [customStart, setCustomStart] = useState(daysAgoStr(30))
    const [customEnd, setCustomEnd] = useState(daysAgoStr(1))
    const range = useMemo(
        () => resolveRange(period, customStart, customEnd),
        [period, customStart, customEnd]
    )
    return { period, setPeriod, customStart, setCustomStart, customEnd, setCustomEnd, range }
}

export type PeriodRangeState = ReturnType<typeof usePeriodRange>

interface Props {
    state: PeriodRangeState
    options: PeriodOption[]
    /** ページ既存の .select スタイルをそのまま流用する */
    selectClassName: string
    /** 「〜」区切りのスタイル（省略時は selectClassName に依存しない素のspan） */
    noteClassName?: string
    /** 集計期間の実表示（データ取得後のstartDate〜endDate）。指定時のみ表示 */
    resolved?: DateRange | null
}

export default function PeriodSelect({ state, options, selectClassName, noteClassName, resolved }: Props) {
    return (
        <>
            <select
                className={selectClassName}
                value={state.period}
                onChange={(e) => state.setPeriod(e.target.value)}
            >
                {options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>
            {state.period === 'custom' && (
                <>
                    <input
                        type="date"
                        className={selectClassName}
                        value={state.customStart}
                        max={state.customEnd}
                        onChange={(e) => state.setCustomStart(e.target.value)}
                    />
                    <span className={noteClassName}>〜</span>
                    <input
                        type="date"
                        className={selectClassName}
                        value={state.customEnd}
                        min={state.customStart}
                        max={daysAgoStr(0)}
                        onChange={(e) => state.setCustomEnd(e.target.value)}
                    />
                </>
            )}
            {resolved && (
                <span className={noteClassName}>集計期間: {resolved.startDate} 〜 {resolved.endDate}</span>
            )}
        </>
    )
}
