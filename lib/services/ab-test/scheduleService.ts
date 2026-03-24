import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/client'

const pad2 = (n: number) => n.toString().padStart(2, '0')

/** 編集フォームで入力した "YYYY-MM-DDTHH:mm" を JST（Asia/Tokyo）として解釈。Docker(UTC)でも表示と一致させる */
function parseScheduledDateAsJST(s: string): Date | null {
    if (!s || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return null
    const withTz = /[Z+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}+09:00`
    const d = new Date(withTz)
    return isNaN(d.getTime()) ? null : d
}

/** 指定日の HH:mm を JST として解釈した Date を返す（on_end / recurring 等で同一表示にするため） */
function dateAtTimeJST(d: Date, time: string): Date {
    const [h = 9, m = 0] = time.split(':').map(Number)
    const y = d.getUTCFullYear()
    const mo = d.getUTCMonth() + 1
    const day = d.getUTCDate()
    return new Date(`${y}-${pad2(mo)}-${pad2(day)}T${pad2(h)}:${pad2(m)}:00+09:00`)
}

export interface ScheduleConfig {
    enabled: boolean
    executionType: 'on_end' | 'on_end_delayed' | 'scheduled' | 'recurring'
    delayDays?: number
    scheduledDate?: string
    recurringPattern?: {
        frequency: 'daily' | 'weekly' | 'monthly'
        time: string
        daysOfWeek?: number[]
        dayOfMonth?: number
    }
}

/**
 * 次回実行予定日時を計算
 * @param config - スケジュール設定
 * @param startDate - ABテスト開始日
 * @param endDate - ABテスト終了日（nullの場合は未設定）
 * @param lastExecutedAt - 最後の実行日時（nullの場合は未実行）
 * @returns 次回実行予定日時、またはnull（実行予定がない場合）
 */
export function calculateNextExecutionDate(
    config: ScheduleConfig,
    startDate: Date,
    endDate: Date | null,
    lastExecutedAt: Date | null
): Date | null {
    if (!config.enabled) return null
    if (config.executionType !== 'recurring' && !endDate) return null

    const now = new Date()
    const timeStr = config.recurringPattern?.time || '09:00'

    switch (config.executionType) {
        case 'on_end':
            if (!endDate) return null
            const endExecution = dateAtTimeJST(endDate, timeStr)
            return endExecution >= now ? endExecution : null

        case 'on_end_delayed':
            if (!endDate) return null
            const delayedDate = new Date(endDate)
            delayedDate.setUTCDate(delayedDate.getUTCDate() + (config.delayDays || 0))
            const delayedAtJST = dateAtTimeJST(delayedDate, timeStr)
            return delayedAtJST >= now ? delayedAtJST : null

        case 'scheduled':
            if (!config.scheduledDate) return null
            const scheduled = parseScheduledDateAsJST(config.scheduledDate)
            if (!scheduled) {
                console.error(`[ScheduleService] Invalid scheduledDate: ${config.scheduledDate}`)
                return null
            }
            return scheduled

        case 'recurring': {
            if (now < startDate) return null
            if (endDate && now > endDate) return null
            if (!config.recurringPattern) return null

            switch (config.recurringPattern.frequency) {
                case 'daily': {
                    const utcDayOnly = (d: Date) =>
                        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
                    const endDayMs = endDate ? utcDayOnly(endDate) : null
                    let day = new Date(startDate)
                    if (lastExecutedAt) {
                        day = new Date(lastExecutedAt)
                        day.setUTCDate(day.getUTCDate() + 1)
                    }
                    for (let i = 0; i < 400; i++) {
                        if (endDayMs !== null && utcDayOnly(day) > endDayMs) return null
                        const slot = dateAtTimeJST(day, timeStr)
                        if (endDayMs !== null && utcDayOnly(new Date(slot)) > endDayMs) {
                            day.setUTCDate(day.getUTCDate() + 1)
                            continue
                        }
                        if (slot >= now) return slot
                        day.setUTCDate(day.getUTCDate() + 1)
                    }
                    return null
                }

                case 'weekly': {
                    const daysOfWeek = config.recurringPattern.daysOfWeek || [0]
                    const currentDay = now.getUTCDay()
                    if (daysOfWeek.includes(currentDay)) {
                        const todayAtTime = dateAtTimeJST(new Date(now.getTime()), timeStr)
                        if (todayAtTime >= now) return todayAtTime
                    }
                    const nextDay = daysOfWeek.find((d: number) => d > currentDay) ?? daysOfWeek[0]
                    const daysUntilNext = nextDay > currentDay
                        ? nextDay - currentDay
                        : 7 - currentDay + nextDay
                    const weeklyDate = new Date(now)
                    weeklyDate.setUTCDate(weeklyDate.getUTCDate() + daysUntilNext)
                    return dateAtTimeJST(weeklyDate, timeStr)
                }

                case 'monthly': {
                    const dayOfMonth = config.recurringPattern.dayOfMonth || 1
                    const monthlyDate = new Date(now)
                    monthlyDate.setUTCDate(dayOfMonth)
                    let monthlyAtJST = dateAtTimeJST(monthlyDate, timeStr)
                    if (monthlyAtJST < now) {
                        monthlyDate.setUTCMonth(monthlyDate.getUTCMonth() + 1)
                        monthlyAtJST = dateAtTimeJST(monthlyDate, timeStr)
                    }
                    return monthlyAtJST
                }

                default:
                    return null
            }
        }

        default:
            return null
    }
}

/**
 * 実行すべきABテストを検索
 * スケジュール設定に基づいて、現在実行すべきABテストのIDリストを返す
 * @returns 実行すべきABテストのID配列
 */
export async function findAbTestsToExecute(): Promise<number[]> {
    const now = new Date()
    const abTests = await prisma.abTest.findMany({
        where: {
            status: 'running',
            autoExecute: true,
            scheduleConfig: { not: Prisma.JsonNull },
        },
    })

    const abTestIds: number[] = []

    for (const abTest of abTests) {
        const config = abTest.scheduleConfig as unknown as ScheduleConfig
        if (!config || !config.enabled) continue

        const nextExecution = calculateNextExecutionDate(
            config,
            abTest.startDate,
            abTest.endDate,
            abTest.lastExecutedAt
        )

        // 実行時刻が現在時刻を過ぎている場合
        if (nextExecution && nextExecution <= now) {
            const config = abTest.scheduleConfig as unknown as ScheduleConfig
            let existingExecution = null
            
            if (config.executionType === 'scheduled') {
                const windowMs = 2 * 60 * 1000
                const executionStart = new Date(nextExecution.getTime() - windowMs)
                const executionEnd = new Date(nextExecution.getTime() + windowMs)
                existingExecution = await prisma.abTestReportExecution.findFirst({
                    where: {
                        abTestId: abTest.id,
                        createdAt: { gte: executionStart, lte: executionEnd },
                        status: { in: ['completed', 'running'] },
                    },
                })
            } else {
                const executionDate = new Date(nextExecution)
                executionDate.setHours(0, 0, 0, 0)
                const nextDay = new Date(executionDate)
                nextDay.setDate(nextDay.getDate() + 1)

                existingExecution = await prisma.abTestReportExecution.findFirst({
                    where: {
                        abTestId: abTest.id,
                        createdAt: {
                            gte: executionDate,
                            lt: nextDay,
                        },
                        status: { in: ['completed', 'running'] },
                    },
                })
            }

            if (!existingExecution) {
                abTestIds.push(abTest.id)
            }
        }
    }

    return abTestIds
}

/**
 * 次回実行予定日時を取得
 * @param abTestId - ABテストID
 * @returns 次回実行予定日時、またはnull（実行予定がない場合）
 */
export async function getNextExecutionDate(abTestId: number): Promise<Date | null> {
    const abTest = await prisma.abTest.findUnique({
        where: { id: abTestId },
    })

    if (!abTest || !abTest.scheduleConfig) return null

    const config = abTest.scheduleConfig as unknown as ScheduleConfig
    return calculateNextExecutionDate(
        config,
        abTest.startDate,
        abTest.endDate,
        abTest.lastExecutedAt
    )
}
