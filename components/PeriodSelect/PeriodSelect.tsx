'use client'

import DateInput from '@/components/DateInput'
import type { PeriodRangeState } from '@/hooks/usePeriodRange'
import { DEFAULT_PERIOD_OPTIONS, type DateRange, type PeriodOption, daysAgoStr, withCustomOption } from '@/lib/utils/period'
import styles from './PeriodSelect.module.css'

export interface PeriodSelectProps {
    state: PeriodRangeState
    /** 省略時は DEFAULT_PERIOD_OPTIONS。allowCustom が true なら 今月 / 前月 / カスタム を末尾に補う */
    options?: PeriodOption[]
    /** 既定 true。全ページでカスタム期間を使えるようにする */
    allowCustom?: boolean
    /** セレクトの前に出すラベル（FilterBar の中で使うとき） */
    label?: string
    /** 集計期間の実表示（データ取得後の startDate〜endDate）。指定時のみ表示 */
    resolved?: DateRange | null
}

export default function PeriodSelect({
    state,
    options,
    allowCustom = true,
    label,
    resolved,
}: PeriodSelectProps) {
    const base = options ?? DEFAULT_PERIOD_OPTIONS
    const list = allowCustom ? withCustomOption(base) : base.filter((o) => o.value !== 'custom')
    const selectCls = styles.select
    const dateCls = styles.dateInput
    const noteCls = styles.note

    return (
        <>
            {label && <span className={styles.label}>{label}</span>}
            <select
                className={selectCls}
                value={state.period}
                onChange={(e) => state.setPeriod(e.target.value)}
                aria-label={label ?? '期間'}
            >
                {list.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>
            {state.period === 'custom' && (
                <>
                    <DateInput
                        className={dateCls}
                        value={state.customStart}
                        max={state.customEnd}
                        onChange={(e) => state.setCustomStart(e.target.value)}
                    />
                    <span className={noteCls}>〜</span>
                    <DateInput
                        className={dateCls}
                        value={state.customEnd}
                        min={state.customStart}
                        max={daysAgoStr(0)}
                        onChange={(e) => state.setCustomEnd(e.target.value)}
                    />
                </>
            )}
            {resolved && (
                <span className={noteCls}>集計期間: {resolved.startDate} 〜 {resolved.endDate}</span>
            )}
        </>
    )
}
