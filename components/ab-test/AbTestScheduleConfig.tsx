'use client'

import { useState, useEffect } from 'react'
import DateInput from '@/components/DateInput'
import CustomSelect from '@/components/CustomSelect'
import NeonCheckbox from '@/components/NeonCheckbox'
import styles from './AbTestScheduleConfig.module.css'

export interface ScheduleConfig {
    enabled: boolean
    executionType: 'on_end' | 'on_end_delayed' | 'scheduled' | 'recurring'
    delayDays?: number
    scheduledDate?: string
    scheduledTime?: string
    recurringPattern?: {
        frequency: 'daily' | 'weekly' | 'monthly'
        time: string
        daysOfWeek?: number[]
        dayOfMonth?: number
    }
}

interface Props {
    value: ScheduleConfig
    onChange: (config: ScheduleConfig) => void
}

export default function AbTestScheduleConfig({ value, onChange }: Props) {
    const [config, setConfig] = useState<ScheduleConfig>(value)

    useEffect(() => {
        setConfig(value)
    }, [value])

    const updateConfig = (updates: Partial<ScheduleConfig>) => {
        const newConfig = { ...config, ...updates }
        setConfig(newConfig)
        onChange(newConfig)
    }

    return (
        <div className={styles.scheduleConfig}>
            <NeonCheckbox
                checked={config.enabled}
                onChange={(enabled) => updateConfig({ enabled })}
                className={styles.checkboxLabel}
            >
                <span>自動実行を有効にする</span>
            </NeonCheckbox>

            {config.enabled && (
                <div className={styles.executionType}>
                    <label className={styles.radioLabel}>
                        <input
                            type="radio"
                            name="executionType"
                            value="on_end"
                            checked={config.executionType === 'on_end'}
                            onChange={() => updateConfig({ executionType: 'on_end' })}
                        />
                        <span>期間終了後すぐ実行</span>
                    </label>

                    <label className={styles.radioLabel}>
                        <input
                            type="radio"
                            name="executionType"
                            value="on_end_delayed"
                            checked={config.executionType === 'on_end_delayed'}
                            onChange={() => updateConfig({ executionType: 'on_end_delayed' })}
                        />
                        <span>期間終了後</span>
                        {config.executionType === 'on_end_delayed' && (
                            <input
                                type="number"
                                min="1"
                                value={config.delayDays || 0}
                                onChange={(e) => updateConfig({ delayDays: parseInt(e.target.value, 10) || 0 })}
                                className={styles.numberInput}
                            />
                        )}
                        <span>日後に実行</span>
                    </label>

                    <label className={styles.radioLabel}>
                        <input
                            type="radio"
                            name="executionType"
                            value="scheduled"
                            checked={config.executionType === 'scheduled'}
                            onChange={() => updateConfig({ executionType: 'scheduled' })}
                        />
                        <span>特定の日時に実行</span>
                        {config.executionType === 'scheduled' && (
                            <div className={styles.dateTimeInputs}>
                                                                    <DateInput
                                                                    value={config.scheduledDate?.split('T')[0] || ''}
                                    onChange={(e) => {
                                        const date = e.target.value
                                        const time = config.scheduledTime || '09:00'
                                        updateConfig({ scheduledDate: date ? `${date}T${time}` : undefined })
                                    }}
                                />
                                <input
                                    type="time"
                                    value={config.scheduledTime || '09:00'}
                                    onChange={(e) => {
                                        const time = e.target.value
                                        const date = config.scheduledDate?.split('T')[0] || ''
                                        updateConfig({ 
                                            scheduledTime: time,
                                            scheduledDate: date ? `${date}T${time}` : undefined 
                                        })
                                    }}
                                />
                            </div>
                        )}
                    </label>

                    <label className={styles.radioLabel}>
                        <input
                            type="radio"
                            name="executionType"
                            value="recurring"
                            checked={config.executionType === 'recurring'}
                            onChange={() => updateConfig({ executionType: 'recurring' })}
                        />
                        <span>期間中も定期的に実行</span>
                        {config.executionType === 'recurring' && (
                            <div className={styles.recurringConfig}>
                                <CustomSelect
                                    value={config.recurringPattern?.frequency || 'daily'}
                                    onChange={(v) => updateConfig({
                                        recurringPattern: {
                                            ...config.recurringPattern,
                                            frequency: v as 'daily' | 'weekly' | 'monthly',
                                            time: config.recurringPattern?.time || '09:00',
                                        }
                                    })}
                                    options={[
                                        { value: 'daily', label: '毎日' },
                                        { value: 'weekly', label: '毎週' },
                                        { value: 'monthly', label: '毎月' },
                                    ]}
                                    triggerClassName={styles.recurringSelect}
                                    aria-label="実行頻度"
                                />
                                <input
                                    type="time"
                                    value={config.recurringPattern?.time || '09:00'}
                                    onChange={(e) => updateConfig({
                                        recurringPattern: {
                                            ...config.recurringPattern,
                                            time: e.target.value,
                                            frequency: config.recurringPattern?.frequency || 'daily',
                                        }
                                    })}
                                />
                                {config.recurringPattern?.frequency === 'weekly' && (
                                    <div className={styles.daysOfWeek}>
                                        {['日', '月', '火', '水', '木', '金', '土'].map((day, index) => (
                                            <NeonCheckbox
                                                key={index}
                                                checked={config.recurringPattern?.daysOfWeek?.includes(index) || false}
                                                onChange={(checked) => {
                                                    const days = config.recurringPattern?.daysOfWeek || []
                                                    const newDays = checked
                                                        ? [...days, index]
                                                        : days.filter(d => d !== index)
                                                    updateConfig({
                                                        recurringPattern: {
                                                            ...config.recurringPattern,
                                                            daysOfWeek: newDays,
                                                            frequency: 'weekly',
                                                            time: config.recurringPattern?.time || '09:00',
                                                        }
                                                    })
                                                }}
                                                className={styles.dayCheckbox}
                                            >
                                                {day}
                                            </NeonCheckbox>
                                        ))}
                                    </div>
                                )}
                                {config.recurringPattern?.frequency === 'monthly' && (
                                    <div className={styles.monthlyConfig}>
                                        <span>毎月</span>
                                        <input
                                            type="number"
                                            min="1"
                                            max="31"
                                            value={config.recurringPattern?.dayOfMonth || 1}
                                            onChange={(e) => updateConfig({
                                                recurringPattern: {
                                                    ...config.recurringPattern,
                                                    dayOfMonth: parseInt(e.target.value, 10) || 1,
                                                    frequency: 'monthly',
                                                    time: config.recurringPattern?.time || '09:00',
                                                }
                                            })}
                                            className={styles.numberInput}
                                        />
                                        <span>日</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </label>
                </div>
            )}
        </div>
    )
}
