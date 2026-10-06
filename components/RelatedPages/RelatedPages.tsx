'use client'

import Link from 'next/link'
import { useProduct } from '@/contexts/ProductContext'
import { PAGES, getRelatedPages, pageHref, type PageId } from '@/lib/registry'
import styles from './RelatedPages.module.css'

interface Props {
    /** レジストリから関連ページを導出する。productId も付与される。明示したいときは PAGES[id].related に書く */
    pageId: PageId
}

/** 分析ページ間の回遊用チップ。関連の定義は lib/registry/related.ts（明示 → タグ一致 → 同カテゴリ） */
export default function RelatedPages({ pageId }: Props) {
    const { currentProduct } = useProduct()
    const list = getRelatedPages(pageId).map((id) => ({ href: pageHref(id, { productId: currentProduct?.id }), label: PAGES[id].title }))
    if (list.length === 0) return null
    return (
        <div className={styles.row}>
            <span className={styles.label}>関連ページ:</span>
            {list.map((p) => (
                <Link key={p.href} href={p.href} className={styles.chip}>
                    {p.label} →
                </Link>
            ))}
        </div>
    )
}
