'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import DateInput from '@/components/DateInput'
import AbTestScheduleConfig, { ScheduleConfig } from './AbTestScheduleConfig'
import CustomSelect from '@/components/CustomSelect'
import GeminiConfig from '@/components/GeminiConfig'
import LabelInput from '@/components/LabelInput'
import MultiLabelInput from '@/components/MultiLabelInput/MultiLabelInput'
import Switch from '@/components/Switch'
import { extractIssueNumber } from '@/lib/utils/issueUrl'
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

// 旧データはカンマ区切り文字列、新データは配列。どちらもtrim済み配列に正規化する
const splitLabels = (s: string | string[] | undefined) =>
    (Array.isArray(s) ? s : (s ?? '').split(',')).map((l) => l.trim()).filter(Boolean)

// 保存済み設定（string | string[]）をMultiLabelInput用の配列に変換
const toLabelArray = (v: unknown): string[] =>
    Array.isArray(v) ? v : typeof v === 'string' && v ? v.split(',').map((l) => l.trim()) : []

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
        issueUrl: '',
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
        excludeFilterDimension: '',
        excludeFilterOperator: 'CONTAINS',
        excludeFilterExpression: '',
        limit: 25000,
        cvrA: {
            denominatorDimension: '',
            denominatorLabels: [] as string[],
            numeratorDimension: '',
            numeratorLabels: [] as string[],
            metric: 'totalUsers',
        },
        cvrB: {
            denominatorDimension: '',
            denominatorLabels: [] as string[],
            numeratorDimension: '',
            numeratorLabels: [] as string[],
            metric: 'totalUsers',
        },
        cvrC: {
            denominatorDimension: '',
            denominatorLabels: [] as string[],
            numeratorDimension: '',
            numeratorLabels: [] as string[],
            metric: 'totalUsers',
        },
        cvrD: {
            denominatorDimension: '',
            denominatorLabels: [] as string[],
            numeratorDimension: '',
            numeratorLabels: [] as string[],
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
    // SEO監視対象パス（カンマ区切りの正規表現）。ga4Config.seoWatchPaths に string[] で保存
    const [seoWatchPaths, setSeoWatchPaths] = useState('')

    // 新規追加時、背景クリックなどで誤って閉じてもドラフトを保持するための制御。
    // wasEditing: 直前が編集モードだったか（編集→新規追加の切替時だけ空にする）
    // hasDraft: 新規フォームを一度でも初期化済みか（未初期化の初回だけ空にする）
    const wasEditingRef = useRef(false)
    const hasDraftRef = useRef(false)

    // 新規追加フォームを初期状態に戻す。誤クローズ後の再オープンでは呼ばず、ドラフトを残す
    const resetForm = useCallback(() => {
        const initialProductId = currentProductId?.toString() || (products.length === 1 ? products[0].id.toString() : '')
        setFormData({
            productId: initialProductId,
            name: '',
            description: '',
            hypothesis: '',
            issueUrl: '',
            expectedImprovement: '',
            startDate: '',
            endDate: '',
            status: 'running',
            autoExecute: true,
        })
        setShowCvrB(true)
        setShowCvrC(false)
        setShowCvrD(false)
        setFunnelSteps([])
        setSeoWatchPaths('')
        setBaselineCvr('')
        setDailyPv('')
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
            excludeFilterDimension: '',
            excludeFilterOperator: 'CONTAINS',
            excludeFilterExpression: '',
            limit: 25000,
            cvrA: { denominatorDimension: '', denominatorLabels: [], numeratorDimension: '', numeratorLabels: [], metric: 'totalUsers' },
            cvrB: { denominatorDimension: '', denominatorLabels: [], numeratorDimension: '', numeratorLabels: [], metric: 'totalUsers' },
            cvrC: { denominatorDimension: '', denominatorLabels: [], numeratorDimension: '', numeratorLabels: [], metric: 'totalUsers' },
            cvrD: { denominatorDimension: '', denominatorLabels: [], numeratorDimension: '', numeratorLabels: [], metric: 'totalUsers' },
            abTestEvaluationConfig: { minSignificance: null, minPV: 1000, minDays: 14, minImprovementRate: 5, minDifferencePt: 0.5 },
            geminiConfig: { enabled: false },
        })
        if (initialProductId) {
            const initialProduct = products.find((p) => p.id.toString() === initialProductId)
            if (initialProduct?.ga4PropertyId) {
                setGa4Config((prev) => ({ ...prev, propertyId: initialProduct.ga4PropertyId || prev.propertyId }))
            }
        }
    }, [currentProductId, products])

    const updateFunnelStep = (index: number, patch: Partial<FunnelStepForm>) => {
        setFunnelSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
    }

    // GTMタグ規則: バリアントB/C/DのラベルはAのラベル + __{variant}-{issue番号}。
    // Backlog Issueが入力されていれば、候補の優先表示とAからの自動生成に使う
    const issueNum = extractIssueNumber(formData.issueUrl)
    const variantSuffix = (v: 'B' | 'C' | 'D') => (issueNum ? `__${v}-${issueNum}` : undefined)
    // そのバリアントに入力済みのラベルへサフィックスを付ける（付与済みのものはスキップ）
    const appendSuffix = (v: 'B' | 'C' | 'D') => {
        const suffix = variantSuffix(v)
        if (!suffix) return
        const add = (labels: string[]) =>
            labels.map((l) => (l.trim() && !/__[A-D]-\w+$/.test(l.trim()) ? `${l.trim()}${suffix}` : l))
        setGa4Config((prev) => ({
            ...prev,
            [`cvr${v}`]: {
                ...prev[`cvr${v}`],
                denominatorLabels: add(prev[`cvr${v}`].denominatorLabels),
                numeratorLabels: add(prev[`cvr${v}`].numeratorLabels),
            },
        }))
    }

    const generateFromA = (v: 'B' | 'C' | 'D', withSuffix: boolean) => {
        const suffix = withSuffix ? variantSuffix(v) : ''
        if (suffix === undefined) return
        setGa4Config((prev) => ({
            ...prev,
            [`cvr${v}`]: {
                ...prev[`cvr${v}`],
                denominatorDimension: prev[`cvr${v}`].denominatorDimension || prev.cvrA.denominatorDimension,
                numeratorDimension: prev[`cvr${v}`].numeratorDimension || prev.cvrA.numeratorDimension,
                denominatorLabels: prev.cvrA.denominatorLabels.filter(Boolean).map((l) => `${l.trim()}${suffix}`),
                numeratorLabels: prev.cvrA.numeratorLabels.filter(Boolean).map((l) => `${l.trim()}${suffix}`),
            },
        }))
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
                        denominatorLabels: [] as string[],
                        numeratorDimension: '',
                        numeratorLabels: [] as string[],
                        metric: 'totalUsers',
                    },
                    cvrD: prev.cvrD || {
                        denominatorDimension: '',
                        denominatorLabels: [] as string[],
                        numeratorDimension: '',
                        numeratorLabels: [] as string[],
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
                issueUrl: editingTest.issueUrl || '',
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
                    excludeFilterDimension: config.excludeFilter?.dimension || '',
                    excludeFilterOperator: config.excludeFilter?.operator || 'CONTAINS',
                    excludeFilterExpression: config.excludeFilter?.expression || '',
                    limit: config.limit || 25000,
                    cvrA: {
                        denominatorDimension: config.cvrA?.denominatorDimension || '',
                        denominatorLabels: toLabelArray(config.cvrA?.denominatorLabels),
                        numeratorDimension: config.cvrA?.numeratorDimension || '',
                        numeratorLabels: toLabelArray(config.cvrA?.numeratorLabels),
                        metric: config.cvrA?.metric || 'totalUsers',
                    },
                    cvrB: {
                        denominatorDimension: config.cvrB?.denominatorDimension || '',
                        denominatorLabels: toLabelArray(config.cvrB?.denominatorLabels),
                        numeratorDimension: config.cvrB?.numeratorDimension || '',
                        numeratorLabels: toLabelArray(config.cvrB?.numeratorLabels),
                        metric: config.cvrB?.metric || 'totalUsers',
                    },
                    cvrC: {
                        denominatorDimension: config.cvrC?.denominatorDimension || '',
                        denominatorLabels: toLabelArray(config.cvrC?.denominatorLabels),
                        numeratorDimension: config.cvrC?.numeratorDimension || '',
                        numeratorLabels: toLabelArray(config.cvrC?.numeratorLabels),
                        metric: config.cvrC?.metric || 'totalUsers',
                    },
                    cvrD: {
                        denominatorDimension: config.cvrD?.denominatorDimension || '',
                        denominatorLabels: toLabelArray(config.cvrD?.denominatorLabels),
                        numeratorDimension: config.cvrD?.numeratorDimension || '',
                        numeratorLabels: toLabelArray(config.cvrD?.numeratorLabels),
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
                setSeoWatchPaths(((config.seoWatchPaths as string[]) ?? []).join(', '))
            } else {
                setFunnelSteps([])
                setSeoWatchPaths('')
            }

            if (editingTest.scheduleConfig) {
                setScheduleConfig(editingTest.scheduleConfig as unknown as ScheduleConfig)
            } else {
                setScheduleConfig({
                    enabled: true,
                    executionType: 'on_end',
                })
            }
            wasEditingRef.current = true
            hasDraftRef.current = false
        } else {
            // 新規追加。誤クローズ後の再オープンでは入力を残す。
            // 直前が編集モードだった（編集→新規追加）、または未初期化の初回のときだけ空フォームにする。
            if (wasEditingRef.current || !hasDraftRef.current) {
                resetForm()
            }
            wasEditingRef.current = false
            hasDraftRef.current = true
        }
    }, [editingTest?.id, currentProductId, isOpen, products, resetForm])

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
                    numeratorLabels: splitLabels(ga4Config.cvrA.numeratorLabels),
                    denominatorLabels: splitLabels(ga4Config.cvrA.denominatorLabels),
                },
                cvrB: {
                    metric: ga4Config.cvrB.metric,
                    numeratorDimension: ga4Config.cvrB.numeratorDimension,
                    denominatorDimension: ga4Config.cvrB.denominatorDimension,
                    numeratorLabels: splitLabels(ga4Config.cvrB.numeratorLabels),
                    denominatorLabels: splitLabels(ga4Config.cvrB.denominatorLabels),
                },
            }

            if (showCvrC && ga4Config.cvrC && ga4Config.cvrC.denominatorDimension) {
                apiGa4Config.cvrC = {
                    metric: ga4Config.cvrC.metric,
                    numeratorDimension: ga4Config.cvrC.numeratorDimension,
                    denominatorDimension: ga4Config.cvrC.denominatorDimension,
                    numeratorLabels: splitLabels(ga4Config.cvrC.numeratorLabels),
                    denominatorLabels: splitLabels(ga4Config.cvrC.denominatorLabels),
                }
            }

            if (showCvrD && ga4Config.cvrD && ga4Config.cvrD.denominatorDimension) {
                apiGa4Config.cvrD = {
                    metric: ga4Config.cvrD.metric,
                    numeratorDimension: ga4Config.cvrD.numeratorDimension,
                    denominatorDimension: ga4Config.cvrD.denominatorDimension,
                    numeratorLabels: splitLabels(ga4Config.cvrD.numeratorLabels),
                    denominatorLabels: splitLabels(ga4Config.cvrD.denominatorLabels),
                }
            }

            if (ga4Config.filterDimension && ga4Config.filterOperator && ga4Config.filterExpression) {
                apiGa4Config.filter = {
                    dimension: ga4Config.filterDimension,
                    operator: ga4Config.filterOperator,
                    expression: ga4Config.filterExpression,
                }
            }

            if (ga4Config.excludeFilterDimension && ga4Config.excludeFilterOperator && ga4Config.excludeFilterExpression) {
                apiGa4Config.excludeFilter = {
                    dimension: ga4Config.excludeFilterDimension,
                    operator: ga4Config.excludeFilterOperator,
                    expression: ga4Config.excludeFilterExpression,
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
            excludeFilter: ga4Config.excludeFilterDimension && ga4Config.excludeFilterExpression ? {
                dimension: ga4Config.excludeFilterDimension,
                operator: ga4Config.excludeFilterOperator,
                expression: ga4Config.excludeFilterExpression,
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
            seoWatchPaths: (() => {
                const paths = seoWatchPaths.split(',').map((s) => s.trim()).filter(Boolean)
                return paths.length > 0 ? paths : undefined
            })(),
        }

            await onSubmit({
                ...formData,
                expectedImprovement: formData.expectedImprovement === '' ? null : Number(formData.expectedImprovement),
                ga4Config: ga4ConfigData,
                scheduleConfig: scheduleConfig.enabled ? scheduleConfig : null,
            })
            // 保存成功時のみドラフトを破棄（次回の新規追加は空フォームから）。
            // エラー時はここに到達せず、入力を保持したまま再挑戦できる
            hasDraftRef.current = false
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
                                <label className={styles.label}>Backlog Issue</label>
                                <input
                                    type="text"
                                    value={formData.issueUrl}
                                    onChange={(e) => setFormData({ ...formData, issueUrl: e.target.value })}
                                    className={styles.input}
                                    placeholder="例: 1804 / XWORK_PRODUCT-1804 / https://xmile.backlog.com/view/..."
                                />
                                <p className={styles.helpText}>番号・課題キー・URLのいずれでもOK。一覧と詳細ページにリンクを表示します。</p>
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
                            <div>
                                <label className={styles.label}>除外フィルタ ディメンション</label>
                                <CustomSelect
                                    value={ga4Config.excludeFilterDimension}
                                    onChange={(v) => setGa4Config({ ...ga4Config, excludeFilterDimension: v })}
                                    options={GA4_FILTER_DIMENSIONS.map((d) => ({ value: d.value, label: d.label }))}
                                    triggerClassName={styles.input}
                                    placeholder="選択してください"
                                    aria-label="除外フィルタ ディメンション"
                                />
                                <p className={styles.helpText}>
                                    条件に一致するイベントを集計から除外します。例: LP経由を除くなら「閲覧したページのURL」。
                                </p>
                            </div>
                            <div>
                                <label className={styles.label}>除外フィルタ 演算子</label>
                                <CustomSelect
                                    value={ga4Config.excludeFilterOperator}
                                    onChange={(v) => setGa4Config({ ...ga4Config, excludeFilterOperator: v })}
                                    options={GA4_FILTER_OPERATORS.map((op) => ({ value: op.value, label: op.label }))}
                                    triggerClassName={styles.input}
                                    aria-label="除外フィルタ 演算子"
                                />
                            </div>
                            <div>
                                <label className={styles.label}>除外フィルタ 式</label>
                                <input
                                    type="text"
                                    value={ga4Config.excludeFilterExpression}
                                    onChange={(e) => setGa4Config({ ...ga4Config, excludeFilterExpression: e.target.value })}
                                    className={styles.input}
                                    placeholder="userId="
                                />
                                <p className={styles.helpText}>
                                    カンマ区切りで複数指定すると、いずれかに一致するものをすべて除外します。
                                </p>
                            </div>
                            <div>
                                <label className={styles.label}>SEO監視対象パス（任意・正規表現）</label>
                                <input
                                    type="text"
                                    value={seoWatchPaths}
                                    onChange={(e) => setSeoWatchPaths(e.target.value)}
                                    className={styles.input}
                                    placeholder="/(driver|sekokan)/media_.*, /search"
                                />
                                <p className={styles.helpText}>
                                    テスト対象ページのパス（カンマ区切り・正規表現可）。指定するとテスト期間中、Search Consoleで対象ページの順位・クリックを毎日監視し、
                                    非対象ページと比べて悪化した場合にSlack通知します（毎週月曜は異常なしでもサマリー配信）。
                                </p>
                            </div>
                        </div>

                        <div className={styles.formSection}>
                            <h4 className={styles.formSubSectionTitle}>CVR設定 A *</h4>
                            <div className={styles.cvrGrid}>
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
                                    <label className={styles.label}>分母ラベル</label>
                                    <MultiLabelInput
                                        values={ga4Config.cvrA.denominatorLabels}
                                        onChange={(vals) => setGa4Config({
                                            ...ga4Config,
                                            cvrA: { ...ga4Config.cvrA, denominatorLabels: vals }
                                        })}
                                        inputClassName={styles.input}
                                        aria-label="CVR A 分母ラベル"
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
                                    <label className={styles.label}>分子ラベル</label>
                                    <MultiLabelInput
                                        values={ga4Config.cvrA.numeratorLabels}
                                        onChange={(vals) => setGa4Config({
                                            ...ga4Config,
                                            cvrA: { ...ga4Config.cvrA, numeratorLabels: vals }
                                        })}
                                        inputClassName={styles.input}
                                        aria-label="CVR A 分子ラベル"
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
                            <div className={styles.formSectionHeader}>
                                <h4 className={styles.formSubSectionTitle}>CVR設定 B *</h4>
                                <div className={styles.generateBtnGroup}>
                                    <button type="button" className={styles.generateBtn} onClick={() => generateFromA('B', false)}>
                                        Aのラベルをコピー
                                    </button>
                                    {issueNum && (
                                        <button type="button" className={styles.generateBtn} onClick={() => appendSuffix('B')}>
                                            __B-{issueNum} を付ける
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className={styles.cvrGrid}>
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
                                    <label className={styles.label}>分母ラベル</label>
                                    <MultiLabelInput
                                        values={ga4Config.cvrB.denominatorLabels}
                                        onChange={(vals) => setGa4Config({
                                            ...ga4Config,
                                            cvrB: { ...ga4Config.cvrB, denominatorLabels: vals }
                                        })}
                                        inputClassName={styles.input}
                                        prioritySubstring={variantSuffix('B')}
                                        synthesizeSuffix={variantSuffix('B')}
                                        aria-label="CVR B 分母ラベル"
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
                                    <label className={styles.label}>分子ラベル</label>
                                    <MultiLabelInput
                                        values={ga4Config.cvrB.numeratorLabels}
                                        onChange={(vals) => setGa4Config({
                                            ...ga4Config,
                                            cvrB: { ...ga4Config.cvrB, numeratorLabels: vals }
                                        })}
                                        inputClassName={styles.input}
                                        prioritySubstring={variantSuffix('B')}
                                        synthesizeSuffix={variantSuffix('B')}
                                        aria-label="CVR B 分子ラベル"
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
                                {showCvrC && (
                                    <div className={styles.generateBtnGroup}>
                                        <button type="button" className={styles.generateBtn} onClick={() => generateFromA('C', false)}>
                                            Aのラベルをコピー
                                        </button>
                                        {issueNum && (
                                            <button type="button" className={styles.generateBtn} onClick={() => appendSuffix('C')}>
                                                __C-{issueNum} を付ける
                                            </button>
                                        )}
                                    </div>
                                )}
                                <Switch
                                    checked={showCvrC}
                                    onChange={setShowCvrC}
                                    aria-label="CVR設定 C の表示切替"
                                />
                            </div>
                            {showCvrC && (
                                <div className={styles.cvrGrid}>
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
                                        <label className={styles.label}>分母ラベル</label>
                                    <MultiLabelInput
                                        values={ga4Config.cvrC.denominatorLabels}
                                        onChange={(vals) => setGa4Config({
                                            ...ga4Config,
                                            cvrC: { ...ga4Config.cvrC, denominatorLabels: vals }
                                        })}
                                        inputClassName={styles.input}
                                        prioritySubstring={variantSuffix('C')}
                                        synthesizeSuffix={variantSuffix('C')}
                                        aria-label="CVR C 分母ラベル"
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
                                        <label className={styles.label}>分子ラベル</label>
                                    <MultiLabelInput
                                        values={ga4Config.cvrC.numeratorLabels}
                                        onChange={(vals) => setGa4Config({
                                            ...ga4Config,
                                            cvrC: { ...ga4Config.cvrC, numeratorLabels: vals }
                                        })}
                                        inputClassName={styles.input}
                                        prioritySubstring={variantSuffix('C')}
                                        synthesizeSuffix={variantSuffix('C')}
                                        aria-label="CVR C 分子ラベル"
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
                                {showCvrD && (
                                    <div className={styles.generateBtnGroup}>
                                        <button type="button" className={styles.generateBtn} onClick={() => generateFromA('D', false)}>
                                            Aのラベルをコピー
                                        </button>
                                        {issueNum && (
                                            <button type="button" className={styles.generateBtn} onClick={() => appendSuffix('D')}>
                                                __D-{issueNum} を付ける
                                            </button>
                                        )}
                                    </div>
                                )}
                                <Switch
                                    checked={showCvrD}
                                    onChange={setShowCvrD}
                                    aria-label="CVR設定 D の表示切替"
                                />
                            </div>
                            {showCvrD && (
                                <div className={styles.cvrGrid}>
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
                                        <label className={styles.label}>分母ラベル</label>
                                    <MultiLabelInput
                                        values={ga4Config.cvrD.denominatorLabels}
                                        onChange={(vals) => setGa4Config({
                                            ...ga4Config,
                                            cvrD: { ...ga4Config.cvrD, denominatorLabels: vals }
                                        })}
                                        inputClassName={styles.input}
                                        prioritySubstring={variantSuffix('D')}
                                        synthesizeSuffix={variantSuffix('D')}
                                        aria-label="CVR D 分母ラベル"
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
                                        <label className={styles.label}>分子ラベル</label>
                                    <MultiLabelInput
                                        values={ga4Config.cvrD.numeratorLabels}
                                        onChange={(vals) => setGa4Config({
                                            ...ga4Config,
                                            cvrD: { ...ga4Config.cvrD, numeratorLabels: vals }
                                        })}
                                        inputClassName={styles.input}
                                        prioritySubstring={variantSuffix('D')}
                                        synthesizeSuffix={variantSuffix('D')}
                                        aria-label="CVR D 分子ラベル"
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
                            <p className={styles.helpText}>
                                ※ CVRラベルにバリアントサフィックス（例: __B-1741）が付いているテストは<strong>未設定のままが推奨</strong>です。
                                GA4の実ラベルからステップを自動検出し、クリック基準切り替え・ステップ削減テスト対応も効きます。
                                ここに手動で設定すると自動検出を上書きし、ビュー基準固定になります。
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
                                    <LabelInput
                                        placeholder="Aのラベル"
                                        value={step.labelsA}
                                        onChange={(val) => updateFunnelStep(i, { labelsA: val })}
                                        className={styles.input}
                                    />
                                    {showCvrB && (
                                        <LabelInput
                                            placeholder="Bのラベル"
                                            value={step.labelsB}
                                            onChange={(val) => updateFunnelStep(i, { labelsB: val })}
                                            className={styles.input}
                                        />
                                    )}
                                    {showCvrC && (
                                        <LabelInput
                                            placeholder="Cのラベル"
                                            value={step.labelsC}
                                            onChange={(val) => updateFunnelStep(i, { labelsC: val })}
                                            className={styles.input}
                                        />
                                    )}
                                    {showCvrD && (
                                        <LabelInput
                                            placeholder="Dのラベル"
                                            value={step.labelsD}
                                            onChange={(val) => updateFunnelStep(i, { labelsD: val })}
                                            className={styles.input}
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
                                        {(['A', 'B', 'C', 'D'] as const).map((key) => {
                                            const r = testResult.cvrResults[`cvr${key}`]
                                            if (!r) return null
                                            const breakdown: Array<{ kind: string; label: string; value: number; total: number }> = []
                                            if ((r.pvByLabel?.length ?? 0) > 1) {
                                                for (const l of r.pvByLabel) breakdown.push({ kind: 'PV', label: l.label, value: l.value, total: r.pv })
                                            }
                                            if ((r.cvByLabel?.length ?? 0) > 1) {
                                                for (const l of r.cvByLabel) breakdown.push({ kind: 'CV', label: l.label, value: l.value, total: r.cv })
                                            }
                                            return (
                                                <div key={key}>
                                                    <strong>バリアント{key}:</strong>{' '}
                                                    {r.error ? (
                                                        <span className={styles.error}>エラー: {r.error}</span>
                                                    ) : (
                                                        `PV: ${r.pv}, CV: ${r.cv}, CVR: ${(r.cvr * 100).toFixed(2)}%`
                                                    )}
                                                    {breakdown.length > 0 && (
                                                        <ul className={styles.labelBreakdownList}>
                                                            {breakdown.map((b) => (
                                                                <li key={`${b.kind}-${b.label}`}>
                                                                    {b.kind} <code>{b.label}</code>: {b.value.toLocaleString()}
                                                                    {b.total > 0 && `（${((b.value / b.total) * 100).toFixed(1)}%）`}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </div>
                                            )
                                        })}
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
