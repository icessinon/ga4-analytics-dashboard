/**
 * 求職者ペルソナ・スナップショット再生成スクリプト。
 *
 * このダッシュボードは Salesforce にランタイム接続していない（本番連携はZapier経由）ため、
 * lib/constants/personaSnapshot.ts は手動スナップショット。本スクリプトは
 * 「SOQLの生JSON → 正規化（登録サービス→事業領域）→ lib/constants/personaSnapshot.ts を丸ごと再生成」
 * を自動化し、転記ミス・算術ミス・職種正規化のブレを無くす。
 *
 * ── 使い方 ─────────────────────────────────────────────
 * 1) 下記 QUERIES の各SOQLを Salesforce で実行（Claude/MCP、Workbench、sfdx どれでも）。
 * 2) 各結果を scripts/data/persona/<key>.json に保存（{records:[...]} でも [...] でも可）。
 * 3) npx tsx scripts/regen-persona-snapshot.ts [--asof=YYYY-MM-DD]
 *    → lib/constants/personaSnapshot.ts を上書き生成。未マップの登録サービスがあれば警告する。
 *
 * Docker内で走らせる場合: docker exec ga4-dashboard-app-local npx tsx scripts/regen-persona-snapshot.ts
 * ──────────────────────────────────────────────────────
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const DATA_DIR = join(process.cwd(), 'scripts/data/persona')
const OUT_FILE = join(process.cwd(), 'lib/constants/personaSnapshot.ts')

/** 各入力JSONに対応するSOQL（コピペ用に明記）。alias（k/c/svc/occ/g）を必ずこの通りに。 */
export const QUERIES: Record<string, string> = {
    fill: `SELECT COUNT(Id) total, COUNT(Field90__c) age, COUNT(Field13__c) gender, COUNT(Field5__c) svc, COUNT(Field25__c) emp, COUNT(Field27__c) timing, COUNT(Field29__c) situation, COUNT(Field30__c) mood, COUNT(Field33__c) pref FROM CustomObject1__c`,
    overall_age: `SELECT Field90__c k, COUNT(Id) c FROM CustomObject1__c WHERE Field90__c!=null GROUP BY Field90__c`,
    overall_gender: `SELECT Field13__c k, COUNT(Id) c FROM CustomObject1__c WHERE Field13__c!=null GROUP BY Field13__c`,
    overall_genderByAge: `SELECT Field13__c g, Field90__c k, COUNT(Id) c FROM CustomObject1__c WHERE Field13__c!=null AND Field90__c!=null GROUP BY Field13__c, Field90__c`,
    overall_pref: `SELECT Field33__c k, COUNT(Id) c FROM CustomObject1__c WHERE Field33__c!=null GROUP BY Field33__c ORDER BY COUNT(Id) DESC LIMIT 15`,
    overall_emp: `SELECT Field25__c k, COUNT(Id) c FROM CustomObject1__c WHERE Field25__c!=null GROUP BY Field25__c ORDER BY COUNT(Id) DESC LIMIT 10`,
    overall_timing: `SELECT Field27__c k, COUNT(Id) c FROM CustomObject1__c WHERE Field27__c!=null GROUP BY Field27__c`,
    overall_situation: `SELECT Field29__c k, COUNT(Id) c FROM CustomObject1__c WHERE Field29__c!=null GROUP BY Field29__c`,
    overall_mood: `SELECT Field30__c k, COUNT(Id) c FROM CustomObject1__c WHERE Field30__c!=null GROUP BY Field30__c`,
    svc_age: `SELECT Field5__c svc, Field90__c k, COUNT(Id) c FROM CustomObject1__c WHERE Field90__c!=null AND Field5__c!=null GROUP BY Field5__c, Field90__c`,
    svc_gender: `SELECT Field5__c svc, Field13__c k, COUNT(Id) c FROM CustomObject1__c WHERE Field13__c!=null AND Field5__c!=null GROUP BY Field5__c, Field13__c`,
    svc_timing: `SELECT Field5__c svc, Field27__c k, COUNT(Id) c FROM CustomObject1__c WHERE Field27__c!=null AND Field5__c!=null GROUP BY Field5__c, Field27__c`,
    svc_situation: `SELECT Field5__c svc, Field29__c k, COUNT(Id) c FROM CustomObject1__c WHERE Field29__c!=null AND Field5__c!=null GROUP BY Field5__c, Field29__c`,
    occ_age: `SELECT DesiredOccupation__c occ, Field90__c k, COUNT(Id) c FROM CustomObject1__c WHERE Field90__c!=null AND DesiredOccupation__c!=null GROUP BY DesiredOccupation__c, Field90__c`,
    occ_gender: `SELECT DesiredOccupation__c occ, Field13__c k, COUNT(Id) c FROM CustomObject1__c WHERE Field13__c!=null AND DesiredOccupation__c!=null GROUP BY DesiredOccupation__c, Field13__c`,
    occ_timing: `SELECT DesiredOccupation__c occ, Field27__c k, COUNT(Id) c FROM CustomObject1__c WHERE Field27__c!=null AND DesiredOccupation__c!=null GROUP BY DesiredOccupation__c, Field27__c`,
    occ_situation: `SELECT DesiredOccupation__c occ, Field29__c k, COUNT(Id) c FROM CustomObject1__c WHERE Field29__c!=null AND DesiredOccupation__c!=null GROUP BY DesiredOccupation__c, Field29__c`,
}

