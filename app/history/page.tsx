'use client'

import { Suspense, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import PageShell from '@/components/PageShell'
import { cx } from '@/components/ui'
import { useProduct } from '@/contexts/ProductContext'
import ReportHistoryTab from './components/ReportHistoryTab'
import FunnelHistoryTab from './components/FunnelHistoryTab'
import AbTestHistoryTab from './components/AbTestHistoryTab'
import styles from './HistoryPage.module.css'

type HistoryTab = 'reports' | 'funnel' | 'ab-test'
const TABS: ReadonlyArray<{ id: HistoryTab; label: string }> = [
    { id: 'reports', label: 'レポート履歴' },
    { id: 'funnel', label: 'ファネル履歴' },
    { id: 'ab-test', label: 'ABテスト履歴' },
]

function HistoryPageContent() {
    const { currentProduct } = useProduct()
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()
    // 旧 /funnel/history・/reports/history からのリダイレクトは ?tab= で着地するタブを指定する
    const tabParam = searchParams?.get('tab')
    const [activeTab, setActiveTab] = useState<HistoryTab>(
        TABS.some((t) => t.id === tabParam) ? (tabParam as HistoryTab) : 'reports'
    )
    function selectTab(tab: HistoryTab) {
        setActiveTab(tab)
        const params = new URLSearchParams(searchParams?.toString())
        params.set('tab', tab)
        router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }
    const productIdParam = searchParams?.get('productId')
    const productId = productIdParam ? parseInt(productIdParam, 10) : currentProduct?.id

    return (
        <PageShell
            pageId="history"
            width="wide"
            controls={
                <div className={styles.tabs} role="tablist">
                    {TABS.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === t.id}
                            className={cx(styles.tab, activeTab === t.id && styles.tabActive)}
                            onClick={() => selectTab(t.id)}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            }
        >
            {activeTab === 'reports' && <ReportHistoryTab productId={productId} />}
            {activeTab === 'funnel' && <FunnelHistoryTab productId={productId} />}
            {activeTab === 'ab-test' && <AbTestHistoryTab productId={productId} />}
        </PageShell>
    )
}

export default function HistoryPage() {
    return (
        <Suspense fallback={<PageShell pageId="history" width="wide" status={{ loading: true, source: 'db' }}>{null}</PageShell>}>
            <HistoryPageContent />
        </Suspense>
    )
}
