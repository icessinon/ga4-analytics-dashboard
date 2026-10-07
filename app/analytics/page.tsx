'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from '@/components/Link'
import PageShell from '@/components/PageShell'
import FilterBar, { FilterField } from '@/components/FilterBar'
import DateInput from '@/components/DateInput'
import Alert from '@/components/Alert'
import GeminiConfig from '@/components/GeminiConfig'
import Switch from '@/components/Switch'
import LabelInput from '@/components/LabelInput'
import { ui, cx } from '@/components/ui'
import { useProduct } from '@/contexts/ProductContext'
import { GA4_CVR_DIMENSIONS, GA4_FILTER_DIMENSIONS, GA4_FILTER_OPERATORS, GA4_METRICS } from '@/lib/constants/ga4Dimensions'
import { fetchJson } from '@/lib/utils/fetch'
import { fmtYmd } from '@/lib/utils/period'
import type { CvrFormConfig, ReportConfig, ReportResult } from './types'
import styles from './AnalyticsPage.module.css'

const EMPTY_CVR: CvrFormConfig = { denominatorDimension: '', denominatorLabels: '', numeratorDimension: '', numeratorLabels: '', metric: '' }
const DEFAULT_CVR: CvrFormConfig = {
    denominatorDimension: 'customEvent:view_label',
    denominatorLabels: '',
    numeratorDimension: 'customEvent:click_label',
    numeratorLabels: '',
    metric: 'totalUsers',
}

function defaultConfig(): ReportConfig {
    const today = new Date()
    return {
        reportName: '',
        propertyId: '',
        startDate: fmtYmd(new Date(today.getFullYear(), today.getMonth(), 1)),
        endDate: fmtYmd(today),
        metrics: 'eventCount,totalUsers',
        dimensions: 'customEvent:click_label,customEvent:view_label',
        filterDimension: 'pagePath',
        filterOperator: 'CONTAINS',
        filterExpression: '',
        orderBy: '',
        limit: 25000,
        cvrA: { ...DEFAULT_CVR },
        cvrB: { ...DEFAULT_CVR },
        cvrC: { ...EMPTY_CVR },
        cvrD: { ...EMPTY_CVR },
        showCvrC: false,
        showCvrD: false,
        abTestStartDate: '2026-01-15',
        abTestEndDate: '2026-01-21',
        abTestEvaluationConfig: { minSignificance: 80, minPV: 3000, minDays: 14, minImprovementRate: 10, minDifferencePt: 0.5 },
        geminiConfig: { enabled: false },
    }
}

/** 保存済み config の labels は配列、画面はカンマ区切り文字列 */
function toFormCvr(cvr: unknown): CvrFormConfig | null {
    if (!cvr || typeof cvr !== 'object') return null
    const c = cvr as Record<string, unknown>
    const labels = (v: unknown) => (Array.isArray(v) ? v.join(',') : typeof v === 'string' ? v : '')
    return {
        denominatorDimension: String(c.denominatorDimension ?? ''),
        denominatorLabels: labels(c.denominatorLabels),
        numeratorDimension: String(c.numeratorDimension ?? ''),
        numeratorLabels: labels(c.numeratorLabels),
        metric: String(c.metric ?? ''),
    }
}

const splitList = (s: string) => s.split(',').map((v) => v.trim())
const toApiCvr = (c: CvrFormConfig) => ({
    denominatorDimension: c.denominatorDimension,
    denominatorLabels: splitList(c.denominatorLabels),
    numeratorDimension: c.numeratorDimension,
    numeratorLabels: splitList(c.numeratorLabels),
    metric: c.metric,
})

type CvrSlot = 'cvrA' | 'cvrB' | 'cvrC' | 'cvrD'
const SLOT_LABEL: Record<CvrSlot, string> = { cvrA: 'A', cvrB: 'B', cvrC: 'C', cvrD: 'D' }

