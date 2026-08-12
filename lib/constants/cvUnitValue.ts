/**
 * CV1件あたりの期待売上（円）。
 *
 * Salesforce実測（2026-08-07算出）: 登録履歴(RegistHistory__c)でCVイベントを特定し、
 * 紐づく求職者のマッチング「7.入社済」の受注額(MA_ClosingFee__c)合計 − 返金想定額 を件数で割った値。
 * コホートは登録日2025-01〜2026-05（会員登録のみ2025-08〜2026-05）。直近2ヶ月は成約リードタイム未成熟のため除外。
 *
 * 受注額ベース（検収・入金ベースではない）。再算出手順はメモリ project_cv_unit_value.md 参照。
 */
export const CV_UNIT_VALUE_YEN: Record<string, number> = {
    JobR: 5300,
    JobA: 7800,
    JobH: 2800,
    signup: 18200,
}

export const CV_UNIT_VALUE_ASOF = '2026-08-07'

export interface CvUnitDerivation {
    key: string
    label: string
    cohort: string
    events: number
    uniq: number
    hires: number
    grossFeeYen: number
    refundYen: number
    unitYen: number
    note?: string
}

/** 単価の算出根拠（Salesforce実測値） */
export const CV_UNIT_DERIVATIONS: CvUnitDerivation[] = [
    {
        key: 'signup',
        label: '会員登録（応募を伴わない単独登録）',
        cohort: '2025-08〜2026-05',
        events: 6534,
        uniq: 6312,
        hires: 143,
        grossFeeYen: 128_195_505,
        refundYen: 9_375_387,
        unitYen: 18200,
        note: '登録者の29%にCA提案、6.4%が後日自ら応募、2.3%が入社。サイト経由（オーガニック・リスティング）の登録のみ',
    },
    {
        key: 'JobR',
        label: '人材紹介 応募',
        cohort: '2025-01〜2026-05',
        events: 46971,
        uniq: 30300,
        hires: 334,
        grossFeeYen: 262_021_510,
        refundYen: 10_882_960,
        unitYen: 5300,
        note: 'featured/CRM配信経由の応募イベントを含む',
    },
    {
        key: 'JobA',
        label: '求人広告 応募',
        cohort: '2025-01〜2026-05',
        events: 1688,
        uniq: 1300,
        hires: 29,
        grossFeeYen: 13_200_000,
        refundYen: 0,
        unitYen: 7800,
        note: '広告応募者が人材紹介にパスアップされ成約した紹介売上のみ。広告の掲載課金売上は含まない',
    },
    {
        key: 'JobH',
        label: 'ハローワーク 応募',
        cohort: '2025-01〜2026-05',
        events: 4859,
        uniq: 2952,
        hires: 19,
        grossFeeYen: 14_593_300,
        refundYen: 800_000,
        unitYen: 2800,
        note: '応募者の0.64%が入社（人材紹介へのパスアップ）。HW求人自体の直接売上はゼロ',
    },
]

export function cvValueYen(key: string, count: number): number | null {
    const unit = CV_UNIT_VALUE_YEN[key]
    return unit != null ? unit * count : null
}

/** 「約120万円」のような丸め表示（有効2桁程度） */
export function formatYenApprox(yen: number): string {
    if (yen >= 100_000_000) return `約${(yen / 100_000_000).toFixed(1)}億円`
    if (yen >= 10_000) {
        const man = yen / 10_000
        return `約${man >= 100 ? Math.round(man).toLocaleString() : man.toFixed(0)}万円`
    }
    return `約${yen.toLocaleString()}円`
}
