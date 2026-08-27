/**
 * CV1件あたりの期待売上（円）。CA活動履歴基準（2026-08-27算出）。
 *
 * 算出: CV(RegistHistory__c) → そのCVのCA活動履歴(RH_AgentActivityHistory__c = AgentActivityHistory__c)
 *   → 紐づくマッチング(Matching__c.MA_AgentActivityHistory__c) のうち フェーズ Field2__c=「7.入社済」の
 *   受注額(MA_ClosingFee__c) − 返金想定額(Estimated_refund_amount__c) を、コホートのCV件数で割る。
 * ※求職者単位で全マッチングを合算しない（同一求職者は平均約2.6件のCA活動履歴を持ち、CVと無関係な
 *   成約まで乗って過大評価になる）。一方、応募求人だけに絞るのも誤り（旧2026-08-07版の欠陥）で、
 *   CAが応募者を別求人=特に人材紹介案件へ再マッチして生んだ成約という売上主体を取りこぼす。
 *   CA活動履歴基準はこの中庸で、CVを起点にCAが動いて生んだ成約を過不足なく捕捉する。
 * コホート: 登録日2025-01〜2025-12（会員登録のみ2025-08〜2025-12）。成約リードタイム確保のため
 *   登録上限を2025-12に固定（直近コホートは入社が未成熟で単価が過小になるため）。
 * 受注額ベース（検収・入金ベースではない）。再算出手順・背景はメモリ project_cv_unit_value.md 参照。
 */
export const CV_UNIT_VALUE_YEN: Record<string, number> = {
    JobR: 15850,
    JobA: 28069,
    JobH: 12765,
    signup: 19760,
}

export const CV_UNIT_VALUE_ASOF = '2026-08-27'

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
        cohort: '2025-08〜2025-12',
        events: 3938,
        uniq: 3749,
        hires: 87,
        grossFeeYen: 81_560_469,
        refundYen: 3_745_883,
        unitYen: 19760,
        note: 'サイト経由（オーガニック 求人詳細ページ(web)/Topページ）の純登録のみ。CVに紐づくCA活動履歴経由の入社を計上',
    },
    {
        key: 'JobR',
        label: '人材紹介 応募',
        cohort: '2025-01〜2025-12',
        events: 28353,
        uniq: 17741,
        hires: 556,
        grossFeeYen: 476_137_977,
        refundYen: 26_724_040,
        unitYen: 15850,
        note: 'CVのCA活動履歴に紐づく入社（応募求人＋CAが後日組成した紹介成約を含む）',
    },
    {
        key: 'JobA',
        label: '求人広告 応募',
        cohort: '2025-01〜2025-12',
        events: 1182,
        uniq: 867,
        hires: 68,
        grossFeeYen: 34_167_787,
        refundYen: 990_000,
        unitYen: 28069,
        note: '入社の多くはCAが人材紹介案件へ再マッチした成約。広告の掲載課金売上は含まない・小標本',
    },
    {
        key: 'JobH',
        label: 'ハローワーク 応募',
        cohort: '2025-01〜2025-12',
        events: 3375,
        uniq: 1927,
        hires: 53,
        grossFeeYen: 47_158_135,
        refundYen: 4_077_516,
        unitYen: 12765,
        note: 'HW求人自体は成約手数料ゼロ。売上主体はCAが人材紹介案件へ再マッチした成約',
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
