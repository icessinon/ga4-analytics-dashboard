'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import BackLink from '@/components/BackLink'
import CustomSelect from '@/components/CustomSelect'
import Loader from '@/components/Loader'
import GeminiConfig from '@/components/GeminiConfig'
import { useProduct } from '@/lib/contexts/ProductContext'
import FunnelChart from '@/components/funnel/FunnelChart'
import ConversionRateChart from '@/components/funnel/ConversionRateChart'
import DropoffRateChart from '@/components/funnel/DropoffRateChart'
import PeriodSelector from '@/components/funnel/PeriodSelector'
import ComparisonTable from '@/components/funnel/ComparisonTable'
import ComparisonCharts from '@/components/funnel/ComparisonCharts'
import { GA4_FILTER_DIMENSIONS, GA4_FILTER_OPERATORS } from '@/lib/constants/ga4Dimensions'
import type {
    FunnelStep,
    FunnelStepData,
    FunnelData,
    Period,
    ComparisonData,
    FunnelMode,
    FunnelPageConfig,
    GeminiConfigState,
} from './types'
import { formatDateString, getDefaultSinglePeriod, getDefaultComparisonPeriods, getPeriodsFromComparisonData } from './utils'
import styles from './FunnelPage.module.css'

function FunnelPageContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { currentProduct } = useProduct()
    const [mode, setMode] = useState<FunnelMode>('single')
    const [loading, setLoading] = useState(false)
    const [funnelData, setFunnelData] = useState<FunnelData | null>(null)
    const [comparisonData, setComparisonData] = useState<ComparisonData | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [accessToken, setAccessToken] = useState<string>('')
    const [configLoaded, setConfigLoaded] = useState(false)
    const [geminiConfig, setGeminiConfig] = useState<GeminiConfigState>({
        enabled: false,
        apiKey: '',
    })
    const [periods, setPeriods] = useState<Period[]>([
        { label: '期間A', startDate: '', endDate: '' },
        { label: '期間B', startDate: '', endDate: '' },
    ])
    const [config, setConfig] = useState<FunnelPageConfig>({
        propertyId: '',
        startDate: '',
        endDate: '',
        filterDimension: 'pagePath',
        filterOperator: 'CONTAINS',
        filterExpression: '',
    })
    const [steps, setSteps] = useState<FunnelStep[]>([
        { stepName: 'ステップ1', customEventLabel: '' },
    ])

    useEffect(() => {
        if (currentProduct?.ga4PropertyId) {
            setConfig((prev) => ({
                ...prev,
                propertyId: currentProduct.ga4PropertyId || prev.propertyId,
            }))
        }
    }, [currentProduct])

    useEffect(() => {
        if (configLoaded) return
        
        if (!config.startDate) {
            const defaultPeriod = getDefaultSinglePeriod()
            setConfig((prev) => ({
                ...prev,
                startDate: defaultPeriod.startDate,
                endDate: defaultPeriod.endDate,
            }))
        }

        if (periods[0].startDate === '' && periods[1].startDate === '') {
            setPeriods(getDefaultComparisonPeriods())
        }
    }, [configLoaded, config.startDate, periods])

    useEffect(() => {
        const executionId = searchParams?.get('executionId')
        const modeParam = searchParams?.get('mode')
        
        if (modeParam === 'single' || modeParam === 'compare') {
            setMode(modeParam)
        }
        
        if (executionId && !configLoaded) {
            let isMounted = true
            
            async function loadFunnelConfig() {
                try {
                    const response = await fetch(`/api/funnel/executions/${executionId}`)
                    const data = await response.json()
                    
                    if (!isMounted) return
                    
                    if (response.ok && data.execution) {
                        const execution = data.execution
                        
                        if (!modeParam) {
                            const resultData = execution.resultData
                            const isComparison = resultData && (
                                ('periods' in resultData && Array.isArray(resultData.periods) && resultData.periods.length > 1) ||
                                ('periodA' in resultData && 'periodB' in resultData)
                            )
                            setMode(isComparison ? 'compare' : 'single')
                        }
                        
                        setConfig((prev) => ({
                            ...prev,
                            propertyId: execution.funnelConfig?.propertyId || prev.propertyId,
                            startDate: execution.startDate ? new Date(execution.startDate).toISOString().split('T')[0] : prev.startDate,
                            endDate: execution.endDate ? new Date(execution.endDate).toISOString().split('T')[0] : prev.endDate,
                            filterDimension: execution.filterConfig?.dimension || prev.filterDimension,
                            filterOperator: execution.filterConfig?.operator || prev.filterOperator,
                            filterExpression: execution.filterConfig?.expression || prev.filterExpression,
                        }))

                        if (execution.funnelConfig?.steps && Array.isArray(execution.funnelConfig.steps)) {
                            setSteps(execution.funnelConfig.steps.map((step: any) => ({
                                stepName: step.stepName || '',
                                customEventLabel: step.customEventLabel || '',
                                description: step.description,
                            })))
                        }

                        if (execution.funnelConfig?.geminiConfig) {
                            const savedGeminiConfig = execution.funnelConfig.geminiConfig
                            setGeminiConfig({
                                enabled: savedGeminiConfig.enabled === true,
                                apiKey: savedGeminiConfig.apiKey || '',
                            })
                        } else if (execution.resultData?.geminiEvaluation) {
                            setGeminiConfig({
                                enabled: true,
                                apiKey: '',
                            })
                        }
                        
                        if (modeParam === 'compare' || (!modeParam && execution.resultData && ('periodA' in execution.resultData || 'periods' in execution.resultData))) {
                            const resultData = execution.resultData as ComparisonData
                            const restoredPeriods = getPeriodsFromComparisonData(resultData).map((period) => ({
                                label: period.label || '',
                                startDate: period.startDate ? formatDateString(new Date(period.startDate)) : '',
                                endDate: period.endDate ? formatDateString(new Date(period.endDate)) : '',
                            }))
                            
                            if (restoredPeriods.length > 0) {
                                setPeriods(restoredPeriods)
                            }
                        }

                        setConfigLoaded(true)
                    }
                } catch (err) {
                    if (isMounted) {
                        setConfigLoaded(true)
                    }
                }
            }
            loadFunnelConfig()
            
            return () => {
                isMounted = false
            }
        }
    }, [searchParams, configLoaded])

    const addStep = () => {
        setSteps([...steps, { stepName: `ステップ${steps.length + 1}`, customEventLabel: '' }])
    }

    const removeStep = (index: number) => {
        if (steps.length > 1) {
            setSteps(steps.filter((_, i) => i !== index))
        }
    }

    const updateStep = (index: number, field: keyof FunnelStep, value: string) => {
        const newSteps = [...steps]
        newSteps[index] = { ...newSteps[index], [field]: value }
        setSteps(newSteps)
    }

    const getMaxDropoffStep = (steps: FunnelStepData[]): string => {
        let maxDropoff = 0
        let maxDropoffStep = 'なし'
        for (let i = 1; i < steps.length; i++) {
            if (steps[i].dropoffRate > maxDropoff) {
                maxDropoff = steps[i].dropoffRate
                maxDropoffStep = steps[i].stepName
            }
        }
        return maxDropoffStep
    }

    const createFunnelVisualization = (steps: FunnelStepData[]): string[] => {
        if (steps.length === 0) return []
        
        const maxUsers = Math.max(...steps.map((s) => s.users), 1)
        const visualization: string[] = []
        
        steps.forEach((step, index) => {
            const barLength = Math.floor((step.users / maxUsers) * 50)
            const bar = '█'.repeat(barLength)
            const percentage = ((step.users / maxUsers) * 100).toFixed(1)
            visualization.push(`${step.stepName}: ${bar} ${percentage}% (${step.users.toLocaleString()}人)`)
            
            if (index < steps.length - 1 && step.dropoffRate > 0) {
                const dropoffBar = Math.floor((step.dropoffRate * 50))
                const dropoffBarStr = '░'.repeat(dropoffBar)
                visualization.push(`  離脱: ${dropoffBarStr} ${(step.dropoffRate * 100).toFixed(1)}%`)
            }
        })
        
        return visualization
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        setFunnelData(null)
        setComparisonData(null)

        try {
            if (!currentProduct) {
                setError('プロダクトを選択してください。')
                setLoading(false)
                return
            }

            const validSteps = steps.filter((s) => s.customEventLabel.trim() !== '')
            if (validSteps.length === 0) {
                setError('少なくとも1つのステップにカスタムイベントラベルを設定してください。')
                setLoading(false)
                return
            }

            const filterConfig =
                config.filterDimension && config.filterExpression
                    ? {
                            dimension: config.filterDimension,
                            operator: config.filterOperator,
                            expression: config.filterExpression,
                        }
                    : null

            if (mode === 'compare') {
                if (periods.length < 2) {
                    setError('期間比較には少なくとも2つの期間が必要です。')
                    setLoading(false)
                    return
                }

                const validPeriods = periods.filter((p) => p.startDate && p.endDate)
                if (validPeriods.length < 2) {
                    setError('すべての期間に開始日と終了日を設定してください。')
                    setLoading(false)
                    return
                }

                const requestBody = {
                    productId: currentProduct.id,
                    propertyId: config.propertyId || currentProduct.ga4PropertyId || '',
                    funnelConfig: {
                        steps: validSteps,
                    },
                    periods: validPeriods,
                    filterConfig,
                    accessToken: accessToken || undefined,
                    geminiConfig: geminiConfig.enabled ? geminiConfig : undefined,
                }

                const response = await fetch('/api/funnel/entry-form/compare', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestBody),
                })

                const result = await response.json()

                if (!response.ok) {
                    throw new Error(result.message || result.error || '期間比較に失敗しました')
                }

                if (result.executionId) {
                    router.push(`/funnel/${result.executionId}`)
                } else {
                    setComparisonData(result.comparison)
                }
            } else {
                const requestBody = {
                    productId: currentProduct.id,
                    propertyId: config.propertyId || currentProduct.ga4PropertyId || '',
                    startDate: config.startDate,
                    endDate: config.endDate,
                    funnelConfig: {
                        steps: validSteps,
                    },
                    filterConfig,
                    accessToken: accessToken || undefined,
                    geminiConfig: geminiConfig.enabled ? geminiConfig : undefined,
                }

                const response = await fetch('/api/funnel/entry-form', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestBody),
                })

                const result = await response.json()

                if (!response.ok) {
                    throw new Error(result.message || result.error || 'ファネル分析に失敗しました')
                }

                if (result.executionId) {
                    router.push(`/funnel/${result.executionId}`)
                } else {
                    setFunnelData(result.funnelData)
                }
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'エラーが発生しました')
        } finally {
            setLoading(false)
        }
    }

    if (loading && !funnelData) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h1 className={styles.title}>ファネル分析</h1>
                    <BackLink href="/">ダッシュボードに戻る</BackLink>
                </div>
                <div className={styles.loaderContainer}>
                    <div style={{ textAlign: 'center' }}>
                        <Loader />
                        <p className={styles.loaderText}>ファネル分析中...</p>
                    </div>
                </div>
            </div>
        )
    }

    if (!currentProduct) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h1 className={styles.title}>ファネル分析</h1>
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

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>ファネル分析</h1>
                    {currentProduct && (
                        <div className={styles.infoBox}>
                            <p className={styles.infoText}>
                                <strong>現在のプロダクト:</strong> {currentProduct.name}
                                {currentProduct.domain && ` (${currentProduct.domain})`}
                            </p>
                        </div>
                    )}
                </div>
                <div className={styles.headerActions}>
                    <BackLink href="/">ダッシュボードに戻る</BackLink>
                    <BackLink href="/funnel/history" direction="forward">
                        実行履歴を見る
                    </BackLink>
                </div>
            </div>

            <div className={styles.section}>
                <div className={styles.tabContainer}>
                    <button
                        type="button"
                        onClick={() => {
                            setMode('single')
                            setFunnelData(null)
                            setComparisonData(null)
                        }}
                        className={`${styles.tabButton} ${
                            mode === 'single' ? styles.tabButtonActive : styles.tabButtonInactive
                        }`}
                    >
                        単一期間分析
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setMode('compare')
                            setFunnelData(null)
                            setComparisonData(null)
                        }}
                        className={`${styles.tabButton} ${
                            mode === 'compare' ? styles.tabButtonActive : styles.tabButtonInactive
                        }`}
                    >
                        期間比較
                    </button>
                </div>
            </div>

            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>分析設定</h2>
                <form onSubmit={handleSubmit} className={styles.form}>
                    {mode === 'compare' && (
                        <PeriodSelector periods={periods} onPeriodsChange={setPeriods} />
                    )}
                    {mode === 'single' && (
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
                                <label className={styles.formLabel}>フィルタ ディメンション</label>
                                <CustomSelect
                                    value={config.filterDimension}
                                    onChange={(v) => setConfig({ ...config, filterDimension: v })}
                                    options={GA4_FILTER_DIMENSIONS.map((d) => ({ value: d.value, label: d.label }))}
                                    triggerClassName={styles.formSelect}
                                    placeholder="選択してください"
                                    aria-label="フィルタ ディメンション"
                                />
                                <p className={styles.helpText}>
                                    フィルタをかけたいディメンションのAPI名。
                                </p>
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
                                <p className={styles.helpText}>
                                    フィルタの条件。
                                </p>
                            </div>
                            <div className={`${styles.formField} ${styles.formFieldFull}`}>
                                <label className={styles.formLabel}>フィルタ 式</label>
                                <input
                                    type="text"
                                    value={config.filterExpression}
                                    onChange={(e) => setConfig({ ...config, filterExpression: e.target.value })}
                                    placeholder="カンマ区切りで複数指定可能"
                                    className={styles.formInput}
                                />
                            </div>
                        </div>
                    )}
                    <div className={styles.stepsSection}>
                        <div className={styles.stepsHeader}>
                            <h3 className={styles.stepsTitle}>ファネルステップ</h3>
                            <button
                                type="button"
                                onClick={addStep}
                                className={styles.addStepButton}
                            >
                                + ステップを追加
                            </button>
                        </div>
                        <div className={styles.stepsList}>
                            {steps.map((step, index) => (
                                <div key={index} className={styles.stepItem}>
                                    <div className={styles.stepHeader}>
                                        <h4 className={styles.stepTitle}>ステップ {index + 1}</h4>
                                        {steps.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeStep(index)}
                                                className={styles.removeStepButton}
                                            >
                                                削除
                                            </button>
                                        )}
                                    </div>
                                    <div className={styles.formGrid}>
                                        <div className={styles.formField}>
                                            <label className={styles.formLabel}>ステップ名</label>
                                            <input
                                                type="text"
                                                value={step.stepName}
                                                onChange={(e) => updateStep(index, 'stepName', e.target.value)}
                                                className={styles.formInput}
                                                required
                                            />
                                        </div>
                                        <div className={styles.formField}>
                                            <label className={styles.formLabel}>カスタムイベントラベル</label>
                                            <input
                                                type="text"
                                                value={step.customEventLabel}
                                                onChange={(e) => updateStep(index, 'customEventLabel', e.target.value)}
                                                placeholder="EF__Line__Area__新規会員登録"
                                                className={styles.formInput}
                                                required
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
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

                    <GeminiConfig
                        enabled={geminiConfig.enabled}
                        apiKey={geminiConfig.apiKey}
                        onEnabledChange={(enabled) => setGeminiConfig({ ...geminiConfig, enabled })}
                        onApiKeyChange={(apiKey) => setGeminiConfig({ ...geminiConfig, apiKey })}
                    />

                    <button
                        type="submit"
                        disabled={loading}
                        className={`executionButton ${loading ? styles.submitButtonDisabled : ''}`}
                    >
                        <span>{loading ? '分析中...' : mode === 'compare' ? '期間比較を実行' : 'ファネル分析を実行'}</span>
                    </button>
                </form>
            </div>

            {error && (
                <div className={styles.errorBox}>
                    <p className={styles.errorTitle}>エラー</p>
                    <p>{error}</p>
                </div>
            )}

            {comparisonData && comparisonData.periodA && comparisonData.periodB && (
                <>
                    <div className={styles.section}>
                        <h2 className={styles.sectionTitle}>期間比較サマリー</h2>
                        <div className={styles.comparisonGrid}>
                            <div className={styles.summaryItem}>
                                <p className={styles.summaryLabel}>期間A: 総エントリー数</p>
                                <p className={`${styles.summaryValue} ${styles.summaryValueBlue}`}>
                                    {comparisonData.periodA.data.totalUsers.toLocaleString()} 人
                                </p>
                            </div>
                            <div className={styles.summaryItem}>
                                <p className={styles.summaryLabel}>期間B: 総エントリー数</p>
                                <p className={`${styles.summaryValue} ${styles.summaryValueBlue}`}>
                                    {comparisonData.periodB.data.totalUsers.toLocaleString()} 人
                                </p>
                            </div>
                            <div className={styles.summaryItem}>
                                <p className={styles.summaryLabel}>エントリー数差分</p>
                                <p className={`${styles.summaryValue} ${
                                    comparisonData.periodB.data.totalUsers - comparisonData.periodA.data.totalUsers >= 0
                                        ? styles.summaryValueGreen
                                        : styles.summaryValueRed
                                }`}>
                                    {comparisonData.periodB.data.totalUsers - comparisonData.periodA.data.totalUsers >= 0 ? '+' : ''}
                                    {(comparisonData.periodB.data.totalUsers - comparisonData.periodA.data.totalUsers).toLocaleString()} 人
                                </p>
                            </div>
                            <div className={styles.summaryItem}>
                                <p className={styles.summaryLabel}>全体CVR差分</p>
                                <p className={`${styles.summaryValue} ${
                                    (comparisonData.periodB.data.steps[comparisonData.periodB.data.steps.length - 1]?.conversionRate || 0) -
                                    (comparisonData.periodA.data.steps[comparisonData.periodA.data.steps.length - 1]?.conversionRate || 0) >= 0
                                        ? styles.summaryValueGreen
                                        : styles.summaryValueRed
                                }`}>
                                    {((comparisonData.periodB.data.steps[comparisonData.periodB.data.steps.length - 1]?.conversionRate || 0) -
                                        (comparisonData.periodA.data.steps[comparisonData.periodA.data.steps.length - 1]?.conversionRate || 0)) * 100 >= 0 ? '+' : ''}
                                    {(((comparisonData.periodB.data.steps[comparisonData.periodB.data.steps.length - 1]?.conversionRate || 0) -
                                        (comparisonData.periodA.data.steps[comparisonData.periodA.data.steps.length - 1]?.conversionRate || 0)) * 100).toFixed(2)}pt
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className={styles.section}>
                        <ComparisonCharts
                            periods={comparisonData.periods || (comparisonData.periodA && comparisonData.periodB ? [comparisonData.periodA, comparisonData.periodB] : [])}
                            periodA={comparisonData.periodA}
                            periodB={comparisonData.periodB}
                        />
                    </div>

                    <div className={styles.section}>
                        <h2 className={styles.sectionTitle}>詳細比較テーブル</h2>
                        <ComparisonTable
                            comparison={comparisonData.comparison}
                            periods={comparisonData.periods || (comparisonData.periodA && comparisonData.periodB ? [comparisonData.periodA, comparisonData.periodB] : [])}
                            periodALabel={comparisonData.periodA?.label}
                            periodBLabel={comparisonData.periodB?.label}
                        />
                    </div>
                </>
            )}

            {funnelData && (
                <>
                    <div className={styles.section}>
                        <h2 className={styles.sectionTitle}>サマリー</h2>
                        <div className={styles.summaryGrid}>
                            <div className={styles.summaryItem}>
                                <p className={styles.summaryLabel}>集計期間</p>
                                <p className={styles.summaryValue}>
                                    {config.startDate} ～ {config.endDate}
                                </p>
                            </div>
                            <div className={styles.summaryItem}>
                                <p className={styles.summaryLabel}>総エントリー数</p>
                                <p className={`${styles.summaryValue} ${styles.summaryValueBlue}`}>
                                    {funnelData.totalUsers.toLocaleString()} 人
                                </p>
                            </div>
                            <div className={styles.summaryItem}>
                                <p className={styles.summaryLabel}>最終ステップ到達数</p>
                                <p className={`${styles.summaryValue} ${styles.summaryValueGreen}`}>
                                    {funnelData.steps[funnelData.steps.length - 1]?.users.toLocaleString() || 0} 人
                                </p>
                            </div>
                            <div className={styles.summaryItem}>
                                <p className={styles.summaryLabel}>全体コンバージョン率</p>
                                <p className={`${styles.summaryValue} ${styles.summaryValuePurple}`}>
                                    {((funnelData.steps[funnelData.steps.length - 1]?.conversionRate || 0) * 100).toFixed(2)}%
                                </p>
                            </div>
                            <div className={styles.summaryItem}>
                                <p className={styles.summaryLabel}>最大離脱ステップ</p>
                                <p className={`${styles.summaryValue} ${styles.summaryValueRed}`}>
                                    {getMaxDropoffStep(funnelData.steps)}
                                </p>
                            </div>
                            {config.filterExpression && (
                                <div className={styles.summaryItem}>
                                    <p className={styles.summaryLabel}>フィルター条件</p>
                                    <p className={styles.summaryValue}>
                                        {config.filterDimension} {config.filterOperator} {config.filterExpression}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className={styles.section}>
                        <h2 className={styles.sectionTitle}>ファネルチャート</h2>
                        <FunnelChart data={funnelData.steps} />
                    </div>

                    <div className={styles.section}>
                        <h2 className={styles.sectionTitle}>コンバージョン率グラフ</h2>
                        <ConversionRateChart data={funnelData.steps} />
                    </div>

                    <div className={styles.section}>
                        <h2 className={styles.sectionTitle}>ドロップオフ率グラフ</h2>
                        <DropoffRateChart data={funnelData.steps} />
                    </div>

                    {funnelData.geminiEvaluation && (
                        <div className={styles.section}>
                            <h2 className={styles.sectionTitle}>Gemini評価</h2>
                            <div className={styles.geminiBox}>
                                <p className={styles.geminiText}>
                                    {funnelData.geminiEvaluation}
                                </p>
                            </div>
                        </div>
                    )}

                    <div className={styles.section}>
                        <h2 className={styles.sectionTitle}>詳細データ</h2>
                        <div style={{ overflowX: 'auto' }}>
                            <table className={styles.table}>
                                <thead className={styles.tableHead}>
                                    <tr>
                                        <th className={styles.tableHeaderCell}>ステップ</th>
                                        <th className={styles.tableHeaderCell}>カスタムイベントラベル</th>
                                        <th className={styles.tableHeaderCell} style={{ textAlign: 'right' }}>ユーザー数</th>
                                        <th className={styles.tableHeaderCell} style={{ textAlign: 'right' }}>クリック数</th>
                                        <th className={styles.tableHeaderCell} style={{ textAlign: 'right' }}>ビュー数</th>
                                        <th className={styles.tableHeaderCell} style={{ textAlign: 'right' }}>コンバージョン率</th>
                                        <th className={styles.tableHeaderCell} style={{ textAlign: 'right' }}>ドロップオフ率</th>
                                        <th className={styles.tableHeaderCell} style={{ textAlign: 'right' }}>継続率</th>
                                    </tr>
                                </thead>
                                <tbody className={styles.tableBody}>
                                    {funnelData.steps.map((step, index) => {
                                        const continuationRate = index > 0 ? 1 - step.dropoffRate : 1
                                        return (
                                            <tr key={index} className={styles.tableRow}>
                                                <td className={styles.tableCell}>{step.stepName}</td>
                                                <td className={styles.tableCell}>{step.customEventLabel}</td>
                                                <td className={styles.tableCell} style={{ textAlign: 'right' }}>
                                                    {step.users.toLocaleString()}
                                                </td>
                                                <td className={styles.tableCell} style={{ textAlign: 'right' }}>
                                                    {step.clickUsers.toLocaleString()}
                                                </td>
                                                <td className={styles.tableCell} style={{ textAlign: 'right' }}>
                                                    {step.viewUsers.toLocaleString()}
                                                </td>
                                                <td className={styles.tableCell} style={{ textAlign: 'right' }}>
                                                    {(step.conversionRate * 100).toFixed(2)}%
                                                </td>
                                                <td className={styles.tableCell} style={{ textAlign: 'right' }}>
                                                    {(step.dropoffRate * 100).toFixed(2)}%
                                                </td>
                                                <td className={styles.tableCell} style={{ textAlign: 'right' }}>
                                                    {(continuationRate * 100).toFixed(2)}%
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

export default function FunnelPage() {
    return (
        <Suspense fallback={<Loader />}>
            <FunnelPageContent />
        </Suspense>
    )
}
