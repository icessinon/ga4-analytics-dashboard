/**
 * プロダクト目標の読み書き。**目標値はここ（Postgres）が正**で、実績は
 * businessKpiService がプロダクトDBから自動で数える。画面で目標を変えても
 * 実績の数え方（metricKey）は GOAL_METRICS に定義されたものだけを許す。
 *
 * 目標が 1 件も無いプロダクトには、初回の読み込みでテンプレートを入れる
 * （2026 下期の目標の初期値）。入ったあとは画面の設定が正で、テンプレートを
 * 直しても既存の設定には影響しない。
 */

import { prisma } from '@/lib/db/client'
import { INITIAL_GOAL_PERIOD, INITIAL_GOAL_TEMPLATE, isGoalMetricKey } from '@/lib/constants/businessGoals'
import { HttpError } from '@/lib/http/errorResponse'
import type { ProductGoal, ProductGoalInput } from './productGoalsTypes'

type Row = {
    id: number; productId: number; metricKey: string; label: string; note: string | null
    target: number | null; weight: number | null; milestones: unknown; sortOrder: number
    periodStart: string | null; periodEnd: string | null
}

/** milestones は JSON カラムなので、形が崩れていても落ちないように読む */
function parseMilestones(v: unknown): Record<string, number> {
    if (v == null || typeof v !== 'object' || Array.isArray(v)) return {}
    const out: Record<string, number> = {}
    for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
        if (!/^\d{4}-\d{2}$/.test(k)) continue
        const n = Number(raw)
        if (Number.isFinite(n)) out[k] = n
    }
    return out
}

function toGoal(r: Row): ProductGoal {
    return {
        id: r.id,
        productId: r.productId,
        // DB に入っている metricKey が GOAL_METRICS から消されている可能性があるので必ず検査する
        metricKey: isGoalMetricKey(r.metricKey) ? r.metricKey : 'apps_total',
        label: r.label,
        note: r.note,
        target: r.target,
        weight: r.weight,
        milestones: parseMilestones(r.milestones),
        sortOrder: r.sortOrder,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
    }
}

export function parseProductId(v: unknown): number {
    const id = Number(v)
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'productId が必要です')
    return id
}

export async function listProductGoals(productId: number): Promise<{ goals: ProductGoal[]; seeded: boolean }> {
    const where = { productId, isActive: true }
    let rows = (await prisma.productGoal.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })) as Row[]

    let seeded = false
    if (rows.length === 0) {
        await prisma.productGoal.createMany({
            data: INITIAL_GOAL_TEMPLATE.map((t, i) => ({
                productId, metricKey: t.metricKey, label: t.label,
                target: t.target, weight: t.weight, milestones: t.milestones,
                note: t.note, sortOrder: i,
                periodStart: INITIAL_GOAL_PERIOD.start, periodEnd: INITIAL_GOAL_PERIOD.end,
            })),
        })
        rows = (await prisma.productGoal.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })) as Row[]
        seeded = true
    }
    return { goals: rows.map(toGoal), seeded }
}

function validate(input: ProductGoalInput): void {
    if (!isGoalMetricKey(input.metricKey)) throw new HttpError(400, `指標 ${input.metricKey} は選べません`)
    if (!input.label?.trim()) throw new HttpError(400, '目標の名前を入れてください')
    // 目標値は未設定でよい（実績だけ見たい指標がある）。入っているなら数値であること
    if (input.target != null && !Number.isFinite(input.target)) throw new HttpError(400, '目標値を数値で入れてください')
    for (const [name, v] of [['開始月', input.periodStart], ['終了月', input.periodEnd]] as const) {
        if (v != null && v !== '' && !/^\d{4}-\d{2}$/.test(v)) throw new HttpError(400, `${name}は YYYY-MM で入れてください`)
    }
    if (input.periodStart && input.periodEnd && input.periodStart > input.periodEnd) {
        throw new HttpError(400, '期の開始月が終了月より後になっています')
    }
    for (const [k, v] of Object.entries(input.milestones ?? {})) {
        if (!/^\d{4}-\d{2}$/.test(k)) throw new HttpError(400, `月の指定 ${k} が YYYY-MM ではありません`)
        if (!Number.isFinite(v)) throw new HttpError(400, `${k} の目安を数値で入れてください`)
    }
}

/** 画面の「保存」。渡された分だけ作成・更新する（渡されなかった既存行は触らない） */
export async function saveProductGoals(productId: number, inputs: ProductGoalInput[]): Promise<ProductGoal[]> {
    inputs.forEach(validate)
    for (const [i, input] of inputs.entries()) {
        const data = {
            metricKey: input.metricKey,
            label: input.label.trim(),
            note: input.note?.trim() || null,
            target: input.target ?? null,
            weight: input.weight ?? null,
            periodStart: input.periodStart || null,
            periodEnd: input.periodEnd || null,
            milestones: input.milestones ?? {},
            sortOrder: input.sortOrder ?? i,
        }
        if (input.id) {
            // 他プロダクトの行を書き換えられないよう productId でも絞る
            await prisma.productGoal.updateMany({ where: { id: input.id, productId }, data })
        } else {
            await prisma.productGoal.create({ data: { ...data, productId } })
        }
    }
    const rows = (await prisma.productGoal.findMany({
        where: { productId, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    })) as Row[]
    return rows.map(toGoal)
}

/** 消すのではなく isActive を落とす（過去の設定を追えるように） */
export async function deleteProductGoal(productId: number, id: number): Promise<void> {
    const n = await prisma.productGoal.updateMany({ where: { id, productId }, data: { isActive: false } })
    if (n.count === 0) throw new HttpError(404, '対象の目標が見つかりません')
}
