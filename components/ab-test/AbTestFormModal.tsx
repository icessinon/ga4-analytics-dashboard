'use client'

import { useState, useEffect } from 'react'
import DateInput from '@/components/DateInput'
import AbTestScheduleConfig, { ScheduleConfig } from './AbTestScheduleConfig'
import CustomSelect from '@/components/CustomSelect'
import GeminiConfig from '@/components/GeminiConfig'
import Switch from '@/components/Switch'
import { GA4_CVR_DIMENSIONS, GA4_DIMENSIONS, GA4_FILTER_DIMENSIONS, GA4_METRICS, GA4_FILTER_OPERATORS } from '@/lib/constants/ga4Dimensions'
import styles from './AbTestFormModal.module.css'
import type { AbTestFormModalProps } from './types'

interface Props extends AbTestFormModalProps {}

interface FunnelStepForm {
    stepName: string
    dimension: string
    labelsA: string
    labelsB: string
    labelsC: string
    labelsD: string
}

const emptyFunnelStep = (): FunnelStepForm => ({
    stepName: '',
    dimension: 'customEvent:view_label',
    labelsA: '',
    labelsB: '',
    labelsC: '',
    labelsD: '',
})

const joinFunnelLabels = (labels: unknown): string =>
    Array.isArray(labels) ? labels.join(',') : typeof labels === 'string' ? labels : ''