const AGE_BANDS = ['10代', '20代', '30代', '40代', '50代', '60代以上']
const GENDERS = ['男性', '女性', 'その他']
const TIMINGS = ['なるべく早く', '1ヶ月以内', '2ヶ月以内', '3ヶ月以内', '未定', '今は情報収集したい']
const SITUATIONS = ['離職中／退職確定済', 'できるだけ早く辞めたい', '良い転職先なら辞めたい', '良い転職先なら検討する', '半年以上は辞められない', 'あまり辞める気は無い', 'その他']

/**
 * 登録サービス(Field5__c生値) → 事業領域ドメイン。表示順もこの配列順。
 * 新しい登録サービスが増えたら実行時に「未マップ」警告が出る→ここに追記する。
 */
const DOMAIN_MAP: Array<{ domain: string; services: string[] }> = [
    { domain: 'ドライバー（トラック）', services: ['ドライバーキャリア（ドライバー）', 'X Work - ドライバー', 'X Work - 運送', 'ドライバーキャリア（物流営業）'] },
    { domain: 'タクシー', services: ['ドライバーキャリア（タクシー）', 'X Work - タクシー'] },
    { domain: '倉庫・フォークリフト', services: ['ドライバーキャリア（倉庫作業・フォークリフト）', 'X Work - 倉庫作業・フォークリフト', 'ドライバーキャリア（倉庫管理者）', '倉庫作業'] },
    { domain: 'バス', services: ['ドライバーキャリア（バス）', 'X Work - バス'] },
    { domain: '運行管理', services: ['ドライバーキャリア（運行管理）', 'X Work - 運行管理'] },
    { domain: '建設・施工管理', services: ['建職キャリア', '建職キャリア（電気主任）', '建職キャリア（不動産）', '建職キャリア（ビルメンテナンス）', 'X Work - 建設', 'X Work - 建設（職人）', 'X Work - 建設（電気工事士）', 'X Work - 電気主任', '建職キャリアダイレクト'] },
    { domain: '製造・メーカー', services: ['メーカーキャリア', 'X Work - 製造'] },
    { domain: '整備士', services: ['整備士キャリア', 'X Work - 整備'] },
    { domain: '警備', services: ['セキュリティキャリア', 'X Work - 警備'] },
    { domain: '飲食', services: ['クロスワークエージェント - 飲食', 'X Work - 飲食'] },
    { domain: 'その他・エージェント', services: ['クロスワークエージェント', 'クロスワークエージェント - 営業', 'クロスワークエージェント - 第二新卒', 'クロスワークエージェント - 販売・事務', 'クロスワークエージェント - 栄養士', 'クロスワークエージェント - 介護士', 'クロスワークエージェント - キャリアアドバイザー', 'クロスワークエージェント - ホテル', 'X Work - その他', 'X Work', 'ロジキャリア', 'ジョブロジ'] },
]

