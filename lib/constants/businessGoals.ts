/**
 * 2026 下期の成果目標 M1〜M3（求人広告の応募が対象）。
 *
 * **出典は goal-tracker の GOAL_DATA v4.2（2026-10-04・三木さん確定）で、ここはその写し。**
 * 目標値・マイルストーンを変えるときは goal-tracker 側も必ず直す。原本は
 * Notion https://app.notion.com/p/3a596d4ad402814682fdee7d7eb8ed23
 *
 * 10月・11月のマイルストーンは 9 月実績と 12 月目標を直線で結んだ仮値（v4.2 時点で未確定）。
 * M4（プロダクト品質・セキュリティ運営）は数値目標ではないのでここには無い。
 *
 * 12 月の応募 300 件のうち、ここで追う自分の担当は M1 160 ＋ M2 30 ＝ 190 件。
 * 残り 110 件（応募同時登録・人材紹介側の配信・広告）は三木さん管轄で、この画面の対象外。
 */

import type { BusinessKpiMonth } from '@/lib/services/kpi/businessKpiTypes'

export interface BusinessGoal {
    id: 'M1' | 'M2' | 'M3'
    no: number
    title: string
    /** 何を数えているかの一文。画面にそのまま出す */
    definition: string
    /** 'YYYY-MM' → その月に到達していたい値 */
    milestones: Record<string, number>
    /** 期末（12月）の目標 */
    target: number
    /** 比重（%） */
    weight: number
    /** 実績の取り出し方。求人広告の流入分類から引く */
    actual: (m: BusinessKpiMonth) => number
    note?: string
}

export const BUSINESS_GOALS: readonly BusinessGoal[] = [
    {
        id: 'M1', no: 1, title: '登録〜応募導線の改善',
        definition: 'プロダクト経由＋LINE公式の応募（求人広告）。スカウト／人材紹介側の配信／応募同時登録／広告を除いた、会員の応募',
        milestones: { '2026-09': 124, '2026-10': 136, '2026-11': 148, '2026-12': 160 },
        target: 160, weight: 35,
        actual: (m) => m.jobAdBySource.product + m.jobAdBySource.line,
        note: '内訳目標はプロダクト経由 97→120・LINE公式 27→40。M3 は M1 の内数',
    },
    {
        id: 'M2', no: 2, title: 'スカウトの土台構築と計測',
        definition: 'スカウト経由の応募（求人広告）。scout_id があるか applied_kind が scout_apply / scout_inquiry',
        milestones: { '2026-09': 7, '2026-10': 16, '2026-11': 26, '2026-12': 30 },
        target: 30, weight: 25,
        actual: (m) => m.jobAdBySource.scout,
        note: '12月30件のうち28件を代行が担う想定。一斉送信の応募率 0.057%→0.15% が前提',
    },
    {
        id: 'M3', no: 3, title: 'LINE公式アカウント経由応募の拡大',
        definition: 'LINE公式アカウント経由の応募（求人広告）。utm source_last = line',
        milestones: { '2026-09': 27, '2026-10': 31, '2026-11': 36, '2026-12': 40 },
        target: 40, weight: 15,
        actual: (m) => m.jobAdBySource.line,
        note: 'M1 の内数。支える指標は LINE 連携率（全体 21.3%→22% / 新規 23.7%→26%）と product の LINE 配信 11→17 件',
    },
]

/** goal-tracker 側の更新日。画面に出して、写しであることを分かるようにする */
export const BUSINESS_GOALS_SOURCE = {
    version: 'v4.2',
    updatedAt: '2026-10-04',
    period: '2026下期',
    notionUrl: 'https://app.notion.com/p/3a596d4ad402814682fdee7d7eb8ed23',
} as const