export default function AbTestFormModal({
    isOpen,
    onClose,
    onSubmit,
    editingTest,
    products,
    currentProductId,
}: Props) {
    const [formData, setFormData] = useState({
        productId: currentProductId?.toString() || (products.length === 1 ? products[0].id.toString() : ''),
        name: '',
        description: '',
        hypothesis: '',
        expectedImprovement: '',
        startDate: '',
        endDate: '',
        status: 'running',
        autoExecute: true,
    })

    const [ga4Config, setGa4Config] = useState({
        propertyId: '',
        metrics: 'eventCount,totalUsers',
        dimensions: 'customEvent:click_label,customEvent:view_label',
        filterDimension: '',
        filterOperator: 'CONTAINS',
        filterExpression: '',
        limit: 25000,
        cvrA: {
            denominatorDimension: '',
            denominatorLabels: '',
            numeratorDimension: '',
            numeratorLabels: '',
            metric: 'totalUsers',
        },
        cvrB: {
            denominatorDimension: '',
            denominatorLabels: '',
            numeratorDimension: '',
            numeratorLabels: '',
            metric: 'totalUsers',
        },
        cvrC: {
            denominatorDimension: '',
            denominatorLabels: '',
            numeratorDimension: '',
            numeratorLabels: '',
            metric: 'totalUsers',
        },
        cvrD: {
            denominatorDimension: '',
            denominatorLabels: '',
            numeratorDimension: '',
            numeratorLabels: '',
            metric: 'totalUsers',
        },
        abTestEvaluationConfig: {
            minSignificance: null as number | null,
            minPV: 1000,
            minDays: 14,
            minImprovementRate: 5,
            minDifferencePt: 0.5,
        },
        geminiConfig: {
            enabled: false,
        },
    })

    const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig>({
        enabled: true,
        executionType: 'on_end',
    })

    const [showCvrB, setShowCvrB] = useState(true)
    const [showCvrC, setShowCvrC] = useState(false)
    const [showCvrD, setShowCvrD] = useState(false)
    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<any>(null)
    const [testError, setTestError] = useState<string | null>(null)
    const [baselineCvr, setBaselineCvr] = useState('')
    const [dailyPv, setDailyPv] = useState('')
    const [funnelSteps, setFunnelSteps] = useState<FunnelStepForm[]>([])

    const updateFunnelStep = (index: number, patch: Partial<FunnelStepForm>) => {
        setFunnelSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
    }

    // 必要サンプルサイズ: 有意水準95%（z=1.96）・検出力80%（z=0.84）の両側Z検定
    const requiredSampleSize = (() => {
        const p1 = parseFloat(baselineCvr) / 100
        const improvement = parseFloat(formData.expectedImprovement)
        if (!Number.isFinite(p1) || p1 <= 0 || p1 >= 1) return null
        if (!Number.isFinite(improvement) || improvement === 0) return null
        const p2 = p1 * (1 + improvement / 100)
        if (p2 <= 0 || p2 >= 1) return null
        return Math.ceil(((1.96 + 0.84) ** 2 * (p1 * (1 - p1) + p2 * (1 - p2))) / (p2 - p1) ** 2)
    })()

    const requiredDays = (() => {
        if (requiredSampleSize == null) return null
        const pv = parseFloat(dailyPv)
        if (!Number.isFinite(pv) || pv <= 0) return null
        return Math.ceil(requiredSampleSize / pv)
    })()

    useEffect(() => {
        if (formData.productId) {
            const selectedProduct = products.find((p) => p.id.toString() === formData.productId)
            if (selectedProduct?.ga4PropertyId && !editingTest) {
                setGa4Config((prev) => ({
                    ...prev,
                    propertyId: selectedProduct.ga4PropertyId || prev.propertyId,
                    cvrC: prev.cvrC || {
                        denominatorDimension: '',
                        denominatorLabels: '',
                        numeratorDimension: '',
                        numeratorLabels: '',
                        metric: 'totalUsers',
                    },
                    cvrD: prev.cvrD || {
                        denominatorDimension: '',
                        denominatorLabels: '',
                        numeratorDimension: '',
                        numeratorLabels: '',
                        metric: 'totalUsers',
                    },
                }))
            }
        }
    }, [formData.productId, products, editingTest])

    useEffect(() => {
        if (!isOpen) return

        setTestResult(null)
        setTestError(null)
        setTesting(false)

        if (editingTest) {
            setFormData({
                productId: editingTest.product.id.toString(),
                name: editingTest.name,
                description: editingTest.description || '',
                hypothesis: editingTest.hypothesis || '',
                expectedImprovement: editingTest.expectedImprovement != null ? String(editingTest.expectedImprovement) : '',
                startDate: new Date(editingTest.startDate).toISOString().split('T')[0],
                endDate: editingTest.endDate ? new Date(editingTest.endDate).toISOString().split('T')[0] : '',
                status: editingTest.status,
                autoExecute: editingTest.autoExecute !== undefined ? editingTest.autoExecute : true,
            })

            if (editingTest.ga4Config) {
                const config = editingTest.ga4Config as any
                setGa4Config({
                    propertyId: config.propertyId || '',
                    metrics: Array.isArray(config.metrics) ? config.metrics.map((m: any) => m.name || m).join(',') : config.metrics || '',
                    dimensions: Array.isArray(config.dimensions) ? config.dimensions.map((d: any) => d.name || d).join(',') : config.dimensions || '',
                    filterDimension: config.filter?.dimension || '',
                    filterOperator: config.filter?.operator || 'CONTAINS',
                    filterExpression: config.filter?.expression || '',
                    limit: config.limit || 25000,
                    cvrA: {
                        denominatorDimension: config.cvrA?.denominatorDimension || '',
                        denominatorLabels: Array.isArray(config.cvrA?.denominatorLabels) ? config.cvrA.denominatorLabels.join(',') : config.cvrA?.denominatorLabels || '',
                        numeratorDimension: config.cvrA?.numeratorDimension || '',
                        numeratorLabels: Array.isArray(config.cvrA?.numeratorLabels) ? config.cvrA.numeratorLabels.join(',') : config.cvrA?.numeratorLabels || '',
                        metric: config.cvrA?.metric || 'totalUsers',
                    },
                    cvrB: {
                        denominatorDimension: config.cvrB?.denominatorDimension || '',
                        denominatorLabels: Array.isArray(config.cvrB?.denominatorLabels) ? config.cvrB.denominatorLabels.join(',') : config.cvrB?.denominatorLabels || '',
                        numeratorDimension: config.cvrB?.numeratorDimension || '',
                        numeratorLabels: Array.isArray(config.cvrB?.numeratorLabels) ? config.cvrB.numeratorLabels.join(',') : config.cvrB?.numeratorLabels || '',
                        metric: config.cvrB?.metric || 'totalUsers',
                    },
                    cvrC: {
                        denominatorDimension: config.cvrC?.denominatorDimension || '',
                        denominatorLabels: Array.isArray(config.cvrC?.denominatorLabels) ? config.cvrC.denominatorLabels.join(',') : config.cvrC?.denominatorLabels || '',
                        numeratorDimension: config.cvrC?.numeratorDimension || '',
                        numeratorLabels: Array.isArray(config.cvrC?.numeratorLabels) ? config.cvrC.numeratorLabels.join(',') : config.cvrC?.numeratorLabels || '',
                        metric: config.cvrC?.metric || 'totalUsers',
                    },
                    cvrD: {
                        denominatorDimension: config.cvrD?.denominatorDimension || '',
                        denominatorLabels: Array.isArray(config.cvrD?.denominatorLabels) ? config.cvrD.denominatorLabels.join(',') : config.cvrD?.denominatorLabels || '',
                        numeratorDimension: config.cvrD?.numeratorDimension || '',
                        numeratorLabels: Array.isArray(config.cvrD?.numeratorLabels) ? config.cvrD.numeratorLabels.join(',') : config.cvrD?.numeratorLabels || '',
                        metric: config.cvrD?.metric || 'totalUsers',
                    },
                    abTestEvaluationConfig: config.abTestEvaluationConfig || {
                        minSignificance: null,
                        minPV: 1000,
                        minDays: 14,
                        minImprovementRate: 5,
                        minDifferencePt: 0.5,
                    },
                    geminiConfig: config.geminiConfig || { enabled: false },
                })
                if (config.cvrB) setShowCvrB(true)
                if (config.cvrC) setShowCvrC(true)
                if (config.cvrD) setShowCvrD(true)
                setFunnelSteps(((config.funnelSteps as any[]) ?? []).map((s: any) => ({
                    stepName: s.stepName || '',
                    dimension: s.dimension || 'customEvent:view_label',
                    labelsA: joinFunnelLabels(s.labels?.A),
                    labelsB: joinFunnelLabels(s.labels?.B),
                    labelsC: joinFunnelLabels(s.labels?.C),
                    labelsD: joinFunnelLabels(s.labels?.D),
                })))
            } else {
                setFunnelSteps([])
            }

            if (editingTest.scheduleConfig) {
                setScheduleConfig(editingTest.scheduleConfig as unknown as ScheduleConfig)
            } else {
                setScheduleConfig({
                    enabled: true,
                    executionType: 'on_end',
                })
            }
        } else {
            const initialProductId = currentProductId?.toString() || (products.length === 1 ? products[0].id.toString() : '')
            setFormData({
                productId: initialProductId,
                name: '',
                description: '',
                hypothesis: '',
                expectedImprovement: '',
                startDate: '',
                endDate: '',
                status: 'running',
                autoExecute: true,
            })
            setTestResult(null)
            setTestError(null)
            setTesting(false)
            setFunnelSteps([])
            setScheduleConfig({
                enabled: true,
                executionType: 'on_end',
            })

            setGa4Config({
                propertyId: '',
                metrics: 'eventCount,totalUsers',
                dimensions: 'customEvent:click_label,customEvent:view_label',
                filterDimension: '',
                filterOperator: 'CONTAINS',
                filterExpression: '',
                limit: 25000,
                cvrA: {
                    denominatorDimension: '',
                    denominatorLabels: '',
                    numeratorDimension: '',
                    numeratorLabels: '',
                    metric: 'totalUsers',
                },
                cvrB: {
                    denominatorDimension: '',
                    denominatorLabels: '',
                    numeratorDimension: '',
                    numeratorLabels: '',
                    metric: 'totalUsers',
                },
                cvrC: {
                    denominatorDimension: '',
                    denominatorLabels: '',
                    numeratorDimension: '',
                    numeratorLabels: '',
                    metric: 'totalUsers',
                },
                cvrD: {
                    denominatorDimension: '',
                    denominatorLabels: '',
                    numeratorDimension: '',
                    numeratorLabels: '',
                    metric: 'totalUsers',
                },
                abTestEvaluationConfig: {
                    minSignificance: null,
                    minPV: 1000,
                    minDays: 14,
                    minImprovementRate: 5,
                    minDifferencePt: 0.5,
                },
                geminiConfig: {
                    enabled: false,
                },
            })

            if (initialProductId) {
                const initialProduct = products.find((p) => p.id.toString() === initialProductId)
                if (initialProduct?.ga4PropertyId) {
                    setGa4Config((prev) => ({
                        ...prev,
                        propertyId: initialProduct.ga4PropertyId || prev.propertyId,
                    }))
                }
            }
        }
    }, [editingTest?.id, currentProductId, isOpen, products])

    const handleTestExecute = async () => {
        if (!formData.startDate || !formData.endDate) {
            setTestError('開始日と終了日を入力してください')
            return
        }

        if (!ga4Config.propertyId) {
            setTestError('GA4プロパティIDを入力してください')
            return
        }

        setTesting(true)
        setTestError(null)
        setTestResult(null)

        try {
            const apiGa4Config: any = {
                propertyId: ga4Config.propertyId,
                metrics: ga4Config.metrics.split(',').map((m: string) => ({ name: m.trim() })),
                dimensions: ga4Config.dimensions.split(',').map((d: string) => ({ name: d.trim() })),
                limit: parseInt(ga4Config.limit.toString(), 10) || 25000,
                cvrA: {
                    metric: ga4Config.cvrA.metric,
                    numeratorDimension: ga4Config.cvrA.numeratorDimension,
                    denominatorDimension: ga4Config.cvrA.denominatorDimension,
                    numeratorLabels: ga4Config.cvrA.numeratorLabels.split(',').map((l: string) => l.trim()).filter((l: string) => l.length > 0),
                    denominatorLabels: ga4Config.cvrA.denominatorLabels.split(',').map((l: string) => l.trim()).filter((l: string) => l.length > 0),
                },
                cvrB: {
                    metric: ga4Config.cvrB.metric,
                    numeratorDimension: ga4Config.cvrB.numeratorDimension,
                    denominatorDimension: ga4Config.cvrB.denominatorDimension,
                    numeratorLabels: ga4Config.cvrB.numeratorLabels.split(',').map((l: string) => l.trim()).filter((l: string) => l.length > 0),
                    denominatorLabels: ga4Config.cvrB.denominatorLabels.split(',').map((l: string) => l.trim()).filter((l: string) => l.length > 0),
                },
            }

            if (showCvrC && ga4Config.cvrC && ga4Config.cvrC.denominatorDimension) {
                apiGa4Config.cvrC = {
                    metric: ga4Config.cvrC.metric,
                    numeratorDimension: ga4Config.cvrC.numeratorDimension,
                    denominatorDimension: ga4Config.cvrC.denominatorDimension,
                    numeratorLabels: ga4Config.cvrC.numeratorLabels.split(',').map((l: string) => l.trim()).filter((l: string) => l.length > 0),
                    denominatorLabels: ga4Config.cvrC.denominatorLabels.split(',').map((l: string) => l.trim()).filter((l: string) => l.length > 0),
                }
            }

            if (showCvrD && ga4Config.cvrD && ga4Config.cvrD.denominatorDimension) {
                apiGa4Config.cvrD = {
                    metric: ga4Config.cvrD.metric,
                    numeratorDimension: ga4Config.cvrD.numeratorDimension,
                    denominatorDimension: ga4Config.cvrD.denominatorDimension,
                    numeratorLabels: ga4Config.cvrD.numeratorLabels.split(',').map((l: string) => l.trim()).filter((l: string) => l.length > 0),
                    denominatorLabels: ga4Config.cvrD.denominatorLabels.split(',').map((l: string) => l.trim()).filter((l: string) => l.length > 0),
                }
            }

            if (ga4Config.filterDimension && ga4Config.filterOperator && ga4Config.filterExpression) {
                apiGa4Config.filter = {
                    dimension: ga4Config.filterDimension,
                    operator: ga4Config.filterOperator,
                    expression: ga4Config.filterExpression,
                }
            }

            const response = await fetch('/api/ab-test/test-execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ga4Config: apiGa4Config,
                    startDate: formData.startDate,
                    endDate: formData.endDate,
                }),
            })

            const data = await response.json()

            if (!response.ok || data.error) {
                if (response.status === 401) {
                    const errorMsg = data.details 
                        ? `${data.message || data.error}\n\n${data.details}`
                        : data.message || data.error || 'GA4認証に失敗しました'
                    throw new Error(errorMsg)
                }
                throw new Error(data.message || data.error || 'テスト実行に失敗しました')
            }

            setTestResult(data)
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'テスト実行に失敗しました'
            setTestError(errorMessage)
        } finally {
            setTesting(false)
        }
    }

    const [submitting, setSubmitting] = useState(false)
    const splitLabels = (s: string | undefined) => (s ?? '').split(',').map((l) => l.trim()).filter(Boolean)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        // 日時未入力のまま保存すると自動実行が無音で永久に走らないため、保存前に弾く
        if (scheduleConfig.enabled && scheduleConfig.executionType === 'scheduled' && !scheduleConfig.scheduledDate) {
            alert('自動実行「特定の日時に実行」の日時を入力してください')
            return
        }
        setSubmitting(true)
        try {
            const ga4ConfigData = {
            propertyId: ga4Config.propertyId,
            metrics: (ga4Config.metrics ?? '').split(',').map((m) => ({ name: m.trim() })).filter((x) => x.name),
            dimensions: (ga4Config.dimensions ?? '').split(',').map((d) => ({ name: d.trim() })).filter((x) => x.name),
            filter: ga4Config.filterDimension ? {
                dimension: ga4Config.filterDimension,
                operator: ga4Config.filterOperator,
                expression: ga4Config.filterExpression,
            } : undefined,
            limit: ga4Config.limit,
            cvrA: {
                denominatorDimension: ga4Config.cvrA.denominatorDimension,
                denominatorLabels: splitLabels(ga4Config.cvrA.denominatorLabels),
                numeratorDimension: ga4Config.cvrA.numeratorDimension,
                numeratorLabels: splitLabels(ga4Config.cvrA.numeratorLabels),
                metric: ga4Config.cvrA.metric,
            },
            cvrB: showCvrB && ga4Config.cvrB.denominatorDimension ? {
                denominatorDimension: ga4Config.cvrB.denominatorDimension,
                denominatorLabels: splitLabels(ga4Config.cvrB.denominatorLabels),
                numeratorDimension: ga4Config.cvrB.numeratorDimension,
                numeratorLabels: splitLabels(ga4Config.cvrB.numeratorLabels),
                metric: ga4Config.cvrB.metric,
            } : undefined,
            cvrC: showCvrC && ga4Config.cvrC.denominatorDimension ? {
                denominatorDimension: ga4Config.cvrC.denominatorDimension,
                denominatorLabels: splitLabels(ga4Config.cvrC.denominatorLabels),
                numeratorDimension: ga4Config.cvrC.numeratorDimension,
                numeratorLabels: splitLabels(ga4Config.cvrC.numeratorLabels),
                metric: ga4Config.cvrC.metric,
            } : undefined,
            cvrD: showCvrD && ga4Config.cvrD.denominatorDimension ? {
                denominatorDimension: ga4Config.cvrD.denominatorDimension,
                denominatorLabels: splitLabels(ga4Config.cvrD.denominatorLabels),
                numeratorDimension: ga4Config.cvrD.numeratorDimension,
                numeratorLabels: splitLabels(ga4Config.cvrD.numeratorLabels),
                metric: ga4Config.cvrD.metric,
            } : undefined,
            funnelSteps: (() => {
                const steps = funnelSteps
                    .map((s) => ({
                        stepName: s.stepName.trim(),
                        dimension: s.dimension.trim(),
                        labels: {
                            A: splitLabels(s.labelsA),
                            B: splitLabels(s.labelsB),
                            C: splitLabels(s.labelsC),
                            D: splitLabels(s.labelsD),
                        },
                    }))
                    .filter((s) => s.stepName && s.dimension
                        && (s.labels.A.length > 0 || s.labels.B.length > 0 || s.labels.C.length > 0 || s.labels.D.length > 0))
                return steps.length > 0 ? steps : undefined
            })(),
            abTestEvaluationConfig: ga4Config.abTestEvaluationConfig,
            geminiConfig: ga4Config.geminiConfig,
        }

            await onSubmit({
                ...formData,
                expectedImprovement: formData.expectedImprovement === '' ? null : Number(formData.expectedImprovement),
                ga4Config: ga4ConfigData,
                scheduleConfig: scheduleConfig.enabled ? scheduleConfig : null,
            })
        } finally {
            setSubmitting(false)
            onClose()
        }
    }

    if (!isOpen) return null

    return (
        <div className={styles.modal} onClick={onClose}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2 className={styles.modalTitle}>
                        {editingTest ? 'ABテストを編集' : '新しいABテストを追加'}
                    </h2>
                    <button className={styles.closeButton} onClick={onClose}>
                        ×
                    </button>
                </div>

                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.formSection}>
                        <h3 className={styles.formSectionTitle}>基本情報</h3>
                        <div className={styles.formGrid}>
                            {products.length > 1 ? (
                                <div>
                                    <label className={styles.label}>プロダクト *</label>
                                    <CustomSelect
                                        value={formData.productId}
                                        onChange={(v) => setFormData({ ...formData, productId: v })}
                                        options={products.map((p) => ({ value: String(p.id), label: p.name }))}
                                        triggerClassName={styles.input}
                                        placeholder="選択してください"
                                        aria-label="プロダクト"
                                    />
                                </div>
                            ) : products.length === 1 ? (
                                <input type="hidden" value={products[0].id} />
                            ) : null}
                            <div>
                                <label className={styles.label}>テスト名 *</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className={styles.input}
                                    required
                                />
                            </div>
                            <div>
                                <label className={styles.label}>説明</label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className={styles.input}
                                    rows={3}
                                />
                            </div>
                            <div>
                                <label className={styles.label}>仮説</label>
                                <textarea
                                    value={formData.hypothesis}
                                    onChange={(e) => setFormData({ ...formData, hypothesis: e.target.value })}
                                    className={styles.input}
                                    rows={3}
                                    placeholder="例: ボタン文言を「応募する」に変えると、緊急性が伝わりCVRが改善する"
                                />
                                <p className={styles.helpText}>何をどう変えると、なぜ改善するのかを記録します（完了時の振り返りに使用）</p>
                            </div>
                            <div>
                                <label className={styles.label}>期待改善率（%）</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={formData.expectedImprovement}
                                    onChange={(e) => setFormData({ ...formData, expectedImprovement: e.target.value })}
                                    className={styles.input}
                                    placeholder="例: 10"
                                />
                                <p className={styles.helpText}>A比でどの程度のCVR改善を期待するか</p>
                            </div>
                            <div>
                                <label className={styles.label}>開始日 *</label>
                                                                    <DateInput
                                                                    value={formData.startDate}
                                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                                    className={styles.input}
                                    required
                                />
                            </div>
                            <div>
                                <label className={styles.label}>終了日</label>
                                                                    <DateInput
                                                                    value={formData.endDate}
                                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                                    className={styles.input}
                                />
                                <p className={styles.helpText}>空欄の場合は継続中として扱われます</p>
                            </div>
                            {editingTest && (
                                <div>
                                    <label className={styles.label}>ステータス</label>
                                    <CustomSelect
                                        value={formData.status}
                                        onChange={(v) => setFormData({ ...formData, status: v })}
                                        options={[
                                            { value: 'running', label: '実行中' },
                                            { value: 'completed', label: '完了' },
                                            { value: 'paused', label: '一時停止' },
                                        ]}
                                        triggerClassName={styles.input}
                                        aria-label="ステータス"
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className={styles.formSection}>
                        <h3 className={styles.formSectionTitle}>GA4分析設定</h3>
                        <div className={styles.formGrid}>
                            <div>
                                <label className={styles.label}>プロパティID *</label>
                                <input
                                    type="text"
                                    value={ga4Config.propertyId}
                                    onChange={(e) => setGa4Config({ ...ga4Config, propertyId: e.target.value })}
                                    className={styles.input}
                                    required
                                    placeholder={formData.productId ? (products.find(p => p.id.toString() === formData.productId)?.ga4PropertyId || 'プロダクトのGA4プロパティIDが設定されていません') : 'プロダクトを選択してください'}
                                />
                            </div>
                            <div>
                                <label className={styles.label}>メトリクス *</label>
                                <input
                                    type="text"
                                    value={ga4Config.metrics}
                                    onChange={(e) => setGa4Config({ ...ga4Config, metrics: e.target.value })}
                                    className={styles.input}
                                    placeholder="eventCount,totalUsers"
                                    required
                                />
                                <p className={styles.helpText}>
                                    取得したい指標のAPI名をカンマ区切りで指定します。
                                </p>
                            </div>
                            <div>
                                <label className={styles.label}>ディメンション *</label>
                                <input
                                    type="text"
                                    value={ga4Config.dimensions}
                                    onChange={(e) => setGa4Config({ ...ga4Config, dimensions: e.target.value })}
                                    className={styles.input}
                                    placeholder="date,eventName"
                                    required
                                />
                                <p className={styles.helpText}>
                                    取得したい分析軸のAPI名をカンマ区切りで指定します。
                                </p>
                            </div>
                            <div>
                                <label className={styles.label}>フィルタ ディメンション</label>
                                <CustomSelect
                                    value={ga4Config.filterDimension}
                                    onChange={(v) => setGa4Config({ ...ga4Config, filterDimension: v })}
                                    options={GA4_FILTER_DIMENSIONS.map((d) => ({ value: d.value, label: d.label }))}
                                    triggerClassName={styles.input}
                                    placeholder="選択してください"
                                    aria-label="フィルタ ディメンション"
                                />
                                <p className={styles.helpText}>
                                    フィルタをかけたいディメンションのAPI名。
                                </p>
                            </div>
                            <div>
                                <label className={styles.label}>フィルタ 演算子</label>
                                <CustomSelect
                                    value={ga4Config.filterOperator}
                                    onChange={(v) => setGa4Config({ ...ga4Config, filterOperator: v })}
                                    options={GA4_FILTER_OPERATORS.map((op) => ({ value: op.value, label: op.label }))}
                                    triggerClassName={styles.input}
                                    aria-label="フィルタ 演算子"
                                />
                                <p className={styles.helpText}>
                                    フィルタの条件。
                                </p>
                            </div>
                            <div>
                                <label className={styles.label}>フィルタ 式</label>
                                <input
                                    type="text"
                                    value={ga4Config.filterExpression}
                                    onChange={(e) => setGa4Config({ ...ga4Config, filterExpression: e.target.value })}
                                    className={styles.input}
                                />
                            </div>
                        </div>

                        <div className={styles.formSection}>
                            <h4 className={styles.formSubSectionTitle}>CVR設定 A *</h4>
                            <div className={styles.formGrid}>
                                <div>
                                    <label className={styles.label}>分母ディメンション</label>
                                    <CustomSelect
                                        value={ga4Config.cvrA.denominatorDimension}
                                        onChange={(v) => setGa4Config({
                                            ...ga4Config,
                                            cvrA: { ...ga4Config.cvrA, denominatorDimension: v }
                                        })}
                                        options={GA4_CVR_DIMENSIONS.map((d) => ({ value: d.value, label: d.label }))}
                                        triggerClassName={styles.input}
                                        placeholder="選択してください"
                                        aria-label="CVR A 分母ディメンション"
                                    />
                                </div>
                                <div>
                                    <label className={styles.label}>分母ラベル（カンマ区切り）</label>
                                    <input
                                        type="text"
                                        value={ga4Config.cvrA.denominatorLabels}
                                        onChange={(e) => setGa4Config({
                                            ...ga4Config,
                                            cvrA: { ...ga4Config.cvrA, denominatorLabels: e.target.value }
                                        })}
                                        className={styles.input}
                                    />
                                </div>
                                <div>
                                    <label className={styles.label}>分子ディメンション</label>
                                    <CustomSelect
                                        value={ga4Config.cvrA.numeratorDimension}
                                        onChange={(v) => setGa4Config({
                                            ...ga4Config,
                                            cvrA: { ...ga4Config.cvrA, numeratorDimension: v }
                                        })}
                                        options={GA4_CVR_DIMENSIONS.map((d) => ({ value: d.value, label: d.label }))}
                                        triggerClassName={styles.input}
                                        placeholder="選択してください"
                                        aria-label="CVR A 分子ディメンション"
                                    />
                                </div>
                                <div>
                                    <label className={styles.label}>分子ラベル（カンマ区切り）</label>
                                    <input
                                        type="text"
                                        value={ga4Config.cvrA.numeratorLabels}
                                        onChange={(e) => setGa4Config({
                                            ...ga4Config,
                                            cvrA: { ...ga4Config.cvrA, numeratorLabels: e.target.value }
                                        })}
                                        className={styles.input}
                                    />
                                </div>
                                <div>
                                    <label className={styles.label}>計算メトリクス</label>
                                    <CustomSelect
                                        value={ga4Config.cvrA.metric}
                                        onChange={(v) => setGa4Config({
                                            ...ga4Config,
                                            cvrA: { ...ga4Config.cvrA, metric: v }
                                        })}
                                        options={GA4_METRICS.map((m) => ({ value: m.value, label: m.label }))}
                                        triggerClassName={styles.input}
                                        aria-label="CVR A 計算メトリクス"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className={styles.formSection}>
                            <h4 className={styles.formSubSectionTitle}>CVR設定 B *</h4>
                            <div className={styles.formGrid}>
                                <div>
                                    <label className={styles.label}>分母ディメンション</label>
                                    <CustomSelect
                                        value={ga4Config.cvrB.denominatorDimension}
                                        onChange={(v) => setGa4Config({
                                            ...ga4Config,
                                            cvrB: { ...ga4Config.cvrB, denominatorDimension: v }
                                        })}
                                        options={GA4_CVR_DIMENSIONS.map((d) => ({ value: d.value, label: d.label }))}
                                        triggerClassName={styles.input}
                                        placeholder="選択してください"
                                        aria-label="CVR B 分母ディメンション"
                                    />
                                </div>
                                <div>
                                    <label className={styles.label}>分母ラベル（カンマ区切り）</label>
                                    <input
                                        type="text"
                                        value={ga4Config.cvrB.denominatorLabels}
                                        onChange={(e) => setGa4Config({
                                            ...ga4Config,
                                            cvrB: { ...ga4Config.cvrB, denominatorLabels: e.target.value }
                                        })}
                                        className={styles.input}
                                    />
                                </div>
                                <div>
                                    <label className={styles.label}>分子ディメンション</label>
                                    <CustomSelect
                                        value={ga4Config.cvrB.numeratorDimension}
                                        onChange={(v) => setGa4Config({
                                            ...ga4Config,
                                            cvrB: { ...ga4Config.cvrB, numeratorDimension: v }
                                        })}
                                        options={GA4_CVR_DIMENSIONS.map((d) => ({ value: d.value, label: d.label }))}
                                        triggerClassName={styles.input}
                                        placeholder="選択してください"
                                        aria-label="CVR B 分子ディメンション"
                                    />
                                </div>
                                <div>
                                    <label className={styles.label}>分子ラベル（カンマ区切り）</label>
                                    <input
                                        type="text"
                                        value={ga4Config.cvrB.numeratorLabels}
                                        onChange={(e) => setGa4Config({
                                            ...ga4Config,
                                            cvrB: { ...ga4Config.cvrB, numeratorLabels: e.target.value }
                                        })}
                                        className={styles.input}
                                    />
                                </div>
                                <div>
                                    <label className={styles.label}>計算メトリクス</label>
                                    <CustomSelect
                                        value={ga4Config.cvrB.metric}
                                        onChange={(v) => setGa4Config({
                                            ...ga4Config,
                                            cvrB: { ...ga4Config.cvrB, metric: v }
                                        })}
                                        options={GA4_METRICS.map((m) => ({ value: m.value, label: m.label }))}
                                        triggerClassName={styles.input}
                                        aria-label="CVR B 計算メトリクス"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className={styles.formSection}>
                            <div className={styles.formSectionHeader}>
                                <h4 className={styles.formSubSectionTitle}>CVR設定 C（オプション）</h4>
                                <Switch
                                    checked={showCvrC}
                                    onChange={setShowCvrC}
                                    aria-label="CVR設定 C の表示切替"
                                />
                            </div>
                            {showCvrC && (
                                <div className={styles.formGrid}>
                                    <div>
                                        <label className={styles.label}>分母ディメンション</label>
                                        <CustomSelect
                                            value={ga4Config.cvrC.denominatorDimension}
                                            onChange={(v) => setGa4Config({
                                                ...ga4Config,
                                                cvrC: { ...ga4Config.cvrC, denominatorDimension: v }
                                            })}
                                            options={GA4_CVR_DIMENSIONS.map((d) => ({ value: d.value, label: d.label }))}
                                            triggerClassName={styles.input}
                                            placeholder="選択してください"
                                            aria-label="CVR C 分母ディメンション"
                                        />
                                    </div>
                                    <div>
                                        <label className={styles.label}>分母ラベル（カンマ区切り）</label>
                                        <input
                                            type="text"
                                            value={ga4Config.cvrC.denominatorLabels}
                                            onChange={(e) => setGa4Config({
                                                ...ga4Config,
                                                cvrC: { ...ga4Config.cvrC, denominatorLabels: e.target.value }
                                            })}
                                            className={styles.input}
                                        />
                                    </div>
                                    <div>
                                        <label className={styles.label}>分子ディメンション</label>
                                        <CustomSelect
                                            value={ga4Config.cvrC.numeratorDimension}
                                            onChange={(v) => setGa4Config({
                                                ...ga4Config,
                                                cvrC: { ...ga4Config.cvrC, numeratorDimension: v }
                                            })}
                                            options={GA4_CVR_DIMENSIONS.map((d) => ({ value: d.value, label: d.label }))}
                                            triggerClassName={styles.input}
                                            placeholder="選択してください"
                                            aria-label="CVR C 分子ディメンション"
                                        />
                                    </div>
                                    <div>
                                        <label className={styles.label}>分子ラベル（カンマ区切り）</label>
                                        <input
                                            type="text"
                                            value={ga4Config.cvrC.numeratorLabels}
                                            onChange={(e) => setGa4Config({
                                                ...ga4Config,
                                                cvrC: { ...ga4Config.cvrC, numeratorLabels: e.target.value }
                                            })}
                                            className={styles.input}
                                        />
                                    </div>
                                    <div>
                                        <label className={styles.label}>計算メトリクス</label>
                                        <CustomSelect
                                            value={ga4Config.cvrC.metric}
                                            onChange={(v) => setGa4Config({
                                                ...ga4Config,
                                                cvrC: { ...ga4Config.cvrC, metric: v }
                                            })}
                                            options={GA4_METRICS.map((m) => ({ value: m.value, label: m.label }))}
                                            triggerClassName={styles.input}
                                            aria-label="CVR C 計算メトリクス"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className={styles.formSection}>
                            <div className={styles.formSectionHeader}>
                                <h4 className={styles.formSubSectionTitle}>CVR設定 D（オプション）</h4>
                                <Switch
                                    checked={showCvrD}
                                    onChange={setShowCvrD}
                                    aria-label="CVR設定 D の表示切替"
                                />
                            </div>
                            {showCvrD && (
                                <div className={styles.formGrid}>
                                    <div>
                                        <label className={styles.label}>分母ディメンション</label>
                                        <CustomSelect
                                            value={ga4Config.cvrD.denominatorDimension}
                                            onChange={(v) => setGa4Config({
                                                ...ga4Config,
                                                cvrD: { ...ga4Config.cvrD, denominatorDimension: v }
                                            })}
                                            options={GA4_CVR_DIMENSIONS.map((d) => ({ value: d.value, label: d.label }))}
                                            triggerClassName={styles.input}
                                            placeholder="選択してください"
                                            aria-label="CVR D 分母ディメンション"
                                        />
                                    </div>
                                    <div>
                                        <label className={styles.label}>分母ラベル（カンマ区切り）</label>
                                        <input
                                            type="text"
                                            value={ga4Config.cvrD.denominatorLabels}
                                            onChange={(e) => setGa4Config({
                                                ...ga4Config,
                                                cvrD: { ...ga4Config.cvrD, denominatorLabels: e.target.value }
                                            })}
                                            className={styles.input}
                                        />
                                    </div>
                                    <div>
                                        <label className={styles.label}>分子ディメンション</label>
                                        <CustomSelect
                                            value={ga4Config.cvrD.numeratorDimension}
                                            onChange={(v) => setGa4Config({
                                                ...ga4Config,
                                                cvrD: { ...ga4Config.cvrD, numeratorDimension: v }
                                            })}
                                            options={GA4_CVR_DIMENSIONS.map((d) => ({ value: d.value, label: d.label }))}
                                            triggerClassName={styles.input}
                                            placeholder="選択してください"
                                            aria-label="CVR D 分子ディメンション"
                                        />
                                    </div>
                                    <div>
                                        <label className={styles.label}>分子ラベル（カンマ区切り）</label>
                                        <input
                                            type="text"
                                            value={ga4Config.cvrD.numeratorLabels}
                                            onChange={(e) => setGa4Config({
                                                ...ga4Config,
                                                cvrD: { ...ga4Config.cvrD, numeratorLabels: e.target.value }
                                            })}
                                            className={styles.input}
                                        />
                                    </div>
                                    <div>
                                        <label className={styles.label}>計算メトリクス</label>
                                        <CustomSelect
                                            value={ga4Config.cvrD.metric}
                                            onChange={(v) => setGa4Config({
                                                ...ga4Config,
                                                cvrD: { ...ga4Config.cvrD, metric: v }
                                            })}
                                            options={GA4_METRICS.map((m) => ({ value: m.value, label: m.label }))}
                                            triggerClassName={styles.input}
                                            aria-label="CVR D 計算メトリクス"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className={styles.formSection}>
                            <div className={styles.formSectionHeader}>
                                <h4 className={styles.formSubSectionTitle}>途中経過ファネル（オプション）</h4>
                                <button
                                    type="button"
                                    className={styles.addStepButton}
                                    onClick={() => setFunnelSteps([...funnelSteps, emptyFunnelStep()])}
                                >
                                    + ステップ追加
                                </button>
                            </div>
                            <p className={styles.helpText}>
                                CVに至るまでのステップを上から順に定義すると、詳細画面でバリアント別のファネル・離脱率を比較できます。ラベルはカンマ区切りで複数指定可。バリアント共通のステップは同じラベルを入れてください。
                            </p>
                            {funnelSteps.map((step, i) => (
                                <div key={i} className={styles.funnelStepRow}>
                                    <span className={styles.funnelStepIndex}>{i + 1}.</span>
                                    <input
                                        type="text"
                                        placeholder="ステップ名（例: フォーム表示）"
                                        value={step.stepName}
                                        onChange={(e) => updateFunnelStep(i, { stepName: e.target.value })}
                                        className={styles.input}
                                        aria-label={`ステップ${i + 1} 名称`}
                                    />
                                    <CustomSelect
                                        value={step.dimension}
                                        onChange={(v) => updateFunnelStep(i, { dimension: v })}
                                        options={GA4_DIMENSIONS.map((d) => ({ value: d.value, label: d.label }))}
                                        triggerClassName={styles.input}
                                        aria-label={`ステップ${i + 1} ディメンション`}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Aのラベル"
                                        value={step.labelsA}
                                        onChange={(e) => updateFunnelStep(i, { labelsA: e.target.value })}
                                        className={styles.input}
                                        aria-label={`ステップ${i + 1} Aラベル`}
                                    />
                                    {showCvrB && (
                                        <input
                                            type="text"
                                            placeholder="Bのラベル"
                                            value={step.labelsB}
                                            onChange={(e) => updateFunnelStep(i, { labelsB: e.target.value })}
                                            className={styles.input}
                                            aria-label={`ステップ${i + 1} Bラベル`}
                                        />
                                    )}
                                    {showCvrC && (
                                        <input
                                            type="text"
                                            placeholder="Cのラベル"
                                            value={step.labelsC}
                                            onChange={(e) => updateFunnelStep(i, { labelsC: e.target.value })}
                                            className={styles.input}
                                            aria-label={`ステップ${i + 1} Cラベル`}
                                        />
                                    )}
                                    {showCvrD && (
                                        <input
                                            type="text"
                                            placeholder="Dのラベル"
                                            value={step.labelsD}
                                            onChange={(e) => updateFunnelStep(i, { labelsD: e.target.value })}
                                            className={styles.input}
                                            aria-label={`ステップ${i + 1} Dラベル`}
                                        />
                                    )}
                                    <button
                                        type="button"
                                        className={styles.removeStepButton}
                                        onClick={() => setFunnelSteps(funnelSteps.filter((_, idx) => idx !== i))}
                                        aria-label={`ステップ${i + 1}を削除`}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className={styles.formSection}>
                            <h4 className={styles.formSubSectionTitle}>ABテスト判定設定</h4>
                            <div className={styles.formGrid}>
                                <div>
                                    <label className={styles.label}>統計的有意差 (%)</label>
                                    <input
                                        type="number"
                                        value={ga4Config.abTestEvaluationConfig.minSignificance || ''}
                                        onChange={(e) => setGa4Config({
                                            ...ga4Config,
                                            abTestEvaluationConfig: {
                                                ...ga4Config.abTestEvaluationConfig,
                                                minSignificance: e.target.value ? parseFloat(e.target.value) : null,
                                            }
                                        })}
                                        className={styles.input}
                                    />
                                </div>
                                <div>
                                    <label className={styles.label}>最低PV数</label>
                                    <input
                                        type="number"
                                        value={ga4Config.abTestEvaluationConfig.minPV}
                                        onChange={(e) => setGa4Config({
                                            ...ga4Config,
                                            abTestEvaluationConfig: {
                                                ...ga4Config.abTestEvaluationConfig,
                                                minPV: parseInt(e.target.value, 10) || 0,
                                            }
                                        })}
                                        className={styles.input}
                                    />
                                </div>
                                <div>
                                    <label className={styles.label}>最低期間 (日)</label>
                                    <input
                                        type="number"
                                        value={ga4Config.abTestEvaluationConfig.minDays}
                                        onChange={(e) => setGa4Config({
                                            ...ga4Config,
                                            abTestEvaluationConfig: {
                                                ...ga4Config.abTestEvaluationConfig,
                                                minDays: parseInt(e.target.value, 10) || 0,
                                            }
                                        })}
                                        className={styles.input}
                                    />
                                </div>
                                <div>
                                    <label className={styles.label}>最低改善率 (%)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={ga4Config.abTestEvaluationConfig.minImprovementRate}
                                        onChange={(e) => setGa4Config({
                                            ...ga4Config,
                                            abTestEvaluationConfig: {
                                                ...ga4Config.abTestEvaluationConfig,
                                                minImprovementRate: parseFloat(e.target.value) || 0,
                                            }
                                        })}
                                        className={styles.input}
                                    />
                                </div>
                                <div>
                                    <label className={styles.label}>最低差分 (pt)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={ga4Config.abTestEvaluationConfig.minDifferencePt}
                                        onChange={(e) => setGa4Config({
                                            ...ga4Config,
                                            abTestEvaluationConfig: {
                                                ...ga4Config.abTestEvaluationConfig,
                                                minDifferencePt: parseFloat(e.target.value) || 0,
                                            }
                                        })}
                                        className={styles.input}
                                    />
                                </div>
                            </div>

                            <div className={styles.sampleSizeBox}>
                                <p className={styles.sampleSizeTitle}>必要サンプルサイズの目安</p>
                                <div className={styles.formGrid}>
                                    <div>
                                        <label className={styles.label}>ベースラインCVR (%)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            placeholder="例: 2.5"
                                            value={baselineCvr}
                                            onChange={(e) => setBaselineCvr(e.target.value)}
                                            className={styles.input}
                                        />
                                        <p className={styles.helpText}>現状（Aパターン）のCVR実績値</p>
                                    </div>
                                    <div>
                                        <label className={styles.label}>1日あたり想定PV / バリアント</label>
                                        <input
                                            type="number"
                                            min="0"
                                            placeholder="例: 500"
                                            value={dailyPv}
                                            onChange={(e) => setDailyPv(e.target.value)}
                                            className={styles.input}
                                        />
                                        <p className={styles.helpText}>入力すると必要日数も算出します</p>
                                    </div>
                                </div>
                                {requiredSampleSize != null ? (
                                    <p className={styles.sampleSizeResult}>
                                        必要PV: <strong>{requiredSampleSize.toLocaleString()}</strong> / バリアント
                                        {requiredDays != null && (
                                            <>　→　必要期間: <strong>約{requiredDays.toLocaleString()}日</strong></>
                                        )}
                                    </p>
                                ) : (
                                    <p className={styles.helpText}>
                                        ベースラインCVRと基本情報の「期待改善率」を入力すると自動計算します（有意水準95%・検出力80%）
                                    </p>
                                )}
                            </div>
                        </div>

                        <GeminiConfig
                            enabled={ga4Config.geminiConfig.enabled}
                            onEnabledChange={(enabled) => setGa4Config({
                                ...ga4Config,
                                geminiConfig: { ...ga4Config.geminiConfig, enabled }
                            })}
                        />
                    </div>

                    <div className={styles.formSection}>
                        <h3 className={styles.formSectionTitle}>スケジュール設定</h3>
                        <AbTestScheduleConfig
                            value={scheduleConfig}
                            onChange={setScheduleConfig}
                        />
                    </div>

                    {testResult && (
                        <div className={styles.testResult}>
                            <h4 className={styles.testResultTitle}>✅ テスト実行結果</h4>
                            {testResult.warning && (
                                <div className={styles.testWarning}>{testResult.warning}</div>
                            )}
                            <div className={styles.testResultContent}>
                                <p>取得データ行数: {testResult.rowCount || 0}</p>
                                {testResult.cvrResults && (
                                    <div className={styles.cvrResults}>
                                        {testResult.cvrResults.cvrA && (
                                            <div>
                                                <strong>バリアントA:</strong>{' '}
                                                {testResult.cvrResults.cvrA.error ? (
                                                    <span className={styles.error}>エラー: {testResult.cvrResults.cvrA.error}</span>
                                                ) : (
                                                    `PV: ${testResult.cvrResults.cvrA.pv}, CV: ${testResult.cvrResults.cvrA.cv}, CVR: ${(testResult.cvrResults.cvrA.cvr * 100).toFixed(2)}%`
                                                )}
                                            </div>
                                        )}
                                        {testResult.cvrResults.cvrB && (
                                            <div>
                                                <strong>バリアントB:</strong>{' '}
                                                {testResult.cvrResults.cvrB.error ? (
                                                    <span className={styles.error}>エラー: {testResult.cvrResults.cvrB.error}</span>
                                                ) : (
                                                    `PV: ${testResult.cvrResults.cvrB.pv}, CV: ${testResult.cvrResults.cvrB.cv}, CVR: ${(testResult.cvrResults.cvrB.cvr * 100).toFixed(2)}%`
                                                )}
                                            </div>
                                        )}
                                        {testResult.cvrResults.cvrC && (
                                            <div>
                                                <strong>バリアントC:</strong>{' '}
                                                {testResult.cvrResults.cvrC.error ? (
                                                    <span className={styles.error}>エラー: {testResult.cvrResults.cvrC.error}</span>
                                                ) : (
                                                    `PV: ${testResult.cvrResults.cvrC.pv}, CV: ${testResult.cvrResults.cvrC.cv}, CVR: ${(testResult.cvrResults.cvrC.cvr * 100).toFixed(2)}%`
                                                )}
                                            </div>
                                        )}
                                        {testResult.cvrResults.cvrD && (
                                            <div>
                                                <strong>バリアントD:</strong>{' '}
                                                {testResult.cvrResults.cvrD.error ? (
                                                    <span className={styles.error}>エラー: {testResult.cvrResults.cvrD.error}</span>
                                                ) : (
                                                    `PV: ${testResult.cvrResults.cvrD.pv}, CV: ${testResult.cvrResults.cvrD.cv}, CVR: ${(testResult.cvrResults.cvrD.cvr * 100).toFixed(2)}%`
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {testError && (
                        <div className={styles.testError}>
                            <strong>❌ エラー:</strong> {testError}
                        </div>
                    )}

                    <div className={styles.formActions}>
                        <button
                            type="button"
                            onClick={handleTestExecute}
                            disabled={testing}
                            className={styles.testButton}
                        >
                            {testing ? 'テスト実行中...' : 'テスト実行'}
                        </button>
                        <button type="button" onClick={onClose} className={styles.cancelButton}>
                            キャンセル
                        </button>
                        <button type="submit" className={styles.submitButton} disabled={submitting}>
                            {submitting ? (editingTest ? '更新中...' : '作成中...') : (editingTest ? '更新' : '作成')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