/** 希望職種（細分類）で拾う上位職種。表示順もこの配列順。 */
const OCC_LIST = ['建築施工管理', '土木施工管理', '設計職', '電気主任技術者', '電気施工管理', 'その他施工管理', '営業職', '事務職', '現場作業員（職人・電気工事士など）', '製造オペレーター', '作業員(製造)', '自動車整備士']

type Rec = Record<string, unknown>
type Counts = Record<string, number>

function load(key: string): Rec[] {
    const path = join(DATA_DIR, `${key}.json`)
    if (!existsSync(path)) throw new Error(`入力が見つかりません: ${path}\n  対応SOQL:\n  ${QUERIES[key]}`)
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    const records = Array.isArray(raw) ? raw : raw.records
    if (!Array.isArray(records)) throw new Error(`${key}.json の形式が不正（records配列が無い）`)
    return records as Rec[]
}

const num = (v: unknown) => (typeof v === 'number' ? v : parseInt(String(v ?? '0'), 10)) || 0

/** 単一ディメンション（k,c）→ Counts */
function counts1(records: Rec[]): Counts {
    const out: Counts = {}
    for (const r of records) out[String(r.k)] = num(r.c)
    return out
}

/** グループ×軸（groupKey, k, c）→ Map<group, Counts> */
function counts2(records: Rec[], groupKey: string): Map<string, Counts> {
    const m = new Map<string, Counts>()
    for (const r of records) {
        const g = String(r[groupKey])
        const c = m.get(g) ?? {}
        c[String(r.k)] = (c[String(r.k)] ?? 0) + num(r.c)
        m.set(g, c)
    }
    return m
}

/** 複数サービスのCountsを合算 */
function merge(list: Counts[]): Counts {
    const out: Counts = {}
    for (const c of list) for (const [k, v] of Object.entries(c)) out[k] = (out[k] ?? 0) + v
    return out
}

/** Counts を「'ラベル': n」形式のTS（0は省略、canonical順）に整形 */
function fmtCounts(c: Counts, order: string[]): string {
    const parts = order.filter((l) => (c[l] ?? 0) > 0).map((l) => `'${l}': ${c[l]}`)
    // canonicalに無いラベル（想定外値）も末尾に拾う＝取りこぼし防止
    const extra = Object.keys(c).filter((k) => !order.includes(k) && c[k] > 0).map((k) => `'${k}': ${c[k]}`)
    return `{ ${[...parts, ...extra].join(', ')} }`
}

