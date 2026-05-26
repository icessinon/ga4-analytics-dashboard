'use client'

import { useState } from 'react'
import { useProduct } from '@/lib/contexts/ProductContext'
import DateInput from '@/components/DateInput'
import Loader from '@/components/Loader'
import BackLink from '@/components/BackLink'
import InfoTooltip from '@/components/InfoTooltip/InfoTooltip'
import styles from './ExitPage.module.css'

const ALL_STEPS = [
    'TOP',
    '大職種一覧',
    '絞り込み検索',
    '求人詳細',
    '応募フォーム',
    '会員登録フォーム',
    'ログイン',
    '検索結果',
    'コラム',
    'featured',
    'LP',
]

const PRESETS = [
    { label: '応募ファネル', steps: ['大職種一覧', '求人詳細', '応募フォーム'] },
    { label: '会員登録ファネル', steps: ['大職種一覧', '求人詳細', '会員登録フォーム'] },
    { label: '求人詳細→応募', steps: ['求人詳細', '応募フォーム'] },
    { label: '求人詳細→会員登録', steps: ['求人詳細', '会員登録フォーム'] },
    { label: 'カスタム', steps: [] },
]

const DEVICE_OPTIONS = [
    { value: '', label: '全デバイス' },
    { value: 'mobile', label: 'スマホ' },
    { value: 'desktop', label: 'PC' },
    { value: 'tablet', label: 'タブレット' },
]

// ステップカラー
const STEP_COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e']
function stepColor(i: number) { return STEP_COLORS[i % STEP_COLORS.length] }

// 離脱率で色を決める
function dropClass(rate: number) {
    if (rate < 0.3) return styles.funnelDropLow
    if (rate < 0.6) return styles.funnelDropMid
    return styles.funnelDropHigh
}

function exitRateClass(rate: number) {
    if (rate < 0.3) return styles.exitRateGood
    if (rate < 0.6) return styles.exitRateMid
    return styles.exitRateBad
}

function exitRateColor(rate: number) {
    if (rate < 0.3) return '#34d399'
    if (rate < 0.6) return '#fbbf24'
    return '#f87171'
}

function engClass(rate: number) {
    if (rate >= 0.6) return styles.engHigh
    if (rate >= 0.35) return styles.engMid
    return styles.engLow
}

interface FunnelStep {
    name: string
    sessions: number
    dropoff: number
    dropoffRate: number
    retentionFromFirst: number
}

interface ExitCategory {
    page: string
    exits: number
    pageViews: number
    exitRate: number
    engagementRate: number
}

interface ExitData {
    steps: FunnelStep[]
    exitCategories: ExitCategory[]
}

