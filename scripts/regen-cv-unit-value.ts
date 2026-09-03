/**
 * CV単価（期待売上換算）再生成スクリプト。
 *
 * lib/constants/cvUnitValue.ts はSalesforce実績からの逆算値だが、アプリはSFにランタイム接続していないため手動更新。
 * 本スクリプトは scripts/data/cv-unit/derivations.json（コホート集計値）から
 * 単価 unitYen = round((受注額 grossFeeYen − 返金想定額 refundYen) ÷ CV件数 events) を計算し、
 * lib/constants/cvUnitValue.ts を丸ごと再生成する（算術ミス・ASOF付け忘れを無くす）。
 *
 * ── 更新手順（四半期に1回目安） ───────────────────────────
 * 1) 下記SOQL/ロジックで CV種別ごとのコホート集計を出す（複数オブジェクト結合のため一括SOQL不可・段階実行）:
 *    a) CV = RegistHistory__c（登録日でコホート絞り込み。会員登録=単独登録のみ / JobR|JobA|JobH=各応募）
 *    b) 各CVの CA活動履歴 RH_AgentActivityHistory__c(=AgentActivityHistory__c) を辿る
 *    c) その活動履歴に紐づく Matching__c(MA_AgentActivityHistory__c) のうち フェーズ Field2__c='7.入社済' の
 *       受注額 MA_ClosingFee__c 合計 = grossFeeYen、返金想定額 Estimated_refund_amount__c 合計 = refundYen、入社数 = hires
 *    d) events = そのCV種別のCV件数、uniq = ユニーク求職者数
 *    e) 応募3種別は同一入社の二重計上を除去（優先度 人材紹介>求人広告>ハローワーク）
 *    f) コホート: 登録2025-01〜2025-12（会員登録のみ2025-08〜2025-12）、直近2ヶ月は成約未成熟のため除外
 * 2) 結果を scripts/data/cv-unit/derivations.json の各フィールド（events/uniq/hires/grossFeeYen/refundYen/note）に反映。
 *    asof も更新。
 * 3) npx tsx scripts/regen-cv-unit-value.ts   → lib/constants/cvUnitValue.ts を再生成。
 *    （--asof=YYYY-MM-DD で上書き可。既定は derivations.json の asof）
 *
 * 注: 会員登録の単価は「純登録＋下流価値」の運用値だが、算術上も (受注額−返金)/events と一致する。
 *    下流価値の内訳（¥13,650＋¥6,110 等）はnoteに記述する運用。
 * ──────────────────────────────────────────────────────
 */
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const IN_FILE = join(process.cwd(), 'scripts/data/cv-unit/derivations.json')
const OUT_FILE = join(process.cwd(), 'lib/constants/cvUnitValue.ts')

interface RawDerivation {
    key: string
    label: string
    cohort: string
    events: number
    uniq: number
    hires: number
    grossFeeYen: number
    refundYen: number
    note?: string
    /** 単価を明示指定したい場合のみ（既定は (grossFee−refund)/events の四捨五入） */
    unitYen?: number
}

