'use client'

import { useMemo, useState } from 'react'
import PageShell from '@/components/PageShell'
import FilterBar, { FilterField } from '@/components/FilterBar'
import { ui, cx } from '@/components/ui'
import { useProduct } from '@/lib/contexts/ProductContext'
import { useReport } from '@/hooks/useReport'
import { getJapaneseDescription } from '@/lib/constants/ga4MetadataTranslations'
import type { Ga4MetadataResponse } from '@/lib/services/ga4Catalog/metadataTypes'
import styles from './GA4MetadataPage.module.css'

const CATEGORY_LABELS: Record<string, string> = {
    EVENT: 'イベント',
    USER: 'ユーザー',
    SESSION: 'セッション',
    ITEM: 'アイテム',
    ECOMMERCE: 'Eコマース',
    TRAFFIC_SOURCE: 'トラフィックソース',
    GEO: '地理',
    TECHNOLOGY: '技術',
    CONTENT: 'コンテンツ',
    APP: 'アプリ',
    VIDEO: '動画',
    AUDIENCE: 'オーディエンス',
    LIFECYCLE: 'ライフサイクル',
    CONVERSION: 'コンバージョン',
    CUSTOM: 'カスタム',
}

const TYPE_LABELS: Record<string, string> = {
    TYPE_INTEGER: '整数',
    TYPE_FLOAT: '浮動小数点数',
    TYPE_SECONDS: '秒',
    TYPE_MILLISECONDS: 'ミリ秒',
    TYPE_MINUTES: '分',
    TYPE_HOURS: '時間',
    TYPE_STANDARD: '標準',
    TYPE_CURRENCY: '通貨',
    TYPE_FEET: 'フィート',
    TYPE_MILES: 'マイル',
    TYPE_METERS: 'メートル',
    TYPE_KILOMETERS: 'キロメートル',
}

const categoryLabel = (c: string) => CATEGORY_LABELS[c] || c
const typeLabel = (t: string) => TYPE_LABELS[t] || t

function matches(q: string, ...fields: string[]) {
    return !q || fields.some((f) => f.toLowerCase().includes(q))
}

export default function GA4MetadataPage() {
    const { currentProduct } = useProduct()
    const propertyId = currentProduct?.ga4PropertyId ?? ''
    const [category, setCategory] = useState('all')
    const [search, setSearch] = useState('')

    // プロダクトが決まれば自動取得（旧実装は「メタデータを取得」ボタン）
    const report = useReport<Ga4MetadataResponse>(`/api/ga4/metadata?propertyId=${encodeURIComponent(propertyId)}`, {
        enabled: !!propertyId,
    })
    const metrics = report.data?.metrics ?? []
    const dimensions = report.data?.dimensions ?? []

    const categories = useMemo(
        () => Array.from(new Set([...metrics, ...dimensions].map((x) => x.category))).filter(Boolean).sort(),
        [metrics, dimensions],
    )

    const q = search.trim().toLowerCase()
    const filteredMetrics = metrics.filter((m) =>
        (category === 'all' || m.category === category) &&
        matches(q, m.apiName, m.uiName, getJapaneseDescription(m.apiName, m.description || '', 'metric')))
    const filteredDimensions = dimensions.filter((d) =>
        (category === 'all' || d.category === category) &&
        matches(q, d.apiName, d.uiName, getJapaneseDescription(d.apiName, d.description || '', 'dimension')))

    return (
        <PageShell
            pageId="ga4Metadata"
            requireProduct
            width="wide"
            status={{ loading: report.loading, error: report.error, source: 'ga4', onRetry: report.run }}
            controls={
                <FilterBar>
                    <FilterField label="カテゴリ">
                        <select className={ui.select} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="カテゴリ">
                            <option value="all">すべてのカテゴリ</option>
                            {categories.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
                        </select>
                    </FilterField>
                    <FilterField label="検索" hint="API 名・表示名・説明で絞り込み">
                        <input type="search" className={cx(ui.input, styles.searchInput)} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="click_label, sessions ..." aria-label="検索" />
                    </FilterField>
                    {report.data && (
                        <FilterField label="件数">
                            <span className={ui.note}>メトリクス {filteredMetrics.length} / {metrics.length}・ディメンション {filteredDimensions.length} / {dimensions.length}</span>
                        </FilterField>
                    )}
                </FilterBar>
            }
        >
            {report.data && (
                <>
                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>メトリクス（{filteredMetrics.length}）</h2>
                        <p className={ui.sectionNote}>GA4 Data API の metrics に指定できる名前。説明は日本語訳があるものは訳文、無いものは API の原文です。</p>
                        {filteredMetrics.length === 0 ? <p className={ui.empty}>該当するメトリクスがありません</p> : (
                            <div className={ui.tableWrap}>
                                <table className={ui.dataTable}>
                                    <thead>
                                        <tr><th>API名</th><th>表示名</th><th>説明</th><th>タイプ</th><th>カテゴリ</th></tr>
                                    </thead>
                                    <tbody>
                                        {filteredMetrics.map((m) => (
                                            <tr key={m.apiName}>
                                                <td className={styles.mono}>{m.apiName}</td>
                                                <td>{m.uiName}</td>
                                                <td className={styles.description}>{getJapaneseDescription(m.apiName, m.description || '', 'metric')}</td>
                                                <td>{typeLabel(m.type)}</td>
                                                <td>{categoryLabel(m.category)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>ディメンション（{filteredDimensions.length}）</h2>
                        <p className={ui.sectionNote}>customEvent: で始まるものが GTM で登録したカスタムディメンション（click_label / view_label など）です。</p>
                        {filteredDimensions.length === 0 ? <p className={ui.empty}>該当するディメンションがありません</p> : (
                            <div className={ui.tableWrap}>
                                <table className={ui.dataTable}>
                                    <thead>
                                        <tr><th>API名</th><th>表示名</th><th>説明</th><th>カテゴリ</th></tr>
                                    </thead>
                                    <tbody>
                                        {filteredDimensions.map((d) => (
                                            <tr key={d.apiName}>
                                                <td className={styles.mono}>{d.apiName}</td>
                                                <td>{d.uiName}</td>
                                                <td className={styles.description}>{getJapaneseDescription(d.apiName, d.description || '', 'dimension')}</td>
                                                <td>{categoryLabel(d.category)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}
        </PageShell>
    )
}
