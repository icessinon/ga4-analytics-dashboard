'use client'

import Link from 'next/link'
import PageShell from '@/components/PageShell'
import DocsAsk from '@/components/docs/DocsAsk'
import { KnowledgeSectionCard } from '@/components/docs/KnowledgeBlocks'
import { ui, cx } from '@/components/ui'
import { DOMAIN_SECTIONS } from '@/lib/docs/domainKnowledge'
import { CV_UNIT_DERIVATIONS, CV_UNIT_VALUE_ASOF, formatYenApprox } from '@/lib/constants/cvUnitValue'
import styles from './GlossaryPage.module.css'

/**
 * x-work.jp（クロスワーク）のドメイン用語・計測仕様のリファレンス。
 * 本文は lib/docs/domainKnowledge.ts が正で、AI Q&A の知識ベースも同じデータから生成される。
 * CV 単価の表だけは lib/constants/cvUnitValue.ts から計算して差し込む。
 */

const fmtUnitYen = (yen: number) => (yen >= 10000 ? `約${(yen / 10000).toFixed(1)}万円` : `約${yen.toLocaleString()}円`)
// 単価 cell に付ける補足（売上主体など。数値でないドメイン注記のみ）
const CV_UNIT_ROW_NOTE: Record<string, string> = {
    JobA: '売上主体はCAの人材紹介再マッチ・掲載課金は別',
    JobH: 'HW自体は手数料ゼロ・売上主体はCAの人材紹介再マッチ',
}

function CvUnitTable() {
    return (
        <>
            <div className={ui.tableWrap}>
                <table className={cx(ui.dataTable, styles.cvTable)}>
                    <thead><tr><th>CV種別</th><th>成約率</th><th>平均手数料（純額）</th><th>単価</th></tr></thead>
                    <tbody>
                        {CV_UNIT_DERIVATIONS.map((d) => {
                            const rate = d.events > 0 ? (d.hires / d.events) * 100 : 0
                            const netFeePerHire = d.hires > 0 ? (d.grossFeeYen - d.refundYen) / d.hires : 0
                            const rowNote = CV_UNIT_ROW_NOTE[d.key]
                            return (
                                <tr key={d.key}>
                                    <td>{d.label}</td>
                                    <td>{rate.toFixed(1)}% /件</td>
                                    <td>{formatYenApprox(netFeePerHire)}</td>
                                    <td><strong>{fmtUnitYen(d.unitYen)}</strong>（¥{d.unitYen.toLocaleString()}{rowNote ? `。${rowNote}` : ''}）</td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
            <p className={ui.tableNote}>{CV_UNIT_VALUE_ASOF} 算出・CA活動履歴基準。</p>
        </>
    )
}

export default function GlossaryPage() {
    return (
        <PageShell
            pageId="docsGlossary"
            width="wide"
            actions={<Link href="/docs/features" className={ui.btnGhost}>機能ドキュメント</Link>}
        >
            <p className={ui.note}>
                数字の食い違いを調査するときは、まず「どのプロパティ・どのラベル基準の数字か」をこのページで確認してください。
                本文は AI Q&A（下の質問欄）が参照する知識ベースと同じ内容です。
            </p>

            <DocsAsk />

            <nav className={styles.toc} aria-label="目次">
                {DOMAIN_SECTIONS.map((s) => <a key={s.id} href={`#${s.id}`} className={styles.tocChip}>{s.title}</a>)}
            </nav>

            {DOMAIN_SECTIONS.map((section) => (
                <KnowledgeSectionCard key={section.id} section={section} components={{ cvUnitTable: <CvUnitTable /> }} />
            ))}
        </PageShell>
    )
}
