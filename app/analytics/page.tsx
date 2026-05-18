'use client'

import { useState, useEffect, Suspense } from 'react'
import DateInput from '@/components/DateInput'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from '@/components/Link'
import BackLink from '@/components/BackLink'
import CustomSelect from '@/components/CustomSelect'
import Loader from '@/components/Loader'
import GeminiConfig from '@/components/GeminiConfig'
import Switch from '@/components/Switch'
import { useProduct } from '@/lib/contexts/ProductContext'
import { GA4_CVR_DIMENSIONS, GA4_FILTER_DIMENSIONS, GA4_METRICS, GA4_FILTER_OPERATORS } from '@/lib/constants/ga4Dimensions'
import LabelInput from '@/components/LabelInput'
import type { ReportConfig } from './types'
import styles from './AnalyticsPage.module.css'

function AnalyticsPageContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { currentProduct } = useProduct()
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<any>(null)
    const [error, setError] = useState<string | null>(null)
    const [accessToken, setAccessToken] = useState<string>('')
    const [showCvrB, setShowCvrB] = useState(true)
    const [showCvrC, setShowCvrC] = useState(false)
    const [showCvrD, setShowCvrD] = useState(false)
    const [configLoaded, setConfigLoaded] = useState(false)
    const [config, setConfig] = useState<ReportConfig>({
        reportName: '',
        propertyId: '',
        startDate: '',
        endDate: '',
        metrics: 'eventCount,totalUsers',
        dimensions: 'customEvent:click_label,customEvent:view_label',
        filterDimension: 'pagePath',
        filterOperator: 'CONTAINS',
        filterExpression: '',
        orderBy: '',
        limit: 25000,
        cvrA: {
            denominatorDimension: 'customEvent:view_label',
            denominatorLabels: '',
            numeratorDimension: 'customEvent:click_label',
            numeratorLabels: '',
            metric: 'totalUsers',
        },
        cvrB: {
            denominatorDimension: 'customEvent:view_label',
            denominatorLabels: '',
            numeratorDimension: 'customEvent:click_label',
            numeratorLabels: '',
            metric: 'totalUsers',
        },
        cvrC: {
            denominatorDimension: '',
            denominatorLabels: '',
            numeratorDimension: '',
            numeratorLabels: '',
            metric: '',
        },
        cvrD: {
            denominatorDimension: '',
            denominatorLabels: '',
            numeratorDimension: '',
            numeratorLabels: '',
            metric: '',
        },
        showCvrC: false,
        showCvrD: false,
        abTestStartDate: '2026-01-15',
        abTestEndDate: '2026-01-21',
        abTestEvaluationConfig: {
            minSignificance: 80,
            minPV: 3000,
            minDays: 14,
            minImprovementRate: 10,
            minDifferencePt: 0.5,
        },
        geminiConfig: {
            enabled: false,
            apiKey: '',
        },
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
        setConfig((prev) => {
            if (prev.startDate) return prev
            const today = new Date()
            const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
            const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            return { ...prev, startDate: fmt(firstOfMonth), endDate: fmt(today) }
        })
    }, [])

    useEffect(() => {
        const executionId = searchParams?.get('executionId')
        if (executionId && !configLoaded) {
            async function loadReportConfig() {
                try {
                    const response = await fetch(`/api/reports/${executionId}`)
                    const data = await response.json()
                    
                    if (response.ok && data.execution?.report?.config) {
                        const reportConfig = data.execution.report.config
                        
                        const convertCvrConfig = (cvr: any) => {
                            if (!cvr) return null
                            return {
                                denominatorDimension: cvr.denominatorDimension || '',
                                denominatorLabels: Array.isArray(cvr.denominatorLabels)
                                    ? cvr.denominatorLabels.join(',')
                                    : (cvr.denominatorLabels || ''),
                                numeratorDimension: cvr.numeratorDimension || '',
                                numeratorLabels: Array.isArray(cvr.numeratorLabels)
                                    ? cvr.numeratorLabels.join(',')
                                    : (cvr.numeratorLabels || ''),
                                metric: cvr.metric || '',
                            }
                        }

                        setConfig((prev) => ({
                            ...prev,
                            reportName: data.execution.report.name || prev.reportName,
                            propertyId: reportConfig.propertyId || prev.propertyId,
                            startDate: reportConfig.startDate || prev.startDate,
                            endDate: reportConfig.endDate || prev.endDate,
                            metrics: Array.isArray(reportConfig.metrics) 
                                ? reportConfig.metrics.map((m: any) => m.name || m).join(',')
                                : prev.metrics,
                            dimensions: Array.isArray(reportConfig.dimensions)
                                ? reportConfig.dimensions.map((d: any) => d.name || d).join(',')
                                : prev.dimensions,
                            filterDimension: reportConfig.filter?.dimension || '',
                            filterOperator: reportConfig.filter?.operator || 'CONTAINS',
                            filterExpression: reportConfig.filter?.expression !== undefined 
                                ? (reportConfig.filter.expression || '')
                                : '',
                            limit: reportConfig.limit || prev.limit,
                            cvrA: convertCvrConfig(reportConfig.cvrA) || prev.cvrA,
                            cvrB: convertCvrConfig(reportConfig.cvrB) || prev.cvrB,
                            cvrC: convertCvrConfig(reportConfig.cvrC) || prev.cvrC,
                            cvrD: convertCvrConfig(reportConfig.cvrD) || prev.cvrD,
                            abTestStartDate: reportConfig.abTestStartDate || prev.abTestStartDate,
                            abTestEndDate: reportConfig.abTestEndDate || prev.abTestEndDate,
                            abTestEvaluationConfig: reportConfig.abTestEvaluationConfig || prev.abTestEvaluationConfig,
                            geminiConfig: reportConfig.geminiConfig || prev.geminiConfig,
                        }))

                        if (reportConfig.cvrB) setShowCvrB(true)
                        if (reportConfig.cvrC) setShowCvrC(true)
                        if (reportConfig.cvrD) setShowCvrD(true)

                        setConfigLoaded(true)
                    }
                } catch (err) {
                    console.error('Failed to load report config:', err)
                }
            }
            loadReportConfig()
        }
    }, [searchParams, configLoaded])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        setResult(null)

        try {
            if (!currentProduct) {
                setError('プロダクトを選択してください。右上のドロップダウンから選択できます。')
                setLoading(false)
                return
            }

            const requestBody = {
                productId: currentProduct.id,
                accessToken: accessToken || undefined,
                reportName: config.reportName,
                propertyId: config.propertyId,
                startDate: config.startDate,
                endDate: config.endDate,
                metrics: config.metrics.split(',').map((m) => ({ name: m.trim() })),
                dimensions: config.dimensions.split(',').map((d) => ({ name: d.trim() })),
                filter: {
                    dimension: config.filterDimension,
                    operator: config.filterOperator,
                    expression: config.filterExpression,
                },
                orderBy: config.orderBy,
                limit: config.limit,
                cvrA: {
                    denominatorDimension: config.cvrA.denominatorDimension,
                    denominatorLabels: Array.isArray(config.cvrA.denominatorLabels)
                        ? config.cvrA.denominatorLabels.map((l: string) => l.trim())
                        : config.cvrA.denominatorLabels.split(',').map((l: string) => l.trim()),
                    numeratorDimension: config.cvrA.numeratorDimension,
                    numeratorLabels: Array.isArray(config.cvrA.numeratorLabels)
                        ? config.cvrA.numeratorLabels.map((l: string) => l.trim())
                        : config.cvrA.numeratorLabels.split(',').map((l: string) => l.trim()),
                    metric: config.cvrA.metric,
                },
                cvrB: showCvrB && config.cvrB.denominatorDimension ? {
                    denominatorDimension: config.cvrB.denominatorDimension,
                    denominatorLabels: Array.isArray(config.cvrB.denominatorLabels)
                        ? config.cvrB.denominatorLabels.map((l: string) => l.trim())
                        : config.cvrB.denominatorLabels.split(',').map((l: string) => l.trim()),
                    numeratorDimension: config.cvrB.numeratorDimension,
                    numeratorLabels: Array.isArray(config.cvrB.numeratorLabels)
                        ? config.cvrB.numeratorLabels.map((l: string) => l.trim())
                        : config.cvrB.numeratorLabels.split(',').map((l: string) => l.trim()),
                    metric: config.cvrB.metric,
                } : undefined,
                cvrC: showCvrC && config.cvrC.denominatorDimension ? {
                    denominatorDimension: config.cvrC.denominatorDimension,
                    denominatorLabels: Array.isArray(config.cvrC.denominatorLabels)
                        ? config.cvrC.denominatorLabels.map((l: string) => l.trim())
                        : config.cvrC.denominatorLabels.split(',').map((l: string) => l.trim()),
                    numeratorDimension: config.cvrC.numeratorDimension,
                    numeratorLabels: Array.isArray(config.cvrC.numeratorLabels)
                        ? config.cvrC.numeratorLabels.map((l: string) => l.trim())
                        : config.cvrC.numeratorLabels.split(',').map((l: string) => l.trim()),
                    metric: config.cvrC.metric,
                } : undefined,
                cvrD: showCvrD && config.cvrD.denominatorDimension ? {
                    denominatorDimension: config.cvrD.denominatorDimension,
                    denominatorLabels: Array.isArray(config.cvrD.denominatorLabels)
                        ? config.cvrD.denominatorLabels.map((l: string) => l.trim())
                        : config.cvrD.denominatorLabels.split(',').map((l: string) => l.trim()),
                    numeratorDimension: config.cvrD.numeratorDimension,
                    numeratorLabels: Array.isArray(config.cvrD.numeratorLabels)
                        ? config.cvrD.numeratorLabels.map((l: string) => l.trim())
                        : config.cvrD.numeratorLabels.split(',').map((l: string) => l.trim()),
                    metric: config.cvrD.metric,
                } : undefined,
                abTestEvaluationConfig: config.abTestEvaluationConfig,
                geminiConfig: config.geminiConfig,
            }

            const response = await fetch('/api/analytics/report', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.message || data.error || 'レポート生成に失敗しました')
            }

            if (data.executionId) {
                router.push(`/reports/${data.executionId}`)
            } else {
                setResult(data)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'エラーが発生しました')
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h1 className={styles.title}>GA4分析</h1>
                    <BackLink href="/">ダッシュボードに戻る</BackLink>
                </div>
                <div className={styles.loaderContainer}>
                    <div style={{ textAlign: 'center' }}>
                        <Loader />
                        <p className={styles.loaderText}>レポート生成中...</p>
                    </div>
                </div>
            </div>
        )
    }

    if (!currentProduct) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h1 className={styles.title}>GA4分析</h1>
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
                <h1 className={styles.title}>GA4分析</h1>
                <BackLink href="/">ダッシュボードに戻る</BackLink>
            </div>
            {currentProduct && (
                <div className={styles.infoBox}>
                    <p className={styles.infoText}>
                        <strong>現在のプロダクト:</strong> {currentProduct.name}
                        {currentProduct.domain && ` (${currentProduct.domain})`}
                    </p>
                </div>
            )}

            <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.successBox}>
                    <h3 style={{ fontWeight: 600, marginBottom: '0.5rem' }}>✅ GA4認証設定</h3>
                    <p className={styles.successText}>
                        サービスアカウントキーが設定されています。自動的に認証されます。
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
                        <p><strong>サービスアカウント:</strong> ga4-analytics-dashboard@ga4-analytics-dashboard-486911.iam.gserviceaccount.com</p>
                        <p className={styles.successLink}>
                            ⚠️ GA4プロパティ（492794577）にサービスアカウントのアクセス権限を付与してください。
                            「管理」→「プロパティアクセス管理」から追加できます。
                        </p>
                    </div>
                    <div style={{ marginTop: '1rem' }}>
                        <label className={styles.formLabel}>GA4アクセストークン（オプション - 上書き用）</label>
                        <input
                            type="password"
                            value={accessToken}
                            onChange={(e) => setAccessToken(e.target.value)}
                            placeholder="サービスアカウントを使用する場合は空欄でOK"
                            className={styles.formInput}
                        />
                        <p className={styles.helpText}>
                            フォームから入力した場合は、サービスアカウントより優先されます
                        </p>
                    </div>
                </div>

                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>基本設定</h2>
                    <div className={styles.formGrid}>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>レポート名</label>
                            <input
                                type="text"
                                value={config.reportName}
                                onChange={(e) => setConfig({ ...config, reportName: e.target.value })}
                                placeholder="XWork_SU_01"
                                className={styles.formInput}
                                required
                            />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>プロパティID</label>
                            <input
                                type="text"
                                value={config.propertyId}
                                onChange={(e) => setConfig({ ...config, propertyId: e.target.value })}
                                className={styles.formInput}
                                required
                            />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>開始日</label>
                                                            <DateInput
                                                            value={config.startDate}
                                onChange={(e) => setConfig({ ...config, startDate: e.target.value })}
                                className={styles.formInput}
                                required
                            />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>終了日</label>
                                                            <DateInput
                                                            value={config.endDate}
                                onChange={(e) => setConfig({ ...config, endDate: e.target.value })}
                                className={styles.formInput}
                                required
                            />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>メトリクス</label>
                            <input
                                type="text"
                                value={config.metrics}
                                onChange={(e) => setConfig({ ...config, metrics: e.target.value })}
                                className={styles.formInput}
                                placeholder="eventCount,totalUsers"
                                required
                            />
                            <p className={styles.helpText}>
                                取得したい指標のAPI名をカンマ区切りで指定します。
                            </p>
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>ディメンション</label>
                            <input
                                type="text"
                                value={config.dimensions}
                                onChange={(e) => setConfig({ ...config, dimensions: e.target.value })}
                                className={styles.formInput}
                                placeholder="date,eventName"
                                required
                            />
                            <p className={styles.helpText}>
                                取得したい分析軸のAPI名をカンマ区切りで指定します。
                            </p>
                        </div>
                    </div>
                </div>

                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>フィルタ設定</h2>
                    <div className={styles.formGrid}>
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
                    </div>
                </div>

                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>CVR設定 A</h2>
                    <div className={styles.formGrid}>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>分母ディメンション</label>
                            <CustomSelect
                                value={config.cvrA.denominatorDimension}
                                onChange={(v) => setConfig({ ...config, cvrA: { ...config.cvrA, denominatorDimension: v } })}
                                options={GA4_CVR_DIMENSIONS.map((d) => ({ value: d.value, label: d.label }))}
                                triggerClassName={styles.formSelect}
                                placeholder="選択してください"
                                aria-label="CVR A 分母ディメンション"
                            />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>分母ラベル</label>
                            <LabelInput
                                value={config.cvrA.denominatorLabels}
                                onChange={(v) => setConfig({ ...config, cvrA: { ...config.cvrA, denominatorLabels: v } })}
                                placeholder="EF__Line__Area__新規会員登録"
                                className={styles.formInput}
                            />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>分子ディメンション</label>
                            <CustomSelect
                                value={config.cvrA.numeratorDimension}
                                onChange={(v) => setConfig({ ...config, cvrA: { ...config.cvrA, numeratorDimension: v } })}
                                options={GA4_CVR_DIMENSIONS.map((d) => ({ value: d.value, label: d.label }))}
                                triggerClassName={styles.formSelect}
                                placeholder="選択してください"
                                aria-label="CVR A 分子ディメンション"
                            />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>分子ラベル</label>
                            <LabelInput
                                value={config.cvrA.numeratorLabels}
                                onChange={(v) => setConfig({ ...config, cvrA: { ...config.cvrA, numeratorLabels: v } })}
                                placeholder="EF__Driver__Label__StepLast_求人を探しに行く"
                                className={styles.formInput}
                            />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>計算メトリクス</label>
                            <CustomSelect
                                value={config.cvrA.metric}
                                onChange={(v) => setConfig({ ...config, cvrA: { ...config.cvrA, metric: v } })}
                                options={GA4_METRICS.map((m) => ({ value: m.value, label: m.label }))}
                                triggerClassName={styles.formSelect}
                                aria-label="CVR A 計算メトリクス"
                            />
                        </div>
                    </div>
                </div>

                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>CVR設定 B</h2>
                        <Switch
                            checked={showCvrB}
                            onChange={setShowCvrB}
                            aria-label="CVR設定 B の表示切替"
                        />
                    </div>
                    {showCvrB && (
                        <div className={styles.formGrid}>
                            <div className={styles.formField}>
                                <label className={styles.formLabel}>分母ディメンション</label>
                                <CustomSelect
                                    value={config.cvrB.denominatorDimension}
                                    onChange={(v) => setConfig({ ...config, cvrB: { ...config.cvrB, denominatorDimension: v } })}
                                    options={GA4_CVR_DIMENSIONS.map((d) => ({ value: d.value, label: d.label }))}
                                    triggerClassName={styles.formSelect}
                                    placeholder="選択してください"
                                    aria-label="CVR B 分母ディメンション"
                                />
                            </div>
                            <div className={styles.formField}>
                                <label className={styles.formLabel}>分母ラベル</label>
                                <LabelInput
                                    value={config.cvrB.denominatorLabels}
                                    onChange={(v) => setConfig({ ...config, cvrB: { ...config.cvrB, denominatorLabels: v } })}
                                    placeholder="EF__Line__Area__新規会員登録"
                                    className={styles.formInput}
                                />
                            </div>
                            <div className={styles.formField}>
                                <label className={styles.formLabel}>分子ディメンション</label>
                                <CustomSelect
                                    value={config.cvrB.numeratorDimension}
                                    onChange={(v) => setConfig({ ...config, cvrB: { ...config.cvrB, numeratorDimension: v } })}
                                    options={GA4_CVR_DIMENSIONS.map((d) => ({ value: d.value, label: d.label }))}
                                    triggerClassName={styles.formSelect}
                                    placeholder="選択してください"
                                    aria-label="CVR B 分子ディメンション"
                                />
                            </div>
                            <div className={styles.formField}>
                                <label className={styles.formLabel}>分子ラベル</label>
                                <LabelInput
                                    value={config.cvrB.numeratorLabels}
                                    onChange={(v) => setConfig({ ...config, cvrB: { ...config.cvrB, numeratorLabels: v } })}
                                    placeholder="EF__Driver__Label__StepLast_求人を探しに行く"
                                    className={styles.formInput}
                                />
                            </div>
                            <div className={styles.formField}>
                                <label className={styles.formLabel}>計算メトリクス</label>
                                <CustomSelect
                                    value={config.cvrB.metric}
                                    onChange={(v) => setConfig({ ...config, cvrB: { ...config.cvrB, metric: v } })}
                                    options={GA4_METRICS.map((m) => ({ value: m.value, label: m.label }))}
                                    triggerClassName={styles.formSelect}
                                    aria-label="CVR B 計算メトリクス"
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>CVR設定 C</h2>
                        <Switch
                            checked={showCvrC}
                            onChange={setShowCvrC}
                            aria-label="CVR設定 C の表示切替"
                        />
                    </div>
                    {showCvrC && (
                        <div className={styles.formGrid}>
                            <div className={styles.formField}>
                                <label className={styles.formLabel}>分母ディメンション</label>
                                <CustomSelect
                                    value={config.cvrC.denominatorDimension}
                                    onChange={(v) => setConfig({ ...config, cvrC: { ...config.cvrC, denominatorDimension: v } })}
                                    options={GA4_CVR_DIMENSIONS.map((d) => ({ value: d.value, label: d.label }))}
                                    triggerClassName={styles.formSelect}
                                    placeholder="選択してください"
                                    aria-label="CVR C 分母ディメンション"
                                />
                            </div>
                            <div className={styles.formField}>
                                <label className={styles.formLabel}>分母ラベル</label>
                                <LabelInput
                                    value={config.cvrC.denominatorLabels}
                                    onChange={(v) => setConfig({ ...config, cvrC: { ...config.cvrC, denominatorLabels: v } })}
                                    placeholder="EF__Line__Area__新規会員登録"
                                    className={styles.formInput}
                                />
                            </div>
                            <div className={styles.formField}>
                                <label className={styles.formLabel}>分子ディメンション</label>
                                <CustomSelect
                                    value={config.cvrC.numeratorDimension}
                                    onChange={(v) => setConfig({ ...config, cvrC: { ...config.cvrC, numeratorDimension: v } })}
                                    options={GA4_CVR_DIMENSIONS.map((d) => ({ value: d.value, label: d.label }))}
                                    triggerClassName={styles.formSelect}
                                    placeholder="選択してください"
                                    aria-label="CVR C 分子ディメンション"
                                />
                            </div>
                            <div className={styles.formField}>
                                <label className={styles.formLabel}>分子ラベル</label>
                                <LabelInput
                                    value={config.cvrC.numeratorLabels}
                                    onChange={(v) => setConfig({ ...config, cvrC: { ...config.cvrC, numeratorLabels: v } })}
                                    placeholder="EF__Driver__Label__StepLast_求人を探しに行く"
                                    className={styles.formInput}
                                />
                            </div>
                            <div className={styles.formField}>
                                <label className={styles.formLabel}>計算メトリクス</label>
                                <CustomSelect
                                    value={config.cvrC.metric}
                                    onChange={(v) => setConfig({ ...config, cvrC: { ...config.cvrC, metric: v } })}
                                    options={GA4_METRICS.map((m) => ({ value: m.value, label: m.label }))}
                                    triggerClassName={styles.formSelect}
                                    aria-label="CVR C 計算メトリクス"
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>CVR設定 D</h2>
                        <Switch
                            checked={showCvrD}
                            onChange={setShowCvrD}
                            aria-label="CVR設定 D の表示切替"
                        />
                    </div>
                    {showCvrD && (
                        <div className={styles.formGrid}>
                            <div className={styles.formField}>
                                <label className={styles.formLabel}>分母ディメンション</label>
                                <CustomSelect
                                    value={config.cvrD.denominatorDimension}
                                    onChange={(v) => setConfig({ ...config, cvrD: { ...config.cvrD, denominatorDimension: v } })}
                                    options={GA4_CVR_DIMENSIONS.map((d) => ({ value: d.value, label: d.label }))}
                                    triggerClassName={styles.formSelect}
                                    placeholder="選択してください"
                                    aria-label="CVR D 分母ディメンション"
                                />
                            </div>
                            <div className={styles.formField}>
                                <label className={styles.formLabel}>分母ラベル</label>
                                <LabelInput
                                    value={config.cvrD.denominatorLabels}
                                    onChange={(v) => setConfig({ ...config, cvrD: { ...config.cvrD, denominatorLabels: v } })}
                                    placeholder="EF__Line__Area__新規会員登録"
                                    className={styles.formInput}
                                />
                            </div>
                            <div className={styles.formField}>
                                <label className={styles.formLabel}>分子ディメンション</label>
                                <CustomSelect
                                    value={config.cvrD.numeratorDimension}
                                    onChange={(v) => setConfig({ ...config, cvrD: { ...config.cvrD, numeratorDimension: v } })}
                                    options={GA4_CVR_DIMENSIONS.map((d) => ({ value: d.value, label: d.label }))}
                                    triggerClassName={styles.formSelect}
                                    placeholder="選択してください"
                                    aria-label="CVR D 分子ディメンション"
                                />
                            </div>
                            <div className={styles.formField}>
                                <label className={styles.formLabel}>分子ラベル</label>
                                <LabelInput
                                    value={config.cvrD.numeratorLabels}
                                    onChange={(v) => setConfig({ ...config, cvrD: { ...config.cvrD, numeratorLabels: v } })}
                                    placeholder="EF__Driver__Label__StepLast_求人を探しに行く"
                                    className={styles.formInput}
                                />
                            </div>
                            <div className={styles.formField}>
                                <label className={styles.formLabel}>計算メトリクス</label>
                                <CustomSelect
                                    value={config.cvrD.metric}
                                    onChange={(v) => setConfig({ ...config, cvrD: { ...config.cvrD, metric: v } })}
                                    options={GA4_METRICS.map((m) => ({ value: m.value, label: m.label }))}
                                    triggerClassName={styles.formSelect}
                                    aria-label="CVR D 計算メトリクス"
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>ABテスト判定設定</h2>
                    <div className={styles.formGrid}>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>統計的有意差 (%)</label>
                            <input
                                type="number"
                                value={config.abTestEvaluationConfig.minSignificance || ''}
                                onChange={(e) => setConfig({
                                    ...config,
                                    abTestEvaluationConfig: {
                                        ...config.abTestEvaluationConfig,
                                        minSignificance: e.target.value ? parseFloat(e.target.value) : null,
                                    },
                                })}
                                className={styles.formInput}
                            />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>最低PV数</label>
                            <input
                                type="number"
                                value={isNaN(config.abTestEvaluationConfig.minPV) ? '' : config.abTestEvaluationConfig.minPV}
                                onChange={(e) => setConfig({
                                    ...config,
                                    abTestEvaluationConfig: {
                                        ...config.abTestEvaluationConfig,
                                        minPV: e.target.value ? parseInt(e.target.value, 10) : 0,
                                    },
                                })}
                                className={styles.formInput}
                            />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>最低期間 (日)</label>
                            <input
                                type="number"
                                value={isNaN(config.abTestEvaluationConfig.minDays) ? '' : config.abTestEvaluationConfig.minDays}
                                onChange={(e) => setConfig({
                                    ...config,
                                    abTestEvaluationConfig: {
                                        ...config.abTestEvaluationConfig,
                                        minDays: e.target.value ? parseInt(e.target.value, 10) : 0,
                                    },
                                })}
                                className={styles.formInput}
                            />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>最低改善率 (%)</label>
                            <input
                                type="number"
                                step="0.1"
                                value={isNaN(config.abTestEvaluationConfig.minImprovementRate) ? '' : config.abTestEvaluationConfig.minImprovementRate}
                                onChange={(e) => setConfig({
                                    ...config,
                                    abTestEvaluationConfig: {
                                        ...config.abTestEvaluationConfig,
                                        minImprovementRate: e.target.value ? parseFloat(e.target.value) : 0,
                                    },
                                })}
                                className={styles.formInput}
                            />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>最低差分 (pt)</label>
                            <input
                                type="number"
                                step="0.1"
                                value={isNaN(config.abTestEvaluationConfig.minDifferencePt) ? '' : config.abTestEvaluationConfig.minDifferencePt}
                                onChange={(e) => setConfig({
                                    ...config,
                                    abTestEvaluationConfig: {
                                        ...config.abTestEvaluationConfig,
                                        minDifferencePt: e.target.value ? parseFloat(e.target.value) : 0,
                                    },
                                })}
                                className={styles.formInput}
                            />
                        </div>
                    </div>
                </div>

                <GeminiConfig
                    enabled={config.geminiConfig.enabled}
                    apiKey={config.geminiConfig.apiKey}
                    onEnabledChange={(enabled) => setConfig({
                        ...config,
                        geminiConfig: { ...config.geminiConfig, enabled },
                    })}
                    onApiKeyChange={(apiKey) => setConfig({
                        ...config,
                        geminiConfig: { ...config.geminiConfig, apiKey },
                    })}
                />

                <button
                    type="submit"
                    disabled={loading}
                    className={`executionButton ${loading ? styles.submitButtonDisabled : ''}`}
                >
                    <span>レポートを生成</span>
                </button>
            </form>

            {error && (
                <div className={styles.errorBox}>
                    <p className={styles.errorTitle}>エラー</p>
                    <p>{error}</p>
                </div>
            )}

            {result && (
                <div className={styles.resultSection}>
                    <div className={styles.resultHeader}>
                        <h2 className={styles.resultTitle}>レポート結果</h2>
                        {result.executionId && (
                            <Link
                                href={`/reports/${result.executionId}`}
                                className={styles.resultLink}
                            >
                                履歴で詳細を見る
                            </Link>
                        )}
                    </div>
                    <div className={styles.resultContent}>
                        {result.cvrResults && (
                            <div className={styles.resultSubsection}>
                                <h3 className={styles.resultSubtitle}>CVR結果</h3>
                                <div className={styles.resultGrid}>
                                    {result.cvrResults.dataA && (
                                        <div className={styles.resultCard}>
                                            <h4 className={styles.resultCardTitle}>パターン A</h4>
                                            <p className={styles.resultText}>PV: {result.cvrResults.dataA.pv.toLocaleString()}</p>
                                            <p className={styles.resultText}>CV: {result.cvrResults.dataA.cv.toLocaleString()}</p>
                                            <p className={styles.resultText}>CVR: {(result.cvrResults.dataA.cvr * 100).toFixed(2)}%</p>
                                        </div>
                                    )}
                                    {result.cvrResults.dataB && (
                                        <div className={styles.resultCard}>
                                            <h4 className={styles.resultCardTitle}>パターン B</h4>
                                            <p className={styles.resultText}>PV: {result.cvrResults.dataB.pv.toLocaleString()}</p>
                                            <p className={styles.resultText}>CV: {result.cvrResults.dataB.cv.toLocaleString()}</p>
                                            <p className={styles.resultText}>CVR: {(result.cvrResults.dataB.cvr * 100).toFixed(2)}%</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {result.abTestEvaluation && (
                            <div className={styles.resultSubsection}>
                                <h3 className={styles.resultSubtitle}>ABテスト評価結果</h3>
                                <div className={styles.resultEvaluationCard}>
                                    <p className={styles.resultEvaluationText}>
                                        <strong>判定:</strong> {result.abTestEvaluation.recommendation}
                                    </p>
                                    <div className={styles.resultEvaluationList}>
                                        <p className={styles.resultEvaluationItem}>
                                            統計的有意差: {result.abTestEvaluation.checks.significance.value}%
                                            {result.abTestEvaluation.checks.significance.passed ? ' ✅' : ' ❌'}
                                        </p>
                                        <p className={styles.resultEvaluationItem}>
                                            サンプル数: {result.abTestEvaluation.checks.sampleSize.passed ? '✅' : '❌'}
                                        </p>
                                        <p className={styles.resultEvaluationItem}>
                                            テスト期間: {result.abTestEvaluation.checks.period.days}日間
                                            {result.abTestEvaluation.checks.period.passed ? ' ✅' : ' ❌'}
                                        </p>
                                        <p className={styles.resultEvaluationItem}>
                                            改善幅: {result.abTestEvaluation.checks.improvement.passed ? '✅' : '❌'}
                                        </p>
                                    </div>
                                    {result.abTestEvaluation.aiEvaluation ? (
                                        <div className={styles.resultEvaluationBox}>
                                            <p className={styles.resultEvaluationBoxTitle}>Gemini評価:</p>
                                            <p className={styles.resultEvaluationBoxText}>{result.abTestEvaluation.aiEvaluation}</p>
                                        </div>
                                    ) : result.abTestEvaluation && config.geminiConfig.enabled && (
                                        <div className={styles.resultEvaluationWarning}>
                                            <p className={styles.resultEvaluationWarningText}>
                                                ⚠️ Gemini評価が表示されませんでした。ブラウザのコンソール（F12）でエラーを確認してください。
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className={styles.footerLink}>
                <BackLink href="/">ダッシュボードに戻る</BackLink>
            </div>
        </div>
    )
}

export default function AnalyticsPage() {
    return (
        <Suspense fallback={<Loader />}>
            <AnalyticsPageContent />
        </Suspense>
    )
}
