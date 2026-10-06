'use client'

import { Suspense, useState, useEffect } from 'react'
import Link from 'next/link'
import DateInput from '@/components/DateInput'
import { useRouter, useSearchParams } from 'next/navigation'
import PageShell from '@/components/PageShell'
import GeminiConfig from '@/components/GeminiConfig'
import { ui, cx } from '@/components/ui'
import { fetchJson } from '@/lib/utils/fetch'
import { useProduct } from '@/lib/contexts/ProductContext'
import FunnelChart from '@/components/funnel/FunnelChart'
import ChannelBreakdownTable from '@/components/funnel/ChannelBreakdownTable'
import ConversionRateChart from '@/components/funnel/ConversionRateChart'
import DropoffRateChart from '@/components/funnel/DropoffRateChart'
import PeriodSelector from '@/components/funnel/PeriodSelector'
import ComparisonTable from '@/components/funnel/ComparisonTable'
import ComparisonCharts from '@/components/funnel/ComparisonCharts'
import ChannelComparisonTable from '@/components/funnel/ChannelComparisonTable'
import { GA4_FILTER_DIMENSIONS, GA4_FILTER_OPERATORS } from '@/lib/constants/ga4Dimensions'
import LabelInput from '@/components/LabelInput'
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
    const [configLoaded, setConfigLoaded] = useState(false)
    const [geminiConfig, setGeminiConfig] = useState<GeminiConfigState>({
        enabled: false,
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
    const [reportName, setReportName] = useState('')
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
                    const data = await fetchJson<{ execution?: any }>(`/api/funnel/executions/${executionId}`)

                    if (!isMounted) return

                    if (data.execution) {
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
                            })
                        } else if (execution.resultData?.geminiEvaluation) {
                            setGeminiConfig({
                                enabled: true,
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
                    geminiConfig: geminiConfig.enabled ? geminiConfig : undefined,
                    name: reportName.trim() || undefined,
                }

                const result = await fetchJson<{ executionId?: number; comparison: ComparisonData }>('/api/funnel/entry-form/compare', {
                    method: 'POST',
                    body: JSON.stringify(requestBody),
                })

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
                    geminiConfig: geminiConfig.enabled ? geminiConfig : undefined,
                    name: reportName.trim() || undefined,
                }

                const result = await fetchJson<{ executionId?: number; funnelData: FunnelData }>('/api/funnel/entry-form', {
                    method: 'POST',
                    body: JSON.stringify(requestBody),
                })

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

    return (
        <PageShell
            pageId="funnel"
            requireProduct
            status={{ loading, error, source: 'ga4', loadingText: 'ファネル分析中...' }}
            actions={<Link href="/history?tab=funnel" className={ui.btn}>実行履歴を見る →</Link>}
        >
            <div className={ui.card}>
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

            <div className={ui.card}>
                <h2 className={ui.sectionTitle}>分析設定</h2>
                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.formField}>
                        <label className={ui.controlLabel}>レポート名</label>
                        <input
                            type="text"
                            value={reportName}
                            onChange={(e) => setReportName(e.target.value)}
                            placeholder="未入力の場合は日時が自動設定されます"
                            
                        />
                    </div>
                    {mode === 'compare' && (
                        <PeriodSelector periods={periods} onPeriodsChange={setPeriods} />
                    )}
                    {mode === 'single' && (
                        <div className={styles.formGrid}>
                            <div className={styles.formField}>
                                <label className={ui.controlLabel}>開始日</label>
                                                                    <DateInput
                                                                    value={config.startDate}
                                    onChange={(e) => setConfig({ ...config, startDate: e.target.value })}
                                    
                                    required
                                />
                            </div>
                            <div className={styles.formField}>
                                <label className={ui.controlLabel}>終了日</label>
                                                                    <DateInput
                                                                    value={config.endDate}
                                    onChange={(e) => setConfig({ ...config, endDate: e.target.value })}
                                    
                                    required
                                />
                            </div>
                            <div className={styles.formField}>
                                <label className={ui.controlLabel}>フィルタ ディメンション</label>
                                <select
                                    className={ui.select}
                                    value={config.filterDimension}
                                    onChange={(e) => setConfig({ ...config, filterDimension: e.target.value })}
                                    aria-label="フィルタ ディメンション"
                                >
                                    {GA4_FILTER_DIMENSIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                                </select>
                                <p className={ui.note}>
                                    フィルタをかけたいディメンションのAPI名。
                                </p>
                            </div>
                            <div className={styles.formField}>
                                <label className={ui.controlLabel}>フィルタ 演算子</label>
                                <select
                                    className={ui.select}
                                    value={config.filterOperator}
                                    onChange={(e) => setConfig({ ...config, filterOperator: e.target.value })}
                                    aria-label="フィルタ 演算子"
                                >
                                    {GA4_FILTER_OPERATORS.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
                                </select>
                                <p className={ui.note}>
                                    フィルタの条件。
                                </p>
                            </div>
                            <div className={`${styles.formField} ${styles.formFieldFull}`}>
                                <label className={ui.controlLabel}>フィルタ 式</label>
                                <input
                                    type="text"
                                    value={config.filterExpression}
                                    onChange={(e) => setConfig({ ...config, filterExpression: e.target.value })}
                                    placeholder="カンマ区切りで複数指定可能"
                                    
                                />
                            </div>
                        </div>
                    )}
                    <div className={styles.stepsSection}>
                        <div className={styles.stepsHeader}>
                            <h3 className={styles.stepsTitle}>ファネルステップ</h3>
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
                                            <label className={ui.controlLabel}>ステップ名</label>
                                            <input
                                                type="text"
                                                value={step.stepName}
                                                onChange={(e) => updateStep(index, 'stepName', e.target.value)}
                                                
                                                required
                                            />
                                        </div>
                                        <div className={styles.formField}>
                                            <label className={ui.controlLabel}>カスタムイベントラベル</label>
                                            <LabelInput
                                                value={step.customEventLabel}
                                                onChange={(v) => updateStep(index, 'customEventLabel', v)}
                                                placeholder="EF__Line__Area__新規会員登録（カンマ区切りで複数指定→合算）"
                                                
                                                required
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={addStep}
                            className={ui.btnGhost}
                        >
                            + ステップを追加
                        </button>
                    </div>

                    <GeminiConfig
                        enabled={geminiConfig.enabled}
                        onEnabledChange={(enabled) => setGeminiConfig({ ...geminiConfig, enabled })}
                    />

                    <button type="submit" disabled={loading} className="executionButton">
                        <span>{loading ? '分析中...' : mode === 'compare' ? '期間比較を実行' : 'ファネル分析を実行'}</span>
                    </button>
                </form>
            </div>

            {comparisonData && comparisonData.periodA && comparisonData.periodB && (
                <>
                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>期間比較サマリー</h2>
                        <div className={ui.summaryRow}>
                            <div className={ui.summaryCard}>
                                <p className={ui.summaryLabel}>期間A: 総エントリー数</p>
                                <p className={cx(ui.summaryValue, styles.valueBlue)}>
                                    {comparisonData.periodA.data.totalUsers.toLocaleString()} 人
                                </p>
                            </div>
                            <div className={ui.summaryCard}>
                                <p className={ui.summaryLabel}>期間B: 総エントリー数</p>
                                <p className={cx(ui.summaryValue, styles.valueBlue)}>
                                    {comparisonData.periodB.data.totalUsers.toLocaleString()} 人
                                </p>
                            </div>
                            <div className={ui.summaryCard}>
                                <p className={ui.summaryLabel}>エントリー数差分</p>
                                <p className={cx(ui.summaryValue,
                                    comparisonData.periodB.data.totalUsers - comparisonData.periodA.data.totalUsers >= 0
                                        ? styles.valueGreen
                                        : styles.valueRed,
                                )}>
                                    {comparisonData.periodB.data.totalUsers - comparisonData.periodA.data.totalUsers >= 0 ? '+' : ''}
                                    {(comparisonData.periodB.data.totalUsers - comparisonData.periodA.data.totalUsers).toLocaleString()} 人
                                </p>
                            </div>
                            <div className={ui.summaryCard}>
                                <p className={ui.summaryLabel}>全体CVR差分</p>
                                <p className={cx(ui.summaryValue,
                                    (comparisonData.periodB.data.steps[comparisonData.periodB.data.steps.length - 1]?.conversionRate || 0) -
                                    (comparisonData.periodA.data.steps[comparisonData.periodA.data.steps.length - 1]?.conversionRate || 0) >= 0
                                        ? styles.valueGreen
                                        : styles.valueRed,
                                )}>
                                    {((comparisonData.periodB.data.steps[comparisonData.periodB.data.steps.length - 1]?.conversionRate || 0) -
                                        (comparisonData.periodA.data.steps[comparisonData.periodA.data.steps.length - 1]?.conversionRate || 0)) * 100 >= 0 ? '+' : ''}
                                    {(((comparisonData.periodB.data.steps[comparisonData.periodB.data.steps.length - 1]?.conversionRate || 0) -
                                        (comparisonData.periodA.data.steps[comparisonData.periodA.data.steps.length - 1]?.conversionRate || 0)) * 100).toFixed(2)}pt
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className={ui.card}>
                        <ComparisonCharts
                            periods={comparisonData.periods || (comparisonData.periodA && comparisonData.periodB ? [comparisonData.periodA, comparisonData.periodB] : [])}
                            periodA={comparisonData.periodA}
                            periodB={comparisonData.periodB}
                        />
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>詳細比較テーブル</h2>
                        <ComparisonTable
                            comparison={comparisonData.comparison}
                            periods={comparisonData.periods || (comparisonData.periodA && comparisonData.periodB ? [comparisonData.periodA, comparisonData.periodB] : [])}
                            periodALabel={comparisonData.periodA?.label}
                            periodBLabel={comparisonData.periodB?.label}
                        />
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>チャネル別CVR変化</h2>
                        <ChannelComparisonTable
                            periods={comparisonData.periods || (comparisonData.periodA && comparisonData.periodB ? [comparisonData.periodA, comparisonData.periodB] : [])}
                        />
                    </div>
                </>
            )}

            {funnelData && (
                <>
                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>サマリー</h2>
                        <div className={ui.summaryRow}>
                            <div className={ui.summaryCard}>
                                <p className={ui.summaryLabel}>集計期間</p>
                                <p className={ui.summaryValue}>
                                    {config.startDate} ～ {config.endDate}
                                </p>
                            </div>
                            <div className={ui.summaryCard}>
                                <p className={ui.summaryLabel}>総エントリー数</p>
                                <p className={cx(ui.summaryValue, styles.valueBlue)}>
                                    {funnelData.totalUsers.toLocaleString()} 人
                                </p>
                            </div>
                            <div className={ui.summaryCard}>
                                <p className={ui.summaryLabel}>最終ステップ到達数</p>
                                <p className={cx(ui.summaryValue, styles.valueGreen)}>
                                    {funnelData.steps[funnelData.steps.length - 1]?.users.toLocaleString() || 0} 人
                                </p>
                            </div>
                            <div className={ui.summaryCard}>
                                <p className={ui.summaryLabel}>全体コンバージョン率</p>
                                <p className={cx(ui.summaryValue, styles.valuePurple)}>
                                    {((funnelData.steps[funnelData.steps.length - 1]?.conversionRate || 0) * 100).toFixed(2)}%
                                </p>
                            </div>
                            <div className={ui.summaryCard}>
                                <p className={ui.summaryLabel}>最大離脱ステップ</p>
                                <p className={cx(ui.summaryValue, styles.valueRed)}>
                                    {getMaxDropoffStep(funnelData.steps)}
                                </p>
                            </div>
                            {config.filterExpression && (
                                <div className={ui.summaryCard}>
                                    <p className={ui.summaryLabel}>フィルター条件</p>
                                    <p className={ui.summaryValue}>
                                        {config.filterDimension} {config.filterOperator} {config.filterExpression}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>ファネルチャート</h2>
                        <FunnelChart data={funnelData.steps} />
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>コンバージョン率グラフ</h2>
                        <ConversionRateChart data={funnelData.steps} />
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>ドロップオフ率グラフ</h2>
                        <DropoffRateChart data={funnelData.steps} />
                    </div>

                    {(funnelData.channelBreakdown?.length ?? 0) > 0 && (
                        <div className={ui.card}>
                            <h2 className={ui.sectionTitle}>チャネル別ファネル</h2>
                            <ChannelBreakdownTable
                                breakdown={funnelData.channelBreakdown!}
                                overallSteps={funnelData.steps}
                            />
                        </div>
                    )}

                    {funnelData.geminiEvaluation && (
                        <div className={ui.card}>
                            <h2 className={ui.sectionTitle}>AI評価</h2>
                            <div className={ui.aiResult}>
                                <p className={styles.geminiText}>{funnelData.geminiEvaluation}</p>
                            </div>
                        </div>
                    )}

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>詳細データ</h2>
                        <div className={ui.tableWrap}>
                            <table className={ui.dataTable}>
                                <thead>
                                    <tr>
                                        <th>ステップ</th>
                                        <th>カスタムイベントラベル</th>
                                        <th className={ui.num}>ユーザー数</th>
                                        <th className={ui.num}>クリック数</th>
                                        <th className={ui.num}>ビュー数</th>
                                        <th className={ui.num}>コンバージョン率</th>
                                        <th className={ui.num}>ドロップオフ率</th>
                                        <th className={ui.num}>継続率</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {funnelData.steps.map((step, index) => {
                                        const continuationRate = index > 0 ? 1 - step.dropoffRate : 1
                                        return (
                                            <tr key={index}>
                                                <td>{step.stepName}</td>
                                                <td>{step.customEventLabel}</td>
                                                <td className={ui.num}>
                                                    {step.users.toLocaleString()}
                                                </td>
                                                <td className={ui.num}>
                                                    {step.clickUsers.toLocaleString()}
                                                </td>
                                                <td className={ui.num}>
                                                    {step.viewUsers.toLocaleString()}
                                                </td>
                                                <td className={ui.num}>
                                                    {(step.conversionRate * 100).toFixed(2)}%
                                                </td>
                                                <td className={ui.num}>
                                                    {(step.dropoffRate * 100).toFixed(2)}%
                                                </td>
                                                <td className={ui.num}>
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
        </PageShell>
    )
}

export default function FunnelPage() {
    return (
        <Suspense fallback={<PageShell pageId="funnel" status={{ loading: true, source: 'ga4' }}>{null}</PageShell>}>
            <FunnelPageContent />
        </Suspense>
    )
}
