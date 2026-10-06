'use client'

import { useEffect, useState } from 'react'
import { useProduct } from '@/contexts/ProductContext'
import InfoTooltip from '@/components/InfoTooltip'
import AISpinner from '@/components/AISpinner'
import PageShell from '@/components/PageShell'
import FilterBar, { FilterField } from '@/components/FilterBar'
import PeriodSelect from '@/components/PeriodSelect'
import Alert from '@/components/Alert'
import { ui, cx } from '@/components/ui'
import { usePeriodRange } from '@/hooks/usePeriodRange'
import { useReport } from '@/hooks/useReport'
import { fetchJson } from '@/lib/utils/fetch'
import { STATUS_COLORS } from '@/lib/constants/chartColors'
import type { ExitReport } from '@/lib/services/journey/exitTypes'
import styles from './ExitPage.module.css'

/** ファネルのステップに選べるページカテゴリ（lib/services/journey/pathCategories.ts の FUNNEL_STEP_CATEGORIES と同じ並び） */
const ALL_STEPS = ['TOP', '大職種一覧', '絞り込み検索', '求人詳細', '応募フォーム', '会員登録フォーム', 'ログイン', '検索結果', 'コラム', 'featured', 'LP']

const PRESETS = [
    { label: '応募ファネル', steps: ['大職種一覧', '求人詳細', '応募フォーム'] },
    { label: '会員登録ファネル', steps: ['大職種一覧', '求人詳細', '会員登録フォーム'] },
    { label: '求人詳細→応募', steps: ['求人詳細', '応募フォーム'] },
    { label: '求人詳細→会員登録', steps: ['求人詳細', '会員登録フォーム'] },
    { label: 'カスタム', steps: [] },
]
const CUSTOM_PRESET = PRESETS.length - 1

const DEVICE_OPTIONS = [
    { value: '', label: '全デバイス' },
    { value: 'mobile', label: 'スマホ' },
    { value: 'desktop', label: 'PC' },
    { value: 'tablet', label: 'タブレット' },
]