function main() {
    const input = JSON.parse(readFileSync(IN_FILE, 'utf8')) as { asof: string; derivations: RawDerivation[] }
    const asofArg = process.argv.find((a) => a.startsWith('--asof='))?.split('=')[1]
    const asof = asofArg ?? input.asof

    const rows = input.derivations.map((d) => {
        const unitYen = d.unitYen ?? Math.round((d.grossFeeYen - d.refundYen) / d.events)
        return { ...d, unitYen }
    })
    const valueMap = Object.fromEntries(rows.map((r) => [r.key, r.unitYen]))

    const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    // 大きな金額は桁区切り _ で可読化（例 81_560_469）
    const u = (n: number) => n.toLocaleString('en-US').replace(/,/g, '_')
    const derivBlock = rows
        .map(
            (r) => `    {
        key: '${r.key}',
        label: '${esc(r.label)}',
        cohort: '${esc(r.cohort)}',
        events: ${r.events},
        uniq: ${r.uniq},
        hires: ${r.hires},
        grossFeeYen: ${u(r.grossFeeYen)},
        refundYen: ${u(r.refundYen)},
        unitYen: ${r.unitYen},${r.note ? `\n        note: '${esc(r.note)}',` : ''}
    },`
        )
        .join('\n')

    const out = `/**
 * CV1件あたりの期待売上（円）。CA活動履歴基準（${asof}算出）。
 * 【自動生成】scripts/regen-cv-unit-value.ts が scripts/data/cv-unit/derivations.json から生成。手で編集しない。
 *
 * 算出: CV(RegistHistory__c) → そのCVのCA活動履歴(RH_AgentActivityHistory__c = AgentActivityHistory__c)
 *   → 紐づくマッチング(Matching__c.MA_AgentActivityHistory__c) のうち フェーズ Field2__c=「7.入社済」の
 *   受注額(MA_ClosingFee__c) − 返金想定額(Estimated_refund_amount__c) を、コホートのCV件数で割る。
 * ※求職者単位で全マッチングを合算しない（同一求職者は平均約2.6件のCA活動履歴を持ち、CVと無関係な
 *   成約まで乗って過大評価になる）。一方、応募求人だけに絞るのも誤り（旧2026-08-07版の欠陥）で、
 *   CAが応募者を別求人=特に人材紹介案件へ再マッチして生んだ成約という売上主体を取りこぼす。
 *   CA活動履歴基準はこの中庸で、CVを起点にCAが動いて生んだ成約を過不足なく捕捉する。
 * ※応募3種別（JobR/JobA/JobH）は同一入社の二重計上を除去（優先度 人材紹介>求人広告>ハローワーク：
 *   複数チャネルで登録した人の入社は最上位チャネルに一意に寄せる）。会員登録(signup)は「登録の下流価値」
 *   指標のため応募との重複を許容し据え置き（合算はしない前提）。
 * コホート: 登録日2025-01〜2025-12（会員登録のみ2025-08〜2025-12）。成約リードタイム確保のため
 *   登録上限を2025-12に固定（直近コホートは入社が未成熟で単価が過小になるため）。
 * 受注額ベース（検収・入金ベースではない）。再算出手順は scripts/regen-cv-unit-value.ts ヘッダー、
 *   背景はメモリ project_cv_unit_value.md 参照。
 */
export const CV_UNIT_VALUE_YEN: Record<string, number> = {
    JobR: ${valueMap.JobR},
    JobA: ${valueMap.JobA},
    JobH: ${valueMap.JobH},
    signup: ${valueMap.signup},
}

export const CV_UNIT_VALUE_ASOF = '${asof}'

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
${derivBlock}
]

export function cvValueYen(key: string, count: number): number | null {
    const unit = CV_UNIT_VALUE_YEN[key]
    return unit != null ? unit * count : null
}

/** 「約120万円」のような丸め表示（有効2桁程度） */
export function formatYenApprox(yen: number): string {
    if (yen >= 100_000_000) return \`約\${(yen / 100_000_000).toFixed(1)}億円\`
    if (yen >= 10_000) {
        const man = yen / 10_000
        return \`約\${man >= 100 ? Math.round(man).toLocaleString() : man.toFixed(0)}万円\`
    }
    return \`約\${yen.toLocaleString()}円\`
}
`

    writeFileSync(OUT_FILE, out)
    console.log(`✅ 生成: ${OUT_FILE} (ASOF=${asof})`)
    for (const r of rows) console.log(`   ${r.key}: ¥${r.unitYen.toLocaleString()} = (¥${r.grossFeeYen.toLocaleString()} − ¥${r.refundYen.toLocaleString()}) / ${r.events.toLocaleString()}件 [成約率 ${((r.hires / r.events) * 100).toFixed(1)}%]`)
}

main()
