import Link from 'next/link'
import styles from './RelatedPages.module.css'

export interface RelatedPage {
    href: string
    label: string
}

/** 分析ページ間の回遊用チップ。CV系・経路系など関連ページ同士を接続する */
export default function RelatedPages({ pages }: { pages: RelatedPage[] }) {
    if (pages.length === 0) return null
    return (
        <div className={styles.row}>
            <span className={styles.label}>関連ページ:</span>
            {pages.map((p) => (
                <Link key={p.href} href={p.href} className={styles.chip}>
                    {p.label} →
                </Link>
            ))}
        </div>
    )
}
