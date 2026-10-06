'use client'

import { Suspense, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import BackLink from '@/components/BackLink'
import Loader from '@/components/Loader'
import { useProduct } from '@/lib/contexts/ProductContext'
import ReportHistoryTab from './components/ReportHistoryTab'
import FunnelHistoryTab from './components/FunnelHistoryTab'
import AbTestHistoryTab from './components/AbTestHistoryTab'
import styles from './HistoryPage.module.css'

type HistoryTab = 'reports' | 'funnel' | 'ab-test'
const HISTORY_TABS: readonly HistoryTab[] = ['reports', 'funnel', 'ab-test']

function HistoryPageContent() {
    const { currentProduct } = useProduct()
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()
    // 旧 /funnel/history・/reports/history からのリダイレクトは ?tab= で着地するタブを指定する
    const tabParam = searchParams?.get('tab')
    const [activeTab, setActiveTab] = useState<HistoryTab>(
        HISTORY_TABS.includes(tabParam as HistoryTab) ? (tabParam as HistoryTab) : 'reports'
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
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>履歴一覧</h1>
                    <p className={styles.description}>
                        過去に実行したレポート、ファネル分析、ABテストの履歴を確認できます
                    </p>
                </div>
                <BackLink href="/">ダッシュボードに戻る</BackLink>
            </div>

            <div className={styles.tabContainer}>
                <div className={styles.tabList}>
                    <button
                        onClick={() => selectTab('reports')}
                        className={`${styles.tabButton} ${
                            activeTab === 'reports' ? styles.tabButtonActive : styles.tabButtonInactive
                        }`}
                    >
                        レポート履歴
                    </button>
                    <button
                        onClick={() => selectTab('funnel')}
                        className={`${styles.tabButton} ${
                            activeTab === 'funnel' ? styles.tabButtonActive : styles.tabButtonInactive
                        }`}
                    >
                        ファネル履歴
                    </button>
                    <button
                        onClick={() => selectTab('ab-test')}
                        className={`${styles.tabButton} ${
                            activeTab === 'ab-test' ? styles.tabButtonActive : styles.tabButtonInactive
                        }`}
                    >
                        ABテスト履歴
                    </button>
                </div>
            </div>

            {activeTab === 'reports' && <ReportHistoryTab productId={productId} />}
            {activeTab === 'funnel' && <FunnelHistoryTab productId={productId} />}
            {activeTab === 'ab-test' && <AbTestHistoryTab productId={productId} />}
        </div>
    )
}

export default function HistoryPage() {
    return (
        <Suspense fallback={<Loader />}>
            <HistoryPageContent />
        </Suspense>
    )
}