export default function ExitPage() {
    const { currentProduct } = useProduct()
    const [presetIdx, setPresetIdx] = useState(0)
    const [steps, setSteps] = useState<string[]>(['大職種一覧', '求人詳細', '応募フォーム'])
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [deviceFilter, setDeviceFilter] = useState('')
    const [loading, setLoading] = useState(false)
    const [data, setData] = useState<ExitData | null>(null)
    const [error, setError] = useState<string | null>(null)

    function handlePreset(idx: number) {
        setPresetIdx(idx)
        const p = PRESETS[idx]
        if (p.steps.length > 0) setSteps([...p.steps])
    }

    function updateStep(i: number, val: string) {
        setSteps(s => s.map((v, j) => j === i ? val : v))
    }

    function removeStep(i: number) {
        setSteps(s => s.filter((_, j) => j !== i))
    }

    function addStep() {
        const unused = ALL_STEPS.find(s => !steps.includes(s)) ?? ALL_STEPS[0]
        setSteps(s => [...s, unused])
    }

    async function doFetch(overrides: { deviceFilter?: string } = {}) {
        if (!currentProduct?.ga4PropertyId) {
            setError('プロダクトを選択してください')
            return
        }
        if (steps.length < 2) {
            setError('ステップを2つ以上設定してください')
            return
        }
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/exit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    propertyId: currentProduct.ga4PropertyId,
                    steps,
                    startDate: startDate || undefined,
                    endDate: endDate || undefined,
                    deviceFilter: (overrides.deviceFilter ?? deviceFilter) || undefined,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error || 'エラーが発生しました')
            setData(json)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'エラーが発生しました')
        } finally {
            setLoading(false)
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        await doFetch()
    }

    async function handleDeviceChange(device: string) {
        setDeviceFilter(device)
        if (data) await doFetch({ deviceFilter: device })
    }

    const maxSessions = data ? data.steps[0]?.sessions ?? 1 : 1

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>離脱分析</h1>
                    <p className={styles.subtitle}>
                        ファネルの各ステップでどれだけ離脱しているか、離脱率の高いページはどこかを把握します
                    </p>
                </div>
                <BackLink href="/">ダッシュボードに戻る</BackLink>
            </div>

            {/* 設定パネル */}
            <div className={styles.panel}>
                {/* プリセット */}
                <div className={styles.presetRow}>
                    <span className={styles.presetLabel}>プリセット：</span>
                    {PRESETS.map((p, i) => (
                        <button key={i} type="button"
                            className={`${styles.presetBtn} ${presetIdx === i ? styles.presetBtnActive : ''}`}
                            onClick={() => handlePreset(i)}>
                            {p.label}
                        </button>
                    ))}
                </div>

                {/* ファネルステップ編集 */}
                <div className={styles.stepList}>
                    {steps.map((step, i) => (
                        <div key={i} className={styles.stepRow}>
                            <span className={styles.stepIndex}>
                                <span style={{ color: stepColor(i), fontWeight: 700 }}>{i + 1}</span>
                            </span>
                            <select
                                value={step}
                                onChange={e => { updateStep(i, e.target.value); setPresetIdx(4) }}
                                className={styles.stepSelect}>
                                {ALL_STEPS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            {steps.length > 2 && (
                                <button type="button" className={styles.removeBtn} onClick={() => removeStep(i)}>✕</button>
                            )}
                        </div>
                    ))}
                </div>
                {steps.length < 6 && (
                    <button type="button" className={styles.addBtn} onClick={addStep}>＋ ステップを追加</button>
                )}

                {/* 日付・実行 */}
                <form onSubmit={handleSubmit}>
                    <div className={styles.formRow} style={{ marginTop: '0.75rem' }}>
                        <div className={styles.formField}>
                            <label className={styles.label}>開始日</label>
                            <DateInput value={startDate} onChange={e => setStartDate(e.target.value)} className={styles.input} />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.label}>終了日</label>
                            <DateInput value={endDate} onChange={e => setEndDate(e.target.value)} className={styles.input} />
                        </div>
                        <button type="submit" className={styles.button} disabled={loading || !currentProduct}>
                            {loading ? '分析中...' : '分析実行'}
                        </button>
                    </div>
                </form>

                {/* デバイスフィルター */}
                <div className={styles.deviceRow}>
                    <span className={styles.presetLabel}>デバイス：</span>
                    {DEVICE_OPTIONS.map(opt => (
                        <button key={opt.value} type="button"
                            className={`${styles.deviceBtn} ${deviceFilter === opt.value ? styles.deviceBtnActive : ''}`}
                            onClick={() => handleDeviceChange(opt.value)}
                            disabled={loading}>
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {!currentProduct && <div className={styles.notice}>プロダクトを選択してください</div>}
            {loading && (
                <div className={styles.loaderContainer}>
                    <Loader />
                    <p className={styles.loaderText}>GA4からデータを取得中...</p>
                </div>
            )}
            {error && <div className={styles.error}>{error}</div>}

            {data && !loading && (
                <>
                    {/* ファネル離脱チャート */}
                    <div className={styles.funnelSection}>
                        <p className={styles.sectionTitle}>ファネル離脱状況<InfoTooltip text="各ステップのページを含むセッション数と、次ステップへの引き継ぎ率。脱落率 = (前ステップ − 当ステップ) ÷ 前ステップ。" direction="bottom" /></p>
                        <p className={styles.sectionNote}>
                            各ステップのセッション数と次ステップへの引き継ぎ率。色は緑＝良好 / 黄＝要注意 / 赤＝改善優先を示します。
                        </p>

                        <div className={styles.funnelChart}>
                            {data.steps.map((step, i) => {
                                const widthPct = maxSessions > 0 ? (step.sessions / maxSessions) * 100 : 0
                                const color = stepColor(i)
                                const isLast = i === data.steps.length - 1
                                return (
                                    <div key={i} className={styles.funnelStep}>
                                        <div
                                            className={styles.funnelBar}
                                            style={{
                                                width: `${Math.max(widthPct, 15)}%`,
                                                background: `${color}1a`,
                                                border: `1px solid ${color}40`,
                                            }}
                                        >
                                            <div className={styles.funnelBarInner}>
                                                <div className={styles.funnelStepName} style={{ color }}>
                                                    {i + 1}. {step.name}
                                                </div>
                                                <div className={styles.funnelStepMeta}>
                                                    <span className={styles.funnelSessions}>
                                                        {step.sessions.toLocaleString()}
                                                    </span>
                                                    <span className={styles.funnelPct}>
                                                        セッション
                                                        {i > 0 && ` (初回比 ${(step.retentionFromFirst * 100).toFixed(0)}%)`}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {!isLast && (
                                            <div className={styles.funnelDropoff}>
                                                <span className={styles.funnelArrow}>↓</span>
                                                <span className={`${styles.funnelDropText} ${dropClass(data.steps[i + 1].dropoffRate)}`}>
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

                    {/* ページ別離脱率 */}
                    {data.exitCategories.length > 0 && (
                        <div className={styles.exitSection}>
                            <p className={styles.sectionTitle}>ページ別離脱状況</p>
                            <p className={styles.sectionNote}>
                                PVが多く離脱傾向（1 - エンゲージメント率）が高いページが改善優先候補です。GA4の exits メトリクス非対応のため推定値を表示しています。
                            </p>
                            <table className={styles.exitTable}>
                                <thead>
                                    <tr>
                                        <th className={styles.exitTh}>ページカテゴリ</th>
                                        <th className={styles.exitThNum}>推定離脱数<InfoTooltip text="GA4のexitsメトリクス非対応のため、PV × (1 - エンゲージメント率) で推定した値。" direction="bottom" /></th>
                                        <th className={styles.exitThNum}>PV</th>
                                        <th className={styles.exitThNum}>離脱傾向<InfoTooltip text="1 - エンゲージメント率で算出。高いほどエンゲージせずに離れるユーザーが多いことを示す。" direction="bottom" /></th>
                                        <th className={styles.exitThNum}>エンゲージメント率<InfoTooltip text="このページへの訪問のうち、エンゲージドセッション（10秒以上 or 2PV以上 or CV）の割合。" direction="bottom" /></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.exitCategories.map((row, i) => (
                                        <tr key={i} className={styles.exitRow}>
                                            <td className={styles.exitTd}>{row.page}</td>
                                            <td className={styles.exitTdNum}>{row.exits.toLocaleString()}</td>
                                            <td className={styles.exitTdNum}>{row.pageViews.toLocaleString()}</td>
                                            <td className={styles.exitTdNum}>
                                                <div className={styles.exitRateBar}>
                                                    <div className={styles.exitRateTrack}>
                                                        <div
                                                            className={styles.exitRateFill}
                                                            style={{
                                                                width: `${Math.min(row.exitRate * 100, 100)}%`,
                                                                background: exitRateColor(row.exitRate),
                                                            }}
                                                        />
                                                    </div>
                                                    <span className={`${styles.exitRateText} ${exitRateClass(row.exitRate)}`}>
                                                        {(row.exitRate * 100).toFixed(1)}%
                                                    </span>
                                                </div>
                                            </td>
                                            <td className={styles.exitTdNum}>
                                                <span className={`${styles.engBadge} ${engClass(row.engagementRate)}`}>
                                                    {(row.engagementRate * 100).toFixed(0)}%
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