function CvrFields({ slot, value, onChange }: { slot: CvrSlot; value: CvrFormConfig; onChange: (v: CvrFormConfig) => void }) {
    const set = <K extends keyof CvrFormConfig>(k: K, v: CvrFormConfig[K]) => onChange({ ...value, [k]: v })
    const name = SLOT_LABEL[slot]
    return (
        <div className={styles.formGrid}>
            <label className={styles.field}>
                <span className={styles.fieldLabel}>分母ディメンション</span>
                <select className={ui.select} value={value.denominatorDimension} onChange={(e) => set('denominatorDimension', e.target.value)} aria-label={`CVR ${name} 分母ディメンション`}>
                    <option value="">選択してください</option>
                    {GA4_CVR_DIMENSIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
            </label>
            <div className={styles.field}>
                <span className={styles.fieldLabel}>分母ラベル</span>
                <LabelInput value={value.denominatorLabels} onChange={(v) => set('denominatorLabels', v)} placeholder="EF__Line__Area__新規会員登録" className={ui.input} />
            </div>
            <label className={styles.field}>
                <span className={styles.fieldLabel}>分子ディメンション</span>
                <select className={ui.select} value={value.numeratorDimension} onChange={(e) => set('numeratorDimension', e.target.value)} aria-label={`CVR ${name} 分子ディメンション`}>
                    <option value="">選択してください</option>
                    {GA4_CVR_DIMENSIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
            </label>
            <div className={styles.field}>
                <span className={styles.fieldLabel}>分子ラベル</span>
                <LabelInput value={value.numeratorLabels} onChange={(v) => set('numeratorLabels', v)} placeholder="EF__Driver__Label__StepLast_求人を探しに行く" className={ui.input} />
            </div>
            <label className={styles.field}>
                <span className={styles.fieldLabel}>計算メトリクス</span>
                <select className={ui.select} value={value.metric} onChange={(e) => set('metric', e.target.value)} aria-label={`CVR ${name} 計算メトリクス`}>
                    <option value="">選択してください</option>
                    {GA4_METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
            </label>
        </div>
    )
}

function AnalyticsPageContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { currentProduct } = useProduct()
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<ReportResult | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [showCvr, setShowCvr] = useState<Record<'cvrB' | 'cvrC' | 'cvrD', boolean>>({ cvrB: true, cvrC: false, cvrD: false })
    const [configLoaded, setConfigLoaded] = useState(false)
    const [config, setConfig] = useState<ReportConfig>(defaultConfig)

    useEffect(() => {
        if (currentProduct?.ga4PropertyId) setConfig((prev) => ({ ...prev, propertyId: currentProduct.ga4PropertyId || prev.propertyId }))
    }, [currentProduct])

    // 履歴の「この条件で再実行」から来たとき（?executionId=）、保存済み config をフォームに読み戻す
    useEffect(() => {
        const executionId = searchParams?.get('executionId')
        if (!executionId || configLoaded) return
        fetchJson<{ execution?: { report?: { name?: string; config?: Record<string, unknown> } } }>(`/api/reports/${executionId}`)
            .then((data) => {
                const saved = data.execution?.report?.config
                if (!saved) return
                const names = (v: unknown) => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : String((x as { name?: string }).name ?? ''))).join(',') : null)
                const filter = (saved.filter ?? {}) as Partial<Record<'dimension' | 'operator' | 'expression', string>>
                setConfig((prev) => ({
                    ...prev,
                    reportName: data.execution?.report?.name || prev.reportName,
                    propertyId: (saved.propertyId as string) || prev.propertyId,
                    startDate: (saved.startDate as string) || prev.startDate,
                    endDate: (saved.endDate as string) || prev.endDate,
                    metrics: names(saved.metrics) ?? prev.metrics,
                    dimensions: names(saved.dimensions) ?? prev.dimensions,
                    filterDimension: filter.dimension || '',
                    filterOperator: filter.operator || 'CONTAINS',
                    filterExpression: filter.expression || '',
                    limit: (saved.limit as number) || prev.limit,
                    cvrA: toFormCvr(saved.cvrA) || prev.cvrA,
                    cvrB: toFormCvr(saved.cvrB) || prev.cvrB,
                    cvrC: toFormCvr(saved.cvrC) || prev.cvrC,
                    cvrD: toFormCvr(saved.cvrD) || prev.cvrD,
                    abTestEvaluationConfig: (saved.abTestEvaluationConfig as ReportConfig['abTestEvaluationConfig']) || prev.abTestEvaluationConfig,
                    geminiConfig: (saved.geminiConfig as ReportConfig['geminiConfig']) || prev.geminiConfig,
                }))
                setShowCvr((s) => ({ cvrB: s.cvrB || !!saved.cvrB, cvrC: s.cvrC || !!saved.cvrC, cvrD: s.cvrD || !!saved.cvrD }))
                setConfigLoaded(true)
            })
            .catch((err) => console.error('Failed to load report config:', err))
    }, [searchParams, configLoaded])

    const set = <K extends keyof ReportConfig>(key: K, value: ReportConfig[K]) => setConfig((c) => ({ ...c, [key]: value }))
    const setEval = <K extends keyof ReportConfig['abTestEvaluationConfig']>(key: K, value: ReportConfig['abTestEvaluationConfig'][K]) =>
        setConfig((c) => ({ ...c, abTestEvaluationConfig: { ...c.abTestEvaluationConfig, [key]: value } }))
    const optionalCvr = (slot: 'cvrB' | 'cvrC' | 'cvrD') => (showCvr[slot] && config[slot].denominatorDimension ? toApiCvr(config[slot]) : undefined)

    async function handleSubmit() {
        if (!currentProduct) return
        setLoading(true)
        setError(null)
        setResult(null)
        try {
            const data = await fetchJson<ReportResult>('/api/analytics/report', {
                method: 'POST',
                body: JSON.stringify({
                    productId: currentProduct.id,
                    reportName: config.reportName,
                    propertyId: config.propertyId,
                    startDate: config.startDate,
                    endDate: config.endDate,
                    metrics: splitList(config.metrics).map((name) => ({ name })),
                    dimensions: splitList(config.dimensions).map((name) => ({ name })),
                    filter: { dimension: config.filterDimension, operator: config.filterOperator, expression: config.filterExpression },
                    orderBy: config.orderBy,
                    limit: config.limit,
                    cvrA: toApiCvr(config.cvrA),
                    cvrB: optionalCvr('cvrB'),
                    cvrC: optionalCvr('cvrC'),
                    cvrD: optionalCvr('cvrD'),
                    abTestEvaluationConfig: config.abTestEvaluationConfig,
                    geminiConfig: config.geminiConfig,
                }),
            })
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

    const numberValue = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? '' : n)

    return (
        <PageShell
            pageId="analytics"
            requireProduct
            width="wide"
            status={{ loading, error, source: 'ga4', loadingText: 'レポート生成中...' }}
            keepChildrenWhileLoading
        >
            <form
                onSubmit={(e) => { e.preventDefault(); handleSubmit() }}
                className={styles.form}
            >
                <div className={ui.card}>
                    <h2 className={ui.sectionTitle}>基本設定</h2>
                    <p className={ui.sectionNote}>レポート名ごとに条件が保存され、同名で再実行すると条件が上書きされます。結果は履歴（データ・ツール → 実行履歴）に残ります。</p>
                    <div className={styles.formGrid}>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>レポート名</span>
                            <input type="text" className={ui.input} value={config.reportName} onChange={(e) => set('reportName', e.target.value)} placeholder="XWork_SU_01" required />
                        </label>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>プロパティID</span>
                            <input type="text" className={ui.input} value={config.propertyId} onChange={(e) => set('propertyId', e.target.value)} required />
                        </label>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>開始日</span>
                            <DateInput value={config.startDate} onChange={(e) => set('startDate', e.target.value)} required />
                        </label>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>終了日</span>
                            <DateInput value={config.endDate} onChange={(e) => set('endDate', e.target.value)} required />
                        </label>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>メトリクス</span>
                            <input type="text" className={ui.input} value={config.metrics} onChange={(e) => set('metrics', e.target.value)} placeholder="eventCount,totalUsers" required />
                            <span className={styles.help}>取得したい指標の API 名をカンマ区切りで</span>
                        </label>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>ディメンション</span>
                            <input type="text" className={ui.input} value={config.dimensions} onChange={(e) => set('dimensions', e.target.value)} placeholder="date,eventName" required />
                            <span className={styles.help}>取得したい分析軸の API 名をカンマ区切りで</span>
                        </label>
                    </div>
                </div>

                <div className={ui.card}>
                    <h2 className={ui.sectionTitle}>フィルタ設定</h2>
                    <div className={styles.formGrid}>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>フィルタ ディメンション</span>
                            <select className={ui.select} value={config.filterDimension} onChange={(e) => set('filterDimension', e.target.value)} aria-label="フィルタ ディメンション">
                                <option value="">選択してください</option>
                                {GA4_FILTER_DIMENSIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                            </select>
                        </label>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>フィルタ 演算子</span>
                            <select className={ui.select} value={config.filterOperator} onChange={(e) => set('filterOperator', e.target.value)} aria-label="フィルタ 演算子">
                                {GA4_FILTER_OPERATORS.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
                            </select>
                        </label>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>フィルタ 式</span>
                            <input type="text" className={ui.input} value={config.filterExpression} onChange={(e) => set('filterExpression', e.target.value)} placeholder="/members/signup" />
                            <span className={styles.help}>空ならフィルタなし。カンマ区切りで OR</span>
                        </label>
                    </div>
                </div>

                <div className={ui.card}>
                    <h2 className={ui.sectionTitle}>CVR設定 A</h2>
                    <CvrFields slot="cvrA" value={config.cvrA} onChange={(v) => set('cvrA', v)} />
                </div>
                {(['cvrB', 'cvrC', 'cvrD'] as const).map((slot) => (
                    <div key={slot} className={ui.card}>
                        <div className={styles.sectionHeader}>
                            <h2 className={ui.sectionTitle}>CVR設定 {SLOT_LABEL[slot]}</h2>
                            <Switch checked={showCvr[slot]} onChange={(on) => setShowCvr((s) => ({ ...s, [slot]: on }))} aria-label={`CVR設定 ${SLOT_LABEL[slot]} の表示切替`} />
                        </div>
                        {showCvr[slot] && <CvrFields slot={slot} value={config[slot]} onChange={(v) => set(slot, v)} />}
                    </div>
                ))}

                <div className={ui.card}>
                    <h2 className={ui.sectionTitle}>ABテスト判定設定</h2>
                    <p className={ui.sectionNote}>CVR を 2 パターン以上設定したとき、上位 2 つを比較して勝敗を判定します。</p>
                    <div className={styles.formGrid}>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>統計的有意差 (%)</span>
                            <input type="number" className={ui.input} value={numberValue(config.abTestEvaluationConfig.minSignificance)} onChange={(e) => setEval('minSignificance', e.target.value ? parseFloat(e.target.value) : null)} />
                        </label>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>最低PV数</span>
                            <input type="number" className={ui.input} value={numberValue(config.abTestEvaluationConfig.minPV)} onChange={(e) => setEval('minPV', e.target.value ? parseInt(e.target.value, 10) : 0)} />
                        </label>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>最低期間 (日)</span>
                            <input type="number" className={ui.input} value={numberValue(config.abTestEvaluationConfig.minDays)} onChange={(e) => setEval('minDays', e.target.value ? parseInt(e.target.value, 10) : 0)} />
                        </label>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>最低改善率 (%)</span>
                            <input type="number" step="0.1" className={ui.input} value={numberValue(config.abTestEvaluationConfig.minImprovementRate)} onChange={(e) => setEval('minImprovementRate', e.target.value ? parseFloat(e.target.value) : 0)} />
                        </label>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>最低差分 (pt)</span>
                            <input type="number" step="0.1" className={ui.input} value={numberValue(config.abTestEvaluationConfig.minDifferencePt)} onChange={(e) => setEval('minDifferencePt', e.target.value ? parseFloat(e.target.value) : 0)} />
                        </label>
                    </div>
                </div>

                <GeminiConfig enabled={config.geminiConfig.enabled} onEnabledChange={(enabled) => set('geminiConfig', { ...config.geminiConfig, enabled })} />

                {/* 各カードの required を効かせるため form は外側の 1 つだけ。FilterBar は onSubmit なし（form を作らない）で、ボタンを自前で置く */}
                <FilterBar>
                    <FilterField label="実行">
                        <span className={ui.note}>生成が終わると結果ページ（履歴）へ移動します</span>
                    </FilterField>
                    <button type="submit" className={cx(ui.btnPrimary, styles.submit)} disabled={loading || !currentProduct}>
                        {loading ? '生成中...' : 'レポートを生成'}
                    </button>
                </FilterBar>
            </form>

            {result && (
                <div className={ui.card}>
                    <div className={styles.sectionHeader}>
                        <h2 className={ui.sectionTitle}>レポート結果</h2>
                        {result.executionId && <Link href={`/reports/${result.executionId}`} className={ui.btnGhost}>履歴で詳細を見る</Link>}
                    </div>
                    {result.cvrResults && (
                        <div className={ui.summaryRow}>
                            {(['dataA', 'dataB', 'dataC', 'dataD'] as const).map((key) => {
                                const d = result.cvrResults?.[key]
                                if (!d) return null
                                return (
                                    <div key={key} className={ui.summaryCard}>
                                        <span className={ui.summaryLabel}>パターン {key.slice(-1)}</span>
                                        <span className={ui.summaryValue}>{(d.cvr * 100).toFixed(2)}%</span>
                                        <span className={ui.summaryHint}>PV {d.pv.toLocaleString()} / CV {d.cv.toLocaleString()}</span>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                    {result.abTestEvaluation && (
                        <div className={cx(ui.cardTight, styles.evaluation)}>
                            <p className={ui.strong}>判定: {result.abTestEvaluation.recommendation}</p>
                            <ul className={styles.checkList}>
                                <li>統計的有意差: {result.abTestEvaluation.checks.significance.value}% {result.abTestEvaluation.checks.significance.passed ? '✅' : '❌'}</li>
                                <li>サンプル数: {result.abTestEvaluation.checks.sampleSize.passed ? '✅' : '❌'}</li>
                                <li>テスト期間: {result.abTestEvaluation.checks.period.days}日間 {result.abTestEvaluation.checks.period.passed ? '✅' : '❌'}</li>
                                <li>改善幅: {result.abTestEvaluation.checks.improvement.passed ? '✅' : '❌'}</li>
                            </ul>
                            {result.abTestEvaluation.aiEvaluation ? (
                                <div className={ui.aiResult}><p>{result.abTestEvaluation.aiEvaluation}</p></div>
                            ) : config.geminiConfig.enabled && (
                                <Alert tone="warn">AI 評価が返りませんでした。Gemini の API キー設定を確認してください。</Alert>
                            )}
                        </div>
                    )}
                </div>
            )}
        </PageShell>
    )
}

export default function AnalyticsPage() {
    return (
        <Suspense fallback={<PageShell pageId="analytics" status={{ loading: true, source: 'ga4' }}>{null}</PageShell>}>
            <AnalyticsPageContent />
        </Suspense>
    )
}
