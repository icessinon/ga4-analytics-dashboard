'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import BackLink from '@/components/BackLink'
import CustomSelect from '@/components/CustomSelect'
import Loader from '@/components/Loader'
import { useProduct } from '@/lib/contexts/ProductContext'
import { GA4_FILTER_OPERATORS } from '@/lib/constants/ga4Dimensions'
import styles from './DataPage.module.css'

export default function DataPage() {
    const router = useRouter()
    const { currentProduct } = useProduct()
    const [loading, setLoading] = useState(false)
    const [data, setData] = useState<any>(null)
    const [error, setError] = useState<string | null>(null)
    const [accessToken, setAccessToken] = useState<string>('')
    const [viewMode, setViewMode] = useState<'all' | 'view' | 'click'>('all')
    const [config, setConfig] = useState({
        propertyId: '',
        startDate: '',
        endDate: '',
        metrics: 'eventCount,totalUsers',
        dimensions: 'customEvent:click_label,customEvent:view_label',
        filterDimension: 'pagePath',
        filterOperator: 'CONTAINS',
        filterExpression: '',
        limit: 10000,
    })

    useEffect(() => {
        if (currentProduct?.ga4PropertyId) {
            setConfig((prev) => ({
                ...prev,
                propertyId: currentProduct.ga4PropertyId || prev.propertyId,
            }))
        }
    }, [currentProduct])

    useEffect(() => {
        const today = new Date()
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)
        
        const formatDate = (date: Date) => {
            return date.toISOString().split('T')[0]
        }

        if (!config.startDate) {
            setConfig((prev) => ({
                ...prev,
                startDate: formatDate(yesterday),
                endDate: formatDate(today),
            }))
        }
    }, [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        setData(null)

        try {
            if (!currentProduct) {
                setError('プロダクトを選択してください。')
                setLoading(false)
                return
            }

            const requestBody: any = {
                propertyId: config.propertyId,
                startDate: config.startDate,
                endDate: config.endDate,
                metrics: config.metrics.split(',').map((m) => ({ name: m.trim() })),
                dimensions: config.dimensions.split(',').map((d) => ({ name: d.trim() })),
                limit: config.limit,
                accessToken: accessToken || undefined,
            }

            if (config.filterExpression && config.filterExpression.trim()) {
                requestBody.filter = {
                    dimension: config.filterDimension,
                    operator: config.filterOperator,
                    expression: config.filterExpression.trim(),
                }
            }

            const response = await fetch('/api/analytics/data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            })

            const result = await response.json()

            if (!response.ok) {
                throw new Error(result.message || result.error || 'データの取得に失敗しました')
            }

            setData(result.data)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'エラーが発生しました')
        } finally {
            setLoading(false)
        }
    }

    if (loading && !data) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h1 className={styles.title}>GA4データ閲覧</h1>
                    <BackLink href="/">ダッシュボードに戻る</BackLink>
                </div>
                <div className={styles.loaderContainer}>
                    <div style={{ textAlign: 'center' }}>
                        <Loader />
                        <p className={styles.loaderText}>データ取得中...</p>
                    </div>
                </div>
            </div>
        )
    }

    if (!currentProduct) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h1 className={styles.title}>GA4データ閲覧</h1>
                    <BackLink href="/">ダッシュボードに戻る</BackLink>
                </div>
                <div className={styles.warningBox}>
                    <p>
                        プロダクトを選択してください。ダッシュボードの右上のドロップダウンから選択できます。
                    </p>
                </div>
            </div>
        )
    }

    const getFilteredData = () => {
        if (!data || !data.rows) return { rows: [], dimensionHeaders: [], metricHeaders: [] }
        
        const viewLabelColumn = 'customEvent:view_label'
        const clickLabelColumn = 'customEvent:click_label'
        
        let filteredRows = data.rows
        
        const hasLabel = (value: any) =>
            value && value !== '' && value !== '(not set)' && value !== 'null' && value !== 'undefined'

        if (viewMode === 'view') {
            filteredRows = data.rows.filter((row: any) => hasLabel(row[viewLabelColumn]))
        } else if (viewMode === 'click') {
            filteredRows = data.rows.filter((row: any) => hasLabel(row[clickLabelColumn]))
        }
        
        return {
            ...data,
            rows: filteredRows,
            rowCount: filteredRows.length,
        }
    }

    const filteredData = getFilteredData()
    
    const getDisplayColumns = () => {
        const viewLabelColumn = 'customEvent:view_label'
        const clickLabelColumn = 'customEvent:click_label'
        
        const allColumns = [
            ...(filteredData?.dimensionHeaders || []).map((h: any) => h.name),
            ...(filteredData?.metricHeaders || []).map((h: any) => h.name),
        ]
        
        if (viewMode === 'view') {
            return allColumns.filter((col) => col !== clickLabelColumn)
        } else if (viewMode === 'click') {
            return allColumns.filter((col) => col !== viewLabelColumn)
        }
        
        return allColumns
    }
    
    const displayColumns = getDisplayColumns()

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>GA4データ閲覧</h1>
                    {currentProduct && (
                        <div className={styles.infoBox}>
                            <p className={styles.infoText}>
                                <strong>現在のプロダクト:</strong> {currentProduct.name}
                                {currentProduct.domain && ` (${currentProduct.domain})`}
                            </p>
                        </div>
                    )}
                </div>
                <BackLink href="/">ダッシュボードに戻る</BackLink>
            </div>

            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>検索条件</h2>
                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.formGrid}>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>開始日</label>
                            <input
                                type="date"
                                value={config.startDate}
                                onChange={(e) => setConfig({ ...config, startDate: e.target.value })}
                                className={styles.formInput}
                                required
                            />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>終了日</label>
                            <input
                                type="date"
                                value={config.endDate}
                                onChange={(e) => setConfig({ ...config, endDate: e.target.value })}
                                className={styles.formInput}
                                required
                            />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>メトリクス（カンマ区切り）</label>
                            <input
                                type="text"
                                value={config.metrics}
                                onChange={(e) => setConfig({ ...config, metrics: e.target.value })}
                                placeholder="eventCount,totalUsers"
                                className={styles.formInput}
                                required
                            />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>ディメンション（カンマ区切り）</label>
                            <input
                                type="text"
                                value={config.dimensions}
                                onChange={(e) => setConfig({ ...config, dimensions: e.target.value })}
                                placeholder="customEvent:click_label,customEvent:view_label"
                                className={styles.formInput}
                                required
                            />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>フィルタ ディメンション</label>
                            <input
                                type="text"
                                value={config.filterDimension}
                                onChange={(e) => setConfig({ ...config, filterDimension: e.target.value })}
                                placeholder="pagePath"
                                className={styles.formInput}
                            />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>フィルタ 演算子</label>
                            <CustomSelect
                                value={config.filterOperator}
                                onChange={(v) => setConfig({ ...config, filterOperator: v })}
                                options={GA4_FILTER_OPERATORS.map((op) => ({ value: op.value, label: op.label }))}
                                triggerClassName={styles.formSelect}
                                aria-label="フィルタ 演算子"
                            />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>フィルタ 式</label>
                            <input
                                type="text"
                                value={config.filterExpression}
                                onChange={(e) => setConfig({ ...config, filterExpression: e.target.value })}
                                placeholder="/members/signup"
                                className={styles.formInput}
                            />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>上限件数</label>
                            <input
                                type="number"
                                value={config.limit}
                                onChange={(e) => setConfig({ ...config, limit: parseInt(e.target.value, 10) })}
                                className={styles.formInput}
                                min="1"
                                max="100000"
                            />
                        </div>
                    </div>
                    <div className={styles.formField}>
                        <label className={styles.formLabel}>GA4アクセストークン（オプション）</label>
                        <input
                            type="password"
                            value={accessToken}
                            onChange={(e) => setAccessToken(e.target.value)}
                            placeholder="サービスアカウントを使用する場合は空欄でOK"
                            className={styles.formInput}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className={`executionButton ${loading ? styles.submitButtonDisabled : ''}`}
                        aria-label={loading ? 'データ取得中' : 'データを取得'}
                    >
                        <span>{loading ? 'データ取得中...' : 'データを取得'}</span>
                    </button>
                </form>
            </div>

            {error && (
                <div className={styles.errorBox}>
                    <p className={styles.errorTitle}>エラー</p>
                    <p>{error}</p>
                </div>
            )}

            {data && (
                <div className={styles.dataSection}>
                    <div className={styles.dataHeader}>
                        <h2 className={styles.dataTitle}>データ一覧</h2>
                        <div className={styles.dataHeaderRight}>
                            <div className={styles.viewModeTabs}>
                                <button
                                    onClick={() => setViewMode('all')}
                                    className={`${styles.viewModeButton} ${viewMode === 'all' ? styles.viewModeButtonActive : ''}`}
                                >
                                    すべて
                                </button>
                                <button
                                    onClick={() => setViewMode('view')}
                                    className={`${styles.viewModeButton} ${viewMode === 'view' ? styles.viewModeButtonActive : ''}`}
                                >
                                    Viewのみ
                                </button>
                                <button
                                    onClick={() => setViewMode('click')}
                                    className={`${styles.viewModeButton} ${viewMode === 'click' ? styles.viewModeButtonActive : ''}`}
                                >
                                    Clickのみ
                                </button>
                            </div>
                            <p className={styles.dataCount}>
                                表示: {filteredData.rowCount || 0} / 全 {data.rowCount || 0} 件
                            </p>
                        </div>
                    </div>
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead className={styles.tableHead}>
                                <tr>
                                    {displayColumns.map((column) => (
                                        <th
                                            key={column}
                                            className={styles.tableHeaderCell}
                                        >
                                            {column}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className={styles.tableBody}>
                                {filteredData.rows && filteredData.rows.length > 0 ? (
                                    filteredData.rows.map((row: any, index: number) => (
                                        <tr key={index} className={styles.tableRow}>
                                            {displayColumns.map((column) => (
                                                <td
                                                    key={column}
                                                    className={styles.tableCell}
                                                >
                                                    {row[column] || '-'}
                                                </td>
                                            ))}
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td
                                            colSpan={displayColumns.length}
                                            className={`${styles.tableCell} ${styles.tableCellCenter}`}
                                        >
                                            データがありません
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
