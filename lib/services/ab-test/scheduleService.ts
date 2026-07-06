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

/**
 * JSTの暦日をUTCフィールドで読めるように+9hシフトした Date を返す。
 * now 由来の日時から「JSTでの今日・曜日」を求める際に必須（UTC日付だとJST 00:00〜08:59で前日にズレる）
 */
function shiftToJst(d: Date): Date {
    return new Date(d.getTime() + 9 * 60 * 60 * 1000)
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
 * 一回限りタイプ（on_end / on_end_delayed / scheduled）の実行予定日時を返す。
 * on_end は最終日のGA4データが揃ってから集計するため、終了日の翌日 09:00 JST に実行する。
 */
function getOneShotAnchor(config: ScheduleConfig, endDate: Date | null): Date | null {
    const timeStr = config.recurringPattern?.time || '09:00'
    switch (config.executionType) {
        case 'on_end': {
            if (!endDate) return null
            const nextDay = new Date(endDate)
            nextDay.setUTCDate(nextDay.getUTCDate() + 1)
            return dateAtTimeJST(nextDay, timeStr)
        }
        case 'on_end_delayed': {
            if (!endDate) return null
            const delayed = new Date(endDate)
            delayed.setUTCDate(delayed.getUTCDate() + Math.max(1, config.delayDays || 1))
            return dateAtTimeJST(delayed, timeStr)
        }
        case 'scheduled':
            return config.scheduledDate ? parseScheduledDateAsJST(config.scheduledDate) : null
        default:
            return null
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
        case 'on_end': {
            if (!endDate) return null
            // 最終日のデータが揃ってから実行するため、終了日の翌日に実行する
            const endExecution = getOneShotAnchor(config, endDate)
            return endExecution && endExecution >= now ? endExecution : null
        }

        case 'on_end_delayed': {
            if (!endDate) return null
            const delayedAtJST = getOneShotAnchor(config, endDate)
            return delayedAtJST && delayedAtJST >= now ? delayedAtJST : null
        }

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
                        // lastExecutedAt のJST暦日+1日から探索（UTC日付だとJST 00:00〜08:59実行時に同日を再計算してしまう）
                        day = shiftToJst(lastExecutedAt)
                        day.setUTCDate(day.getUTCDate() + 1)
                    }
                    for (let i = 0; i < 400; i++) {
                        if (endDayMs !== null && utcDayOnly(day) > endDayMs) return null
                        const slot = dateAtTimeJST(day, timeStr)
                        if (slot >= now) return slot
                        day.setUTCDate(day.getUTCDate() + 1)
                    }
                    return null
                }

                case 'weekly': {
                    const daysOfWeek = [...(config.recurringPattern.daysOfWeek || [0])].sort((a, b) => a - b)
                    const jstNow = shiftToJst(now)
                    const currentDay = jstNow.getUTCDay()
                    if (daysOfWeek.includes(currentDay)) {
                        const todayAtTime = dateAtTimeJST(jstNow, timeStr)
                        if (todayAtTime >= now) return todayAtTime
                    }
                    const nextDay = daysOfWeek.find((d: number) => d > currentDay) ?? daysOfWeek[0]
                    const daysUntilNext = nextDay > currentDay
                        ? nextDay - currentDay
                        : 7 - currentDay + nextDay
                    const weeklyDate = shiftToJst(now)
                    weeklyDate.setUTCDate(weeklyDate.getUTCDate() + daysUntilNext)
                    return dateAtTimeJST(weeklyDate, timeStr)
                }

                case 'monthly': {
                    const dayOfMonth = config.recurringPattern.dayOfMonth || 1
                    const monthlyDate = shiftToJst(now)
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
                // lastExecutedAt のJST暦日+1日から探索（UTC日付だとJST 00:00〜08:59実行時に同日スロットを再検出してしまう）
                day = shiftToJst(lastExecutedAt)
                day.setUTCDate(day.getUTCDate() + 1)
            }
            let latestPassed: Date | null = null
            for (let i = 0; i < 400; i++) {
                if (endDayMs !== null && utcDayOnlyMs(day) > endDayMs) break
                const slot = dateAtTimeJST(day, timeStr)
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
                // JST暦日で曜日判定（UTC日付だとJST 00:00〜08:59のスロットが見つからない）
                const d = shiftToJst(now)
                d.setUTCDate(d.getUTCDate() - back)
                if (!daysOfWeek.includes(d.getUTCDay())) continue
                const slot = dateAtTimeJST(d, timeStr)
                if (slot > now) continue
                const slotDay = utcDayOnlyMs(d)
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
                return { slot: dateAtTimeJST(monthlyDate, timeStr), dayMs: utcDayOnlyMs(monthlyDate) }
            }

            const monthlyDate = shiftToJst(now)
            let { slot, dayMs } = slotForMonth(monthlyDate)
            if (slot > now) {
                monthlyDate.setUTCMonth(monthlyDate.getUTCMonth() - 1)
                ;({ slot, dayMs } = slotForMonth(monthlyDate))
            }
            if (slot > now) return null
            if (dayMs < startDayMs) return null
            if (endDayMs !== null && dayMs > endDayMs) return null
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

    // recurring: スロットを過ぎてから実行を許容する猶予（cron 5分間隔の遅延を吸収）
    const RECURRING_WINDOW_MS = 15 * 60 * 1000
    // 一回限り（on_end / on_end_delayed / scheduled）: 予定時刻を過ぎてもこの範囲内ならキャッチアップ実行する
    // （スケジューラ停止からの復帰時に、何ヶ月も前のテストが一斉発火しないよう上限を設ける）
    const ONE_SHOT_CATCHUP_MS = 48 * 60 * 60 * 1000
    // 失敗が続く場合のリトライ上限（Slack/BQへの無限スパム防止）
    const MAX_FAILED_RETRIES = 3

    for (const abTest of abTests) {
        const config = abTest.scheduleConfig as unknown as ScheduleConfig
        if (!config || !config.enabled) continue

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
            if (latestPassed && lagMs >= 0 && lagMs <= RECURRING_WINDOW_MS) {
                anchor = latestPassed
            }
        } else {
            const target = getOneShotAnchor(config, abTest.endDate)
            if (target && target <= now && now.getTime() - target.getTime() <= ONE_SHOT_CATCHUP_MS) {
                anchor = target
            }
        }

        if (!anchor) continue

        // アンカー以降に実行済みならスキップ
        if (abTest.lastExecutedAt && abTest.lastExecutedAt >= anchor) continue

        // アンカー以降の実行レコードで重複判定（実行はアンカー通過後に起きるため上限は不要。
        // 上限を設けると cron 遅延でレコードが窓の外に落ち、無限再実行になる）
        const executions = await prisma.abTestReportExecution.findMany({
            where: {
                abTestId: abTest.id,
                createdAt: { gte: anchor },
            },
            select: { status: true },
        })
        if (executions.some((e) => e.status === 'completed' || e.status === 'running')) continue
        if (executions.filter((e) => e.status === 'failed').length >= MAX_FAILED_RETRIES) continue

        abTestIds.push(abTest.id)
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
