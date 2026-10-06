import type { ReactNode } from 'react'
import Link from 'next/link'
import { ui, cx } from '@/components/ui'
import type { KnowledgeBlock, KnowledgeSection } from '@/lib/docs/domainKnowledge'
import styles from './KnowledgeBlocks.module.css'

/** **太字**・`コード`・[リンク](href) だけを解釈する軽量インライン描画 */
export function renderInline(text: string): ReactNode[] {
    const out: ReactNode[] = []
    const re = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g
    let last = 0
    let m: RegExpExecArray | null
    let i = 0
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) out.push(text.slice(last, m.index))
        if (m[1] !== undefined) out.push(<strong key={i++}>{m[1]}</strong>)
        else if (m[2] !== undefined) out.push(<code key={i++}>{m[2]}</code>)
        else if (m[3] !== undefined) {
            const href = m[4]
            out.push(href.startsWith('/')
                ? <Link key={i++} href={href} className={styles.link}>{m[3]}</Link>
                : <a key={i++} href={href} target="_blank" rel="noreferrer" className={styles.link}>{m[3]}</a>)
        }
        last = m.index + m[0].length
    }
    if (last < text.length) out.push(text.slice(last))
    return out
}

export function KnowledgeBlockView({ block, components }: { block: KnowledgeBlock; components?: Partial<Record<'cvUnitTable', ReactNode>> }) {
    if ('audience' in block && block.audience === 'kb') return null
    switch (block.type) {
        case 'paragraph':
            return <p className={styles.note}>{renderInline(block.text)}</p>
        case 'subheading':
            return <h3 className={styles.subTitle}>{block.text}</h3>
        case 'list':
            return <ul className={styles.list}>{block.items.map((item, i) => <li key={i}>{renderInline(item)}</li>)}</ul>
        case 'table':
            return (
                <div className={ui.tableWrap}>
                    <table className={cx(ui.dataTable, styles.table)}>
                        <thead><tr>{block.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
                        <tbody>
                            {block.rows.map((row, r) => (
                                <tr key={r}>{row.map((cell, c) => <td key={c}>{renderInline(cell)}</td>)}</tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )
        case 'component':
            return <>{components?.[block.id] ?? null}</>
    }
}

/** 1 節＝1 カード。用語集ページが DOMAIN_SECTIONS を map して使う */
export function KnowledgeSectionCard({ section, components }: { section: KnowledgeSection; components?: Partial<Record<'cvUnitTable', ReactNode>> }) {
    return (
        <section id={section.id} className={ui.card}>
            <h2 className={ui.sectionTitle}>{section.title}</h2>
            {section.blocks.map((block, i) => <KnowledgeBlockView key={i} block={block} components={components} />)}
        </section>
    )
}