// ステップカラー（紫→ピンクのグラデーション）
const STEP_COLORS = ['#8b5cf6', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e']
function stepColor(i: number) { return STEP_COLORS[i % STEP_COLORS.length] }

function dropClass(rate: number) {
    if (rate < 0.3) return styles.good
    if (rate < 0.6) return styles.mid
    return styles.bad
}

function exitRateColor(rate: number) {
    if (rate < 0.3) return STATUS_COLORS.good
    if (rate < 0.6) return STATUS_COLORS.warn
    return STATUS_COLORS.bad
}

function engClass(rate: number) {
    if (rate >= 0.6) return styles.engHigh
    if (rate >= 0.35) return styles.engMid
    return styles.engLow
}

function formatDuration(sec: number): string {
    const s = Math.round(sec)
    if (s < 60) return `${s}秒`
    return `${Math.floor(s / 60)}分${s % 60}秒`
}

export default function ExitPage() {
    const { currentProduct } = useProduct()
    const [presetIdx, setPresetIdx] = useState(0)
    const [steps, setSteps] = useState<string[]>(PRESETS[0].steps)
    const periodState = usePeriodRange('30daysAgo')
    const { range } = periodState
    const [deviceFilter, setDeviceFilter] = useState('')

    // ステップ・期間・デバイスを変えると即再取得（旧実装は「分析実行」ボタン）
    const report = useReport<ExitReport>('/api/exit', {
        body: {
            propertyId: currentProduct?.ga4PropertyId,
            steps,
            startDate: range?.startDate,
            endDate: range?.endDate,
            deviceFilter: deviceFilter || undefined,
        },
        enabled: !!currentProduct && !!range && steps.length >= 2,
        keepPreviousData: true,
    })
    const data = report.data

    const [geminiLoading, setGeminiLoading] = useState(false)
    const [geminiResult, setGeminiResult] = useState<string | null>(null)
    const [geminiError, setGeminiError] = useState<string | null>(null)
    useEffect(() => { setGeminiResult(null); setGeminiError(null) }, [report.data])

    function handlePreset(idx: number) {
        setPresetIdx(idx)
        const p = PRESETS[idx]
        if (p.steps.length > 0) setSteps([...p.steps])
    }
    function updateStep(i: number, val: string) {
        setSteps((s) => s.map((v, j) => (j === i ? val : v)))
        setPresetIdx(CUSTOM_PRESET)
    }
    function removeStep(i: number) {
        setSteps((s) => s.filter((_, j) => j !== i))
        setPresetIdx(CUSTOM_PRESET)
    }
    function addStep() {
        const unused = ALL_STEPS.find((s) => !steps.includes(s)) ?? ALL_STEPS[0]
        setSteps((s) => [...s, unused])
        setPresetIdx(CUSTOM_PRESET)
    }

    async function handleGeminiAnalysis() {
        if (!data || !range) return
        setGeminiLoading(true)
        setGeminiError(null)
        setGeminiResult(null)
        try {
            const json = await fetchJson<{ analysis: string }>('/api/exit/gemini', {
                method: 'POST',
                body: JSON.stringify({
                    steps: data.steps,
                    exitCategories: data.exitCategories,
                    startDate: range.startDate,
                    endDate: range.endDate,
                    deviceFilter: deviceFilter || undefined,
                }),
            })
            setGeminiResult(json.analysis)
        } catch (e) {
            setGeminiError(e instanceof Error ? e.message : 'エラーが発生しました')
        } finally {
            setGeminiLoading(false)
        }
    }

    const maxSessions = data ? data.steps[0]?.sessions ?? 1 : 1

    return (
        <PageShell
            pageId="exit"
            requireProduct
            status={{ loading: report.loading, error: report.error, source: 'ga4', onRetry: report.run }}
            keepChildrenWhileLoading
            controls={
                <div className={ui.card}>
                    <div className={styles.presetRow}>
                        <span className={styles.presetLabel}>プリセット：</span>
                        {PRESETS.map((p, i) => (
                            <button key={i} type="button" className={cx(styles.presetBtn, presetIdx === i && styles.presetBtnActive)} onClick={() => handlePreset(i)}>
                                {p.label}
                            </button>
                        ))}
                    </div>

                    <div className={styles.stepList}>
                        {steps.map((step, i) => (
                            <div key={i} className={styles.stepRow}>
                                <span className={styles.stepIndex} style={{ backgroundColor: `${stepColor(i)}2e` }}>{i + 1}</span>
                                <select value={step} onChange={(e) => updateStep(i, e.target.value)} className={cx(ui.select, styles.stepSelect)} aria-label={`ステップ ${i + 1}`}>
                                    {ALL_STEPS.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                                {steps.length > 2 && (
                                    <button type="button" className={styles.removeBtn} onClick={() => removeStep(i)} aria-label="ステップを削除">✕</button>
                                )}
                            </div>
                        ))}
                    </div>
                    {steps.length < 6 && (
                        <button type="button" className={ui.btnGhost} onClick={addStep}>＋ ステップを追加</button>
                    )}
                    {steps.length < 2 && <p className={ui.note}>ステップを 2 つ以上設定してください</p>}

                    <FilterBar>
                        <FilterField label="期間">
                            <PeriodSelect state={periodState} />
                        </FilterField>
                        <FilterField label="デバイス">
                            {DEVICE_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    className={cx(styles.deviceBtn, deviceFilter === opt.value && styles.deviceBtnActive)}
                                    onClick={() => setDeviceFilter(opt.value)}
                                    disabled={report.loading}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </FilterField>
                    </FilterBar>
                </div>
            }
        >
            {data && (
                <>
                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>ファネル離脱状況<InfoTooltip text="各ステップのページを含むセッション数と、次ステップへの引き継ぎ率。脱落率 = (前ステップ − 当ステップ) ÷ 前ステップ。" direction="bottom" /></h2>
                        <p className={ui.sectionNote}>各ステップのセッション数と次ステップへの引き継ぎ率。色は緑＝良好 / 黄＝要注意 / 赤＝改善優先を示します。</p>

                        <div className={styles.funnelChart}>
                            {data.steps.map((step, i) => {
                                const widthPct = maxSessions > 0 ? (step.sessions / maxSessions) * 100 : 0
                                const color = stepColor(i)
                                const isLast = i === data.steps.length - 1
                                return (
                                    <div key={i}>
                                        <div className={styles.funnelBar} style={{ width: `${Math.max(widthPct, 15)}%`, background: `${color}1a`, border: `1px solid ${color}40` }}>
                                            <div className={styles.funnelStepName} style={{ color }}>{i + 1}. {step.name}</div>
                                            <div className={styles.funnelStepMeta}>
                                                <span className={styles.funnelSessions}>{step.sessions.toLocaleString()}</span>
                                                <span className={styles.funnelPct}>
                                                    セッション
                                                    {i > 0 && ` (初回比 ${(step.retentionFromFirst * 100).toFixed(0)}%)`}
                                                </span>
                                            </div>
                                        </div>
                                        {!isLast && (
                                            <div className={styles.funnelDropoff}>
                                                <span className={styles.funnelArrow}>↓</span>
                                                <span className={cx(styles.funnelDropText, dropClass(data.steps[i + 1].dropoffRate))}>
                                                    {data.steps[i + 1].dropoff.toLocaleString()}人が離脱
                                                    &nbsp;({(data.steps[i + 1].dropoffRate * 100).toFixed(1)}% 脱落)
                                                    &nbsp;→&nbsp;
                                                    {(data.steps[i + 1].sessions / (step.sessions || 1) * 100).toFixed(1)}% が次へ
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {data.exitCategories.length > 0 && (
                        <div className={ui.card}>
                            <h2 className={ui.sectionTitle}>ページ別離脱状況</h2>
                            <p className={ui.sectionNote}>PVが多く離脱傾向（1 - エンゲージメント率）が高いページが改善優先候補です。GA4の exits メトリクス非対応のため推定値を表示しています。</p>
                            <div className={ui.tableWrap}>
                                <table className={ui.dataTable}>
                                    <thead>
                                        <tr>
                                            <th>ページカテゴリ</th>
                                            <th className={ui.num}>推定離脱数<InfoTooltip text="GA4のexitsメトリクス非対応のため、PV × (1 - エンゲージメント率) で推定した値。" direction="bottom" /></th>
                                            <th className={ui.num}>PV</th>
                                            <th className={ui.num}>平均滞在<InfoTooltip text="ユーザー1人あたりの平均エンゲージメント時間。" direction="bottom" /></th>
                                            <th className={ui.num}>スクロール率<InfoTooltip text="ページの90%までスクロールしたユーザーの割合。低い＝コンテンツが読まれていない。" direction="bottom" /></th>
                                            <th className={ui.num}>離脱傾向<InfoTooltip text="1 - エンゲージメント率で算出。高いほどエンゲージせずに離れるユーザーが多いことを示す。" direction="bottom" /></th>
                                            <th className={ui.num}>エンゲージメント率<InfoTooltip text="このページへの訪問のうち、エンゲージドセッション（10秒以上 or 2PV以上 or CV）の割合。" direction="bottom" /></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.exitCategories.map((row) => (
                                            <tr key={row.page}>
                                                <td>{row.page}</td>
                                                <td className={ui.num}>{row.exits.toLocaleString()}</td>
                                                <td className={ui.num}>{row.pageViews.toLocaleString()}</td>
                                                <td className={cx(ui.num, styles.signal)}>{formatDuration(row.avgEngagementSec)}</td>
                                                <td className={cx(ui.num, styles.signal)}>{(row.scrollRate * 100).toFixed(0)}%</td>
                                                <td className={ui.num}>
                                                    <div className={styles.exitRateBar}>
                                                        <div className={styles.exitRateTrack}>
                                                            <div className={styles.exitRateFill} style={{ width: `${Math.min(row.exitRate * 100, 100)}%`, background: exitRateColor(row.exitRate) }} />
                                                        </div>
                                                        <span className={cx(styles.exitRateText, dropClass(row.exitRate))}>{(row.exitRate * 100).toFixed(1)}%</span>
                                                    </div>
                                                </td>
                                                <td className={ui.num}>
                                                    <span className={cx(styles.engBadge, engClass(row.engagementRate))}>{(row.engagementRate * 100).toFixed(0)}%</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>離脱状況 AI分析</h2>
                        <p className={ui.sectionNote}>ファネル離脱状況とページ別の行動シグナル（滞在時間・スクロール率）をもとに、離脱の質（即離脱／読了後離脱）と改善提案を生成します</p>
                        <div className={ui.controls}>
                            <button type="button" onClick={handleGeminiAnalysis} disabled={geminiLoading} className={ui.btnPrimary}>
                                {geminiLoading ? <span className={ui.inlineLoading}><AISpinner /> 分析中...</span> : 'AIで分析'}
                            </button>
                        </div>
                        {geminiError && <Alert tone="error">{geminiError}</Alert>}
                        {geminiResult && (
                            <div className={ui.aiResult}>
                                {geminiResult.split('\n').map((line, i) => {
                                    const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                                    const bold = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                    return line.trim() ? <p key={i} dangerouslySetInnerHTML={{ __html: bold }} /> : null
                                })}
                            </div>
                        )}
                    </div>
                </>
            )}
        </PageShell>
    )
}
