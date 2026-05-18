'use client'

import styles from './PeriodSelector.module.css'
import DateInput from '@/components/DateInput'
import type { Period } from '@/app/funnel/types'
import type { PeriodSelectorProps } from './types'

export default function PeriodSelector({ periods, onPeriodsChange }: PeriodSelectorProps) {
    const addPeriod = () => {
        const today = new Date()
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)

        const formatDate = (date: Date) => {
            return date.toISOString().split('T')[0]
        }

        onPeriodsChange([
            ...periods,
            {
                label: `期間${periods.length + 1}`,
                startDate: formatDate(yesterday),
                endDate: formatDate(today),
            },
        ])
    }

    const removePeriod = (index: number) => {
        if (periods.length > 2) {
            onPeriodsChange(periods.filter((_, i) => i !== index))
        }
    }

    const updatePeriod = (index: number, field: keyof Period, value: string) => {
        const newPeriods = [...periods]
        newPeriods[index] = { ...newPeriods[index], [field]: value }
        onPeriodsChange(newPeriods)
    }

    const setQuickPeriod = (type: 'lastWeek' | 'thisWeek' | 'lastMonth' | 'thisMonth') => {
        const today = new Date()
        const formatDate = (date: Date) => date.toISOString().split('T')[0]

        let periodA: Period
        let periodB: Period

        switch (type) {
            case 'lastWeek':
                const lastWeekStart = new Date(today)
                lastWeekStart.setDate(today.getDate() - 14)
                const lastWeekEnd = new Date(today)
                lastWeekEnd.setDate(today.getDate() - 8)
                periodA = {
                    label: '先週',
                    startDate: formatDate(lastWeekStart),
                    endDate: formatDate(lastWeekEnd),
                }
                const thisWeekStart = new Date(today)
                thisWeekStart.setDate(today.getDate() - 7)
                periodB = {
                    label: '今週',
                    startDate: formatDate(thisWeekStart),
                    endDate: formatDate(today),
                }
                break
            case 'thisWeek':
                const thisWeekStart2 = new Date(today)
                thisWeekStart2.setDate(today.getDate() - 7)
                periodA = {
                    label: '今週',
                    startDate: formatDate(thisWeekStart2),
                    endDate: formatDate(today),
                }
                periodB = {
                    label: '今週（最新）',
                    startDate: formatDate(today),
                    endDate: formatDate(today),
                }
                break
            case 'lastMonth':
                const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
                const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
                periodA = {
                    label: '先月',
                    startDate: formatDate(lastMonthStart),
                    endDate: formatDate(lastMonthEnd),
                }
                const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
                periodB = {
                    label: '今月',
                    startDate: formatDate(thisMonthStart),
                    endDate: formatDate(today),
                }
                break
            case 'thisMonth':
                const thisMonthStart2 = new Date(today.getFullYear(), today.getMonth(), 1)
                periodA = {
                    label: '今月',
                    startDate: formatDate(thisMonthStart2),
                    endDate: formatDate(today),
                }
                periodB = {
                    label: '今月（最新）',
                    startDate: formatDate(today),
                    endDate: formatDate(today),
                }
                break
        }

        onPeriodsChange([periodA, periodB])
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2 className={styles.title}>期間比較設定</h2>
                <div className={styles.quickSelectButtons}>
                    <button
                        type="button"
                        onClick={() => setQuickPeriod('lastWeek')}
                        className={styles.quickSelectButton}
                    >
                        先週 vs 今週
                    </button>
                    <button
                        type="button"
                        onClick={() => setQuickPeriod('lastMonth')}
                        className={styles.quickSelectButton}
                    >
                        先月 vs 今月
                    </button>
                </div>
            </div>

            <div className={styles.periodsList}>
                {periods.map((period, index) => (
                    <div key={index} className={styles.periodItem}>
                        <div className={styles.periodHeader}>
                            <h3 className={styles.periodTitle}>期間{index === 0 ? 'A' : index === 1 ? 'B' : String.fromCharCode(65 + index)}</h3>
                            {periods.length > 2 && (
                                <button
                                    type="button"
                                    onClick={() => removePeriod(index)}
                                    className={styles.removeButton}
                                >
                                    削除
                                </button>
                            )}
                        </div>
                        <div className={styles.periodFields}>
                            <div className={styles.field}>
                                <label className={styles.fieldLabel}>ラベル</label>
                                <input
                                    type="text"
                                    value={period.label}
                                    onChange={(e) => updatePeriod(index, 'label', e.target.value)}
                                    className={styles.fieldInput}
                                    placeholder={`期間${index + 1}`}
                                />
                            </div>
                            <div className={styles.field}>
                                <label className={styles.fieldLabel}>開始日</label>
                                                                    <DateInput
                                                                    value={period.startDate}
                                    onChange={(e) => updatePeriod(index, 'startDate', e.target.value)}
                                    className={styles.fieldInput}
                                    required
                                />
                            </div>
                            <div className={styles.field}>
                                <label className={styles.fieldLabel}>終了日</label>
                                                                    <DateInput
                                                                    value={period.endDate}
                                    onChange={(e) => updatePeriod(index, 'endDate', e.target.value)}
                                    className={styles.fieldInput}
                                    required
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {periods.length < 3 && (
                <button
                    type="button"
                    onClick={addPeriod}
                    className={styles.addButton}
                >
                    期間を追加
                </button>
            )}
        </div>
    )
}