function main() {
    const asofArg = process.argv.find((a) => a.startsWith('--asof='))?.split('=')[1]
    const asof = asofArg ?? new Date().toISOString().slice(0, 10)

    // fill
    const fill = load('fill')[0] as Rec
    const base = {
        total: num(fill.total),
        ageFilled: num(fill.age),
        genderFilled: num(fill.gender),
        serviceFilled: num(fill.svc),
    }

    // overall
    const ov = {
        ageband: counts1(load('overall_age')),
        gender: counts1(load('overall_gender')),
        genderByAge: counts2(load('overall_genderByAge'), 'g'),
        pref: load('overall_pref').map((r) => ({ label: String(r.k), count: num(r.c) })),
        employment: counts1(load('overall_emp')),
        timing: counts1(load('overall_timing')),
        situation: counts1(load('overall_situation')),
        mood: counts1(load('overall_mood')),
    }

    // service → domain
    const svcAge = counts2(load('svc_age'), 'svc')
    const svcGender = counts2(load('svc_gender'), 'svc')
    const svcTiming = counts2(load('svc_timing'), 'svc')
    const svcSit = counts2(load('svc_situation'), 'svc')

    const mapped = new Set<string>()
    const domains = DOMAIN_MAP.map(({ domain, services }) => {
        services.forEach((s) => mapped.add(s))
        const pick = (m: Map<string, Counts>) => merge(services.map((s) => m.get(s) ?? {}))
        return { occ: domain, age: pick(svcAge), gender: pick(svcGender), timing: pick(svcTiming), situation: pick(svcSit) }
    })

    // 未マップ検出（新サービスの取りこぼし警告）
    const allSvcs = new Set<string>([...svcAge.keys()])
    const unmapped = [...allSvcs].filter((s) => !mapped.has(s))
    if (unmapped.length) {
        console.warn('⚠️ DOMAIN_MAP 未マップの登録サービス（personaSnapshot に含まれません）:')
        for (const s of unmapped) console.warn(`   - ${s} (age件数 ${Object.values(svcAge.get(s) ?? {}).reduce((a, b) => a + b, 0)})`)
        console.warn('   → scripts/regen-persona-snapshot.ts の DOMAIN_MAP に追記して再実行してください。')
    }

    // occupation（希望職種・細分類）
    const occAge = counts2(load('occ_age'), 'occ')
    const occGender = counts2(load('occ_gender'), 'occ')
    const occTiming = counts2(load('occ_timing'), 'occ')
    const occSit = counts2(load('occ_situation'), 'occ')
    const occupations = OCC_LIST.map((occ) => ({
        occ, age: occAge.get(occ) ?? {}, gender: occGender.get(occ) ?? {}, timing: occTiming.get(occ) ?? {}, situation: occSit.get(occ) ?? {},
    }))

    const covered = domains.reduce((s, d) => s + AGE_BANDS.reduce((a, l) => a + (d.age[l] ?? 0), 0), 0)
    const occFilled = [...occAge.values()].reduce((s, c) => s + Object.values(c).reduce((a, b) => a + b, 0), 0)

    const domainBlock = (d: { occ: string; age: Counts; gender: Counts; timing: Counts; situation: Counts }) =>
        `    {\n        occ: '${d.occ}',\n        age: ${fmtCounts(d.age, AGE_BANDS)},\n        gender: ${fmtCounts(d.gender, GENDERS)},\n        timing: ${fmtCounts(d.timing, TIMINGS)},\n        situation: ${fmtCounts(d.situation, SITUATIONS)},\n    },`

    const out = `/**
 * 求職者ペルソナ用の属性スナップショット。
 * 【自動生成】scripts/regen-persona-snapshot.ts が Salesforce CustomObject1__c のSOQL結果から生成。
 * 手で編集しない。更新はスクリプトのヘッダー手順（SOQL→scripts/data/persona/*.json→再実行）に従う。
 *
 * 数値の癖（必ず添えること）:
 *  - これは「登録者（人材紹介側リード）」の姿であって、サイト訪問者全体ではない。
 *  - 職種軸は登録サービス(Field5__c=事業領域, 全件付与, ドライバー最大)を主に使う。
 *    希望職種(DesiredOccupation__c)は約2万件のみで施工・製造系に偏り、ドライバーは構造的に含まれない参考値。
 *  - 各軸で母数(回答者)が異なるため、割合はその軸の合計に対して計算する（軸をまたいで足さない）。
 *  - 性別は付与率が低い（下記 genderFilled 参照）。女性比は性別回答者の部分集合上の値。
 */
export const PERSONA_SNAPSHOT_ASOF = '${asof}'

/** 集計元の件数（fill率メモ用）。総レコード = ${base.total.toLocaleString('en-US')}。 */
export const PERSONA_BASE = {
    total: ${base.total},
    ageFilled: ${base.ageFilled},
    /** 性別の付与件数（低め＝女性比は部分集合上の値）。 */
    genderFilled: ${base.genderFilled},
    /** 登録サービス(事業領域)＝職種軸の主母数。全レコードに付与＝構造的に漏れる層は無い。 */
    serviceFilled: ${base.serviceFilled},
    /** 希望職種(DesiredOccupation__c)が入っている件数。施工・製造系に偏り、ドライバーは構造的に含まれない参考値。 */
    occupationFilled: ${occFilled},
}

export const AGE_BANDS = ${JSON.stringify(AGE_BANDS)} as const
export const GENDERS = ${JSON.stringify(GENDERS)} as const
export const TIMINGS = ${JSON.stringify(TIMINGS)} as const
export const SITUATIONS = ${JSON.stringify(SITUATIONS)} as const

export type Counts = Record<string, number>

export interface OccupationPersona {
    occ: string
    age: Counts
    gender: Counts
    timing: Counts
    situation: Counts
}

/** 全体分布（サイト登録者全体。職種の絞り込み無し） */
export const PERSONA_OVERALL = {
    ageband: ${fmtCounts(ov.ageband, AGE_BANDS)} as Counts,
    gender: ${fmtCounts(ov.gender, GENDERS)} as Counts,
    genderByAge: {
        '男性': ${fmtCounts(ov.genderByAge.get('男性') ?? {}, AGE_BANDS)} as Counts,
        '女性': ${fmtCounts(ov.genderByAge.get('女性') ?? {}, AGE_BANDS)} as Counts,
    },
    prefecture: ${JSON.stringify(ov.pref)},
    employment: ${fmtCounts(ov.employment, Object.keys(ov.employment))} as Counts,
    timing: ${fmtCounts(ov.timing, TIMINGS)} as Counts,
    situation: ${fmtCounts(ov.situation, SITUATIONS)} as Counts,
    /** 現在の気持ち(Field30__c)＝顕在/潜在の二分 */
    mood: ${fmtCounts(ov.mood, Object.keys(ov.mood))} as Counts,
}

/**
 * 【主軸】事業領域（登録サービス Field5__c）別のペルソナ。全件付与＝登録者の実像。
 * 生の登録サービス値の表記ゆれを事業領域に正規化して合算済み（カバー ${covered.toLocaleString('en-US')} / age付与 ${base.ageFilled.toLocaleString('en-US')}）。
 */
export const PERSONA_DOMAINS: OccupationPersona[] = [
${domains.map(domainBlock).join('\n')}
]

/**
 * 【参考・細分類】希望職種(DesiredOccupation__c)別のペルソナ。上位${OCC_LIST.length}職種（「その他」除く）。
 * 付与は約2万件で施工・製造系に偏る。ドライバー系の値は存在しない（＝この軸ではドライバーは見えない）。
 */
export const PERSONA_OCCUPATIONS: OccupationPersona[] = [
${occupations.map(domainBlock).join('\n')}
]

/** ラベル→軸合計に対する割合(0-1)を返すヘルパー */
export function toShares(counts: Counts, labels: readonly string[]): Array<{ label: string; count: number; share: number }> {
    const total = labels.reduce((s, l) => s + (counts[l] ?? 0), 0)
    return labels.map((l) => ({ label: l, count: counts[l] ?? 0, share: total > 0 ? (counts[l] ?? 0) / total : 0 }))
}

export function sumCounts(counts: Counts, labels: readonly string[]): number {
    return labels.reduce((s, l) => s + (counts[l] ?? 0), 0)
}
`

    writeFileSync(OUT_FILE, out)
    console.log(`✅ 生成: ${OUT_FILE}`)
    console.log(`   ASOF=${asof} / 総レコード ${base.total.toLocaleString('en-US')} / 事業領域カバー ${covered.toLocaleString('en-US')} / 事業領域 ${domains.length} / 希望職種 ${occupations.length}`)
    if (unmapped.length) console.log(`   ⚠️ 未マップ ${unmapped.length}件（上の警告参照）`)
}

main()
