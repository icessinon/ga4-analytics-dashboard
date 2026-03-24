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

const utcDayOnlyMs = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())

/**
 * recurring 用: 直近に時刻を迎えたスロット（slot <= now のうち最新）を返す。
 * calculateNextExecutionDate の日次は「次の slot >= now」のため、予定を数分過ぎると翌日扱いになり
 * findAbTestsToExecute の「実行待ち」と整合しない。
 */
function getLatestPassedRecurringSlot(
    config: ScheduleConfig,
    startDate: Date,
    endDate: Date | null,
    lastExecutedAt: Date | null,
    now: Date
): Date | null {
    if (!config.recurringPattern) return null
    const timeStr = config.recurringPattern.time || '09:00'

    switch (config.recurringPattern.frequency) {
        case 'daily': {
            const endDayMs = endDate ? utcDayOnlyMs(endDate) : null
            let day = new Date(startDate)
            if (lastExecutedAt) {
                day = new Date(lastExecutedAt)
                day.setUTCDate(day.getUTCDate() + 1)
            }
            let latestPassed: Date | null = null
            for (let i = 0; i < 400; i++) {
                if (endDayMs !== null && utcDayOnlyMs(day) > endDayMs) break
                const slot = dateAtTimeJST(day, timeStr)
                if (endDayMs !== null && utcDayOnlyMs(new Date(slot)) > endDayMs) {
                    day.setUTCDate(day.getUTCDate() + 1)
                    continue
                }
                if (slot > now) break
                latestPassed = slot
                day.setUTCDate(day.getUTCDate() + 1)
            }
            return latestPassed
        }

        case 'weekly': {
            const daysOfWeek = config.recurringPattern.daysOfWeek || [0]
            const startDayMs = utcDayOnlyMs(startDate)
            const endDayMs = endDate ? utcDayOnlyMs(endDate) : null
            let latestPassed: Date | null = null
            for (let back = 0; back < 7; back++) {
                const d = new Date(now)
                d.setUTCDate(d.getUTCDate() - back)
                if (!daysOfWeek.includes(d.getUTCDay())) continue
                const slot = dateAtTimeJST(d, timeStr)
                if (slot > now) continue
                const slotDay = utcDayOnlyMs(new Date(slot))
                if (slotDay < startDayMs) continue
                if (endDayMs !== null && slotDay > endDayMs) continue
                if (!latestPassed || slot > latestPassed) latestPassed = slot
            }
            return latestPassed
        }

        case 'monthly': {
            const dayOfMonth = config.recurringPattern.dayOfMonth || 1
            const startDayMs = utcDayOnlyMs(startDate)
            const endDayMs = endDate ? utcDayOnlyMs(endDate) : null

            const slotForMonth = (base: Date) => {
                const monthlyDate = new Date(base)
                monthlyDate.setUTCDate(dayOfMonth)
                return dateAtTimeJST(monthlyDate, timeStr)
            }

            let monthlyDate = new Date(now)
            let slot = slotForMonth(monthlyDate)
            if (slot > now) {
                monthlyDate.setUTCMonth(monthlyDate.getUTCMonth() - 1)
                slot = slotForMonth(monthlyDate)
            }
            if (slot > now) return null
            const slotDay = utcDayOnlyMs(new Date(slot))
            if (slotDay < startDayMs) return null
            if (endDayMs !== null && slotDay > endDayMs) return null
            return slot
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

        let windowMs: number
        if (config.executionType === 'scheduled') {
            windowMs = 2 * 60 * 1000
        } else if (config.executionType === 'recurring') {
            windowMs = 15 * 60 * 1000
        } else {
            windowMs = 120 * 60 * 1000
        }

        let anchor: Date | null = null

        if (config.executionType === 'recurring') {
            if (now < abTest.startDate) continue
            if (abTest.endDate && now > abTest.endDate) continue
            const latestPassed = getLatestPassedRecurringSlot(
                config,
                abTest.startDate,
                abTest.endDate,
                abTest.lastExecutedAt,
                now
            )
            const lagMs = latestPassed ? now.getTime() - latestPassed.getTime() : -1
            if (latestPassed && lagMs >= 0 && lagMs <= windowMs) {
                anchor = latestPassed
            }
        } else {
            const nextExecution = calculateNextExecutionDate(
                config,
                abTest.startDate,
                abTest.endDate,
                abTest.lastExecutedAt
            )
            if (nextExecution && nextExecution <= now) anchor = nextExecution
        }

        if (!anchor) continue

        const executionStart = new Date(anchor.getTime() - windowMs)
        const executionEnd = new Date(anchor.getTime() + windowMs)
        const existingExecution = await prisma.abTestReportExecution.findFirst({
            where: {
                abTestId: abTest.id,
                createdAt: { gte: executionStart, lte: executionEnd },
                status: { in: ['completed', 'running'] },
            },
        })

        if (!existingExecution) {
            abTestIds.push(abTest.id)
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
