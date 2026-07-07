'use client'

import { useState } from 'react'
import { useProduct } from '@/lib/contexts/ProductContext'
import DateInput from '@/components/DateInput'
import Loader from '@/components/Loader'
import BackLink from '@/components/BackLink'
import AISpinner from '@/components/AISpinner/AISpinner'
import JourneySankey from '@/components/journey/JourneySankey'
import { nodeColor, exitRateColor } from '@/components/journey/journeyColors'
import styles from './JourneyPage.module.css'

interface JourneyNode {
    id: string
    stage: number
    sessions: number
}

interface JourneyFlow {
    from: string
    to: string
    sessions: number
}

interface RankingRow {
    page?: string
    channel?: string
    views: number
    rate: number
}

interface PathFlow {
    channel: string
    n2: string
    n1: string
    count: number
}

interface DropoutPath {
    channel: string
    n2: string
    n1: string
    dropout: number
}

interface PageSignal {
    avgEngagementSec: number
    scrollRate: number
    engagementRate: number
}

interface FormStat {
    name: string
    goalUsers: number
    dropoutUsers: number
    arrivalRate: number
    dropoutRate: number
}

interface JourneyData {
    nodes: JourneyNode[]
    flows: JourneyFlow[]
    totalSessions: number
    totalUsers: number
    goalUsers: number
    formStats: FormStat[]
    totalGoalViews: number
    goalLabel: string
    referrerRanking: RankingRow[]
    channelRanking: RankingRow[]
    topPaths: PathFlow[]
    rawTopPaths: PathFlow[]
    dropoutPaths: DropoutPath[]
    rawDropoutPaths: DropoutPath[]
    pageExitRates: Record<string, number>
    pageSignals?: Record<string, PageSignal>
    rawPageSignals?: Record<string, PageSignal>
    _debug?: { exitQ4Rows: number; exitQ4Error: string; q2RawCount: number; q1RawCount: number; rawN1MapSize: number; q2CatCount: number; q1CatCount: number; crossRows: number; internalBase: string; sampleReferrer: string }
}

const URL_PALETTE = ['#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f43f5e', '#0ea5e9', '#a78bfa', '#34d399', '#fb923c']
function urlPathColor(path: string): string {
    const seg = (path || '/').split('/').filter(Boolean)[0] || ''
    let h = 0
    for (let i = 0; i < seg.length; i++) h = ((h << 5) - h + seg.charCodeAt(i)) | 0
    return URL_PALETTE[Math.abs(h) % URL_PALETTE.length]
}

function formatDuration(sec: number): string {
    const s = Math.round(sec)
    if (s < 60) return `${s}秒`
    return `${Math.floor(s / 60)}分${s % 60}秒`
}

function filterByChannel(nodes: JourneyNode[], flows: JourneyFlow[], channel: string | null) {
    if (!channel) return { nodes, flows }
    const n1Set = new Set(flows.filter(f => f.from === channel).map(f => f.to))
    const filteredFlows = flows.filter(f => f.from === channel || n1Set.has(f.from))
    const usedIds = new Set([...filteredFlows.map(f => f.from), ...filteredFlows.map(f => f.to)])
    return {
        nodes: nodes.filter(n => usedIds.has(n.id)),
        flows: filteredFlows,
    }
}

const GOAL_PRESETS = [
    { label: '会員登録フォーム', path: '/members/signup', name: '会員登録フォーム' },
    { label: '応募フォーム', path: '/entry/media_', name: '応募フォーム' },
    { label: 'featured', path: '/featured', name: 'featuredページ' },
    { label: 'カスタム', path: '', name: '' },
]

const DEVICE_OPTIONS = [
    { value: '', label: '全デバイス' },
    { value: 'mobile', label: 'スマホ' },
    { value: 'desktop', label: 'PC' },
    { value: 'tablet', label: 'タブレット' },
]

export default function JourneyPage() {
    const { currentProduct } = useProduct()
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [goalPath, setGoalPath] = useState('/members/signup')
    const [goalLabel, setGoalLabel] = useState('会員登録フォーム')
    const [presetIdx, setPresetIdx] = useState(0)
    const [deviceFilter, setDeviceFilter] = useState('')
    const [channelFilter, setChannelFilter] = useState<string | null>(null)
    const [pathView, setPathView] = useState<'table' | 'path'>('table')
    const [pathDataMode, setPathDataMode] = useState<'category' | 'url'>('category')
    const [dropoutView, setDropoutView] = useState<'table' | 'path'>('table')
    const [dropoutDataMode, setDropoutDataMode] = useState<'category' | 'url'>('category')
    const [loading, setLoading] = useState(false)
    const [data, setData] = useState<JourneyData | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [geminiLoading, setGeminiLoading] = useState(false)
    const [geminiResult, setGeminiResult] = useState<string | null>(null)
    const [geminiError, setGeminiError] = useState<string | null>(null)

    function handlePreset(idx: number) {
        setPresetIdx(idx)
        const p = GOAL_PRESETS[idx]
        if (p.path) {
            setGoalPath(p.path)
            setGoalLabel(p.name)
        }
    }

    async function doFetch(overrides: { deviceFilter?: string } = {}) {
        if (!currentProduct?.ga4PropertyId) {
            setError('プロダクトを選択してください')
            return
        }
        setLoading(true)
        setError(null)
        setChannelFilter(null)
        try {
            const res = await fetch('/api/journey', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    propertyId: currentProduct.ga4PropertyId,
                    goalPath,
                    goalLabel,
                    startDate: startDate || undefined,
                    endDate: endDate || undefined,
                    domain: currentProduct.domain,
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
        setGeminiResult(null)
        setGeminiError(null)
        await doFetch()
    }

    async function handleGeminiAnalysis() {
        if (!data) return
        setGeminiLoading(true)
        setGeminiError(null)
        setGeminiResult(null)
        try {
            const paths = dropoutDataMode === 'url' ? (data.rawDropoutPaths ?? []) : (data.dropoutPaths ?? [])
            const signalMap = (dropoutDataMode === 'url' ? data.rawPageSignals : data.pageSignals) ?? {}
            const topPaths = paths.slice(0, 20).map((p) => {
                const sig = signalMap[p.n1]
                return {
                    channel: p.channel, n2: p.n2, n1: p.n1, dropout: p.dropout,
                    ratio: data.totalUsers > 0 ? p.dropout / data.totalUsers : 0,
                    ...(sig ? { avgEngagementSec: sig.avgEngagementSec, scrollRate: sig.scrollRate, engagementRate: sig.engagementRate } : {}),
                }
            })
            const res = await fetch('/api/journey/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    paths: topPaths,
                    totalUsers: data.totalUsers,
                    goalUsers: data.goalUsers ?? 0,
                    startDate,
                    endDate,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error || '分析に失敗しました')
            setGeminiResult(json.analysis)
        } catch (e) {
            setGeminiError(e instanceof Error ? e.message : 'エラーが発生しました')
        } finally {
            setGeminiLoading(false)
        }
    }

    async function handleDeviceChange(device: string) {
        setDeviceFilter(device)
        if (data) await doFetch({ deviceFilter: device })
    }

    const channels = data
        ? data.nodes.filter(n => n.stage === 0).sort((a, b) => b.sessions - a.sessions).map(n => n.id)
        : []

    const { nodes: filteredNodes, flows: filteredFlows } = data
        ? filterByChannel(data.nodes, data.flows, channelFilter)
        : { nodes: [], flows: [] }

    const sourcePaths = data
        ? (pathDataMode === 'url' ? (data.rawTopPaths ?? []) : data.topPaths)
        : []
    const displayedPaths = sourcePaths.length > 0
        ? (channelFilter ? sourcePaths.filter(p => p.channel === channelFilter) : sourcePaths)
        : []

    const dropoutSource = data
        ? (dropoutDataMode === 'url' ? (data.rawDropoutPaths ?? []) : (data.dropoutPaths ?? []))
        : []
    const displayedDropouts = dropoutSource.length > 0
        ? (channelFilter ? dropoutSource.filter(d => d.channel === channelFilter) : dropoutSource)
        : []
    const totalDropouts = displayedDropouts.reduce((s, d) => s + d.dropout, 0)
    const dropoutSignalMap: Record<string, PageSignal> = data
        ? ((dropoutDataMode === 'url' ? data.rawPageSignals : data.pageSignals) ?? {})
        : {}
    const totalPathCount = displayedPaths.reduce((s, p) => s + p.count, 0)

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>ユーザー経路分析</h1>
                    <p className={styles.subtitle}>
                        フォームに到達したユーザーが、どのチャネル・どのページを経由してきたかを可視化します
                    </p>
                </div>
                <BackLink href="/">ダッシュボードに戻る</BackLink>
            </div>

            <div className={styles.formSection}>
                <div className={styles.presetRow}>
                    <span className={styles.presetLabel}>ゴール：</span>
                    {GOAL_PRESETS.map((p, i) => (
                        <button key={i} type="button"
                            className={`${styles.presetBtn} ${presetIdx === i ? styles.presetBtnActive : ''}`}
                            onClick={() => handlePreset(i)}>
                            {p.label}
                        </button>
                    ))}
                </div>

                <form onSubmit={handleSubmit}>
                    <div className={styles.formRow}>
                        <div className={styles.formField}>
                            <label className={styles.label}>ゴールURLパス</label>
                            <input type="text" value={goalPath} onChange={(e) => setGoalPath(e.target.value)}
                                className={styles.input} placeholder="/members/signup" required />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.label}>ゴール名（表示用）</label>
                            <input type="text" value={goalLabel} onChange={(e) => setGoalLabel(e.target.value)}
                                className={styles.input} placeholder="会員登録フォーム" />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.label}>開始日</label>
                            <DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)} className={styles.input} />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.label}>終了日</label>
                            <DateInput value={endDate} onChange={(e) => setEndDate(e.target.value)} className={styles.input} />
                        </div>
                        <button type="submit" className={styles.button} disabled={loading || !currentProduct}>
                            {loading ? '取得中...' : '分析実行'}
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

            {data && (
                <>
                    {/* フォーム別到達率比較 */}
                    {(data.formStats ?? []).length > 0 && (
                        <div className={styles.rankingCard} style={{ marginBottom: '1.5rem' }}>
                            <p className={styles.rankingTitle}>フォーム別到達率</p>
                            <p className={styles.rankingSubtitle}>全ユーザー（{data.totalUsers.toLocaleString()}人）のうち各フォームに到達した割合</p>
                            <table className={styles.rankTable}>
                                <thead>
                                    <tr>
                                        <th className={styles.rankTh}>フォーム</th>
                                        <th className={styles.rankThNum}>到達数</th>
                                        <th className={styles.rankThNum}>到達率</th>
                                        <th className={styles.rankThNum}>離脱率</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(data.formStats ?? []).map((fs, i) => (
                                        <tr key={i} className={styles.rankRow}>
                                            <td className={styles.rankTd}>{fs.name}</td>
                                            <td className={styles.rankTdNum}>{fs.goalUsers.toLocaleString()}</td>
                                            <td className={styles.rankTdNum} style={{ color: '#34d399', fontWeight: 600 }}>
                                                {(fs.arrivalRate * 100).toFixed(2)}%
                                            </td>
                                            <td className={styles.rankTdNum} style={{ color: '#f87171' }}>
                                                {(fs.dropoutRate * 100).toFixed(1)}%
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* サマリー */}
                    <div className={styles.summaryRow}>
                        <div className={styles.summaryCard}>
                            <p className={styles.summaryLabel}>フォーム到達数</p>
                            <p className={styles.summaryValue}>{data.totalGoalViews.toLocaleString()}</p>
                        </div>
                        <div className={styles.summaryCard}>
                            <p className={styles.summaryLabel}>アクティブユーザー</p>
                            <p className={styles.summaryValue}>{data.totalUsers.toLocaleString()}</p>
                        </div>
                        <div className={styles.summaryCard}>
                            <p className={styles.summaryLabel}>フォーム到達率</p>
                            <p className={`${styles.summaryValue} ${styles.summaryHighlight}`}>
                                {data.totalUsers > 0 && data.goalUsers != null
                                    ? ((data.goalUsers / data.totalUsers) * 100).toFixed(2) + '%'
                                    : '-'}
                            </p>
                        </div>
                        <div className={styles.summaryCard}>
                            <p className={styles.summaryLabel}>離脱率</p>
                            <p className={`${styles.summaryValue} ${styles.summaryHighlight}`} style={{ color: '#f87171' }}>
                                {data.totalUsers > 0 && data.goalUsers != null
                                    ? (((data.totalUsers - data.goalUsers) / data.totalUsers) * 100).toFixed(1) + '%'
                                    : '-'}
                            </p>
                        </div>
                    </div>

                    {/* Sankey */}
                    <div className={styles.sankeySection}>
                        <p className={styles.sectionTitle}>経路フロー</p>
                        <p className={styles.sectionNote}>
                            左：流入チャネル　中：フォーム直前のページ　右：{data.goalLabel}
                            ／ ノードや帯にマウスを乗せると関連する経路だけが強調されます。チャネル（左列）はクリックで絞り込み、ノードはドラッグで移動できます
                        </p>

                        {/* チャネルフィルター */}
                        <div className={styles.channelBar}>
                            <button
                                className={`${styles.channelChip} ${!channelFilter ? styles.channelChipActive : ''}`}
                                onClick={() => setChannelFilter(null)}>
                                全チャネル
                            </button>
                            {channels.map(ch => (
                                <button key={ch}
                                    className={`${styles.channelChip} ${channelFilter === ch ? styles.channelChipActive : ''}`}
                                    style={channelFilter === ch
                                        ? { borderColor: nodeColor(ch), background: `${nodeColor(ch)}22`, color: nodeColor(ch) }
                                        : {}}
                                    onClick={() => setChannelFilter(channelFilter === ch ? null : ch)}>
                                    <span className={styles.chipDot} style={{ background: nodeColor(ch) }} />
                                    {ch}
                                </button>
                            ))}
                        </div>

                        <JourneySankey
                            nodes={filteredNodes}
                            flows={filteredFlows}
                            goalLabel={data.goalLabel}
                            totalGoalViews={data.totalGoalViews}
                            pageExitRates={data.pageExitRates}
                            onChannelClick={(ch) => setChannelFilter((prev) => (prev === ch ? null : ch))}
                        />
                    </div>

                    {/* 経路パターン */}
                    {(displayedPaths.length > 0 || data.topPaths.length > 0 || (data.rawTopPaths?.length ?? 0) > 0) && (
                        <div className={styles.pathSection}>
                            <div className={styles.pathSectionHeader}>
                                <div>
                                    <p className={styles.sectionTitle}>ページ遷移パターン</p>
                                    <p className={styles.sectionNote}>
                                        求人詳細・絞り込み検索ページへの到達前に、どのページを経由していたかを示します（全セッション対象）
                                    </p>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                    <div className={styles.pathViewToggle}>
                                        <button
                                            className={`${styles.pathViewBtn} ${pathDataMode === 'category' ? styles.pathViewBtnActive : ''}`}
                                            onClick={() => setPathDataMode('category')}>
                                            カテゴリ
                                        </button>
                                        <button
                                            className={`${styles.pathViewBtn} ${pathDataMode === 'url' ? styles.pathViewBtnActive : ''}`}
                                            onClick={() => setPathDataMode('url')}>
                                            URL
                                        </button>
                                    </div>
                                    <div className={styles.pathViewToggle}>
                                        <button
                                            className={`${styles.pathViewBtn} ${pathView === 'table' ? styles.pathViewBtnActive : ''}`}
                                            onClick={() => setPathView('table')}>
                                            テーブル
                                        </button>
                                        <button
                                            className={`${styles.pathViewBtn} ${pathView === 'path' ? styles.pathViewBtnActive : ''}`}
                                            onClick={() => setPathView('path')}>
                                            パス
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {displayedPaths.length === 0 ? (
                                <p style={{ fontSize: '0.875rem', color: '#6b7280', padding: '0.5rem 0' }}>
                                    {pathDataMode === 'url' ? 'URLデータなし（再分析で取得されます）' : 'データなし'}
                                </p>
                            ) : pathView === 'table' ? (
                                <div className={styles.pathTableWrap}>
                                    <table className={styles.pathTable}>
                                        <thead>
                                            <tr>
                                                <th className={styles.pathTh}>#</th>
                                                <th className={styles.pathTh}>チャネル</th>
                                                <th className={styles.pathTh}>推定経路</th>
                                                <th className={styles.pathThNum}>件数</th>
                                                <th className={styles.pathThNum}>割合</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {displayedPaths.slice(0, 20).map((p, i) => {
                                                const c2 = pathDataMode === 'url' ? urlPathColor(p.n2) : nodeColor(p.n2)
                                                const c1 = pathDataMode === 'url' ? urlPathColor(p.n1) : nodeColor(p.n1)
                                                return (
                                                    <tr key={i} className={styles.pathRow}>
                                                        <td className={styles.pathTdRank}>{i + 1}</td>
                                                        <td className={styles.pathTd}>
                                                            <span className={styles.chipDot} style={{ background: nodeColor(p.channel) }} />
                                                            {p.channel}
                                                        </td>
                                                        <td className={styles.pathTd}>
                                                            <div className={styles.pathSteps}>
                                                                <span className={styles.pathStep}
                                                                    style={{ color: c2, borderColor: c2 + '60' }}>
                                                                    {p.n2}
                                                                </span>
                                                                <span className={styles.pathArrow}>→</span>
                                                                <span className={styles.pathStep}
                                                                    style={{ color: c1, borderColor: c1 + '60' }}>
                                                                    {p.n1}
                                                                </span>
                                                                <span className={styles.pathArrow}>→</span>
                                                                <span className={styles.pathStep}
                                                                    style={{ color: nodeColor(data.goalLabel), borderColor: nodeColor(data.goalLabel) + '60' }}>
                                                                    {data.goalLabel}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className={styles.pathTdNum}>{p.count.toLocaleString()}</td>
                                                        <td className={styles.pathTdNum} style={{ color: '#9ca3af' }}>
                                                            {totalPathCount > 0 ? ((p.count / totalPathCount) * 100).toFixed(1) : '-'}%
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                /* パスビュー: チャネルでグルーピング */
                                <div className={styles.pathGroupList}>
                                    {Object.entries(
                                        displayedPaths.slice(0, 50).reduce((acc, p) => {
                                            if (!acc[p.channel]) acc[p.channel] = []
                                            acc[p.channel].push(p)
                                            return acc
                                        }, {} as Record<string, PathFlow[]>)
                                    ).map(([channel, paths]) => {
                                        const channelTotal = paths.reduce((s, p) => s + p.count, 0)
                                        return (
                                            <div key={channel} className={styles.pathGroup}>
                                                <div className={styles.pathGroupHeader}>
                                                    <span className={styles.chipDot} style={{ background: nodeColor(channel) }} />
                                                    <span className={styles.pathGroupChannel}>{channel}</span>
                                                    <span className={styles.pathGroupTotal}>計 {channelTotal.toLocaleString()}</span>
                                                </div>
                                                {paths.map((p, i) => {
                                                    const barPct = channelTotal > 0 ? (p.count / channelTotal) * 100 : 0
                                                    const c2 = pathDataMode === 'url' ? urlPathColor(p.n2) : nodeColor(p.n2)
                                                    const c1 = pathDataMode === 'url' ? urlPathColor(p.n1) : nodeColor(p.n1)
                                                    return (
                                                        <div key={i} className={styles.pathGroupRow}>
                                                            <div className={styles.pathGroupChain}>
                                                                <span className={styles.pathStep}
                                                                    style={{ color: c2, borderColor: c2 + '55' }}>
                                                                    {p.n2}
                                                                </span>
                                                                <span className={styles.pathArrow}>→</span>
                                                                <span className={styles.pathStep}
                                                                    style={{ color: c1, borderColor: c1 + '55' }}>
                                                                    {p.n1}
                                                                </span>
                                                                <span className={styles.pathArrow}>→</span>
                                                                <span className={styles.pathStep}
                                                                    style={{ color: nodeColor(data.goalLabel), borderColor: nodeColor(data.goalLabel) + '55' }}>
                                                                    {data.goalLabel}
                                                                </span>
                                                            </div>
                                                            <div className={styles.pathGroupBar}>
                                                                <div className={styles.pathGroupBarFill}
                                                                    style={{ width: `${barPct}%`, background: nodeColor(channel) + '80' }} />
                                                            </div>
                                                            <span className={styles.pathGroupCount}>{p.count.toLocaleString()}</span>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 離脱経路パターン */}
                    {displayedDropouts.length > 0 && (
                        <div className={styles.pathSection}>
                            <div className={styles.pathSectionHeader}>
                                <div>
                                    <p className={styles.sectionTitle}>離脱経路パターン</p>
                                    <p className={styles.sectionNote}>
                                        会員登録に進まずに離脱したセッションの経路 ／ 割合＝表示中の離脱経路合計（{totalDropouts.toLocaleString()}件）に対する割合
                                        ／ 行動シグナルは離脱ページ（最後の列のページ）の値：平均滞在＝平均エンゲージメント時間、スクロール率＝ページ90%までスクロールしたユーザー割合、Eng率＝直帰しなかったセッション割合
                                    </p>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                    <div className={styles.pathViewToggle}>
                                        <button
                                            className={`${styles.pathViewBtn} ${dropoutDataMode === 'category' ? styles.pathViewBtnActive : ''}`}
                                            onClick={() => setDropoutDataMode('category')}>
                                            カテゴリ
                                        </button>
                                        <button
                                            className={`${styles.pathViewBtn} ${dropoutDataMode === 'url' ? styles.pathViewBtnActive : ''}`}
                                            onClick={() => setDropoutDataMode('url')}>
                                            URL
                                        </button>
                                    </div>
                                    <div className={styles.pathViewToggle}>
                                        <button
                                            className={`${styles.pathViewBtn} ${dropoutView === 'table' ? styles.pathViewBtnActive : ''}`}
                                            onClick={() => setDropoutView('table')}>
                                            テーブル
                                        </button>
                                        <button
                                            className={`${styles.pathViewBtn} ${dropoutView === 'path' ? styles.pathViewBtnActive : ''}`}
                                            onClick={() => setDropoutView('path')}>
                                            パス
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {dropoutView === 'table' ? (
                                <div className={styles.pathTableWrap}>
                                    <table className={styles.pathTable}>
                                        <thead>
                                            <tr>
                                                <th className={styles.pathTh}>#</th>
                                                <th className={styles.pathTh}>チャネル</th>
                                                <th className={styles.pathTh}>離脱経路</th>
                                                <th className={styles.pathThNum}>離脱数</th>
                                                <th className={styles.pathThNum}>割合</th>
                                                <th className={styles.pathThNum}>平均滞在</th>
                                                <th className={styles.pathThNum}>スクロール率</th>
                                                <th className={styles.pathThNum}>Eng率</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {displayedDropouts.slice(0, 20).map((d, i) => {
                                                const c2 = dropoutDataMode === 'url' ? urlPathColor(d.n2) : nodeColor(d.n2)
                                                const c1 = dropoutDataMode === 'url' ? urlPathColor(d.n1) : nodeColor(d.n1)
                                                const globalPct = totalDropouts > 0 ? (d.dropout / totalDropouts * 100).toFixed(1) : '-'
                                                const sig = dropoutSignalMap[d.n1]
                                                return (
                                                    <tr key={i} className={styles.pathRow}>
                                                        <td className={styles.pathTdRank}>{i + 1}</td>
                                                        <td className={styles.pathTd}>
                                                            <span className={styles.chipDot} style={{ background: nodeColor(d.channel) }} />
                                                            {d.channel}
                                                        </td>
                                                        <td className={styles.pathTd}>
                                                            <div className={styles.pathSteps}>
                                                                {d.n2 === d.n1 ? (
                                                                    <span className={styles.pathStep} style={{ color: c1, borderColor: c1 + '60' }}>{d.n1} 複数閲覧</span>
                                                                ) : (
                                                                    <>
                                                                        <span className={styles.pathStep} style={{ color: c2, borderColor: c2 + '60' }}>{d.n2}</span>
                                                                        <span className={styles.pathArrow}>→</span>
                                                                        <span className={styles.pathStep} style={{ color: c1, borderColor: c1 + '60' }}>{d.n1}</span>
                                                                    </>
                                                                )}
                                                                <span className={styles.pathArrow}>→</span>
                                                                <span className={styles.pathStep} style={{ color: '#f87171', borderColor: '#f8717160' }}>離脱</span>
                                                            </div>
                                                        </td>
                                                        <td className={styles.pathTdNum}>{d.dropout.toLocaleString()}</td>
                                                        <td className={styles.pathTdNum} style={{ color: '#9ca3af' }}>{globalPct}%</td>
                                                        <td className={styles.pathTdNum} style={{ color: '#93c5fd' }}>
                                                            {sig ? formatDuration(sig.avgEngagementSec) : '-'}
                                                        </td>
                                                        <td className={styles.pathTdNum} style={{ color: '#93c5fd' }}>
                                                            {sig ? `${(sig.scrollRate * 100).toFixed(0)}%` : '-'}
                                                        </td>
                                                        <td className={styles.pathTdNum} style={{ color: exitRateColor(sig ? 1 - sig.engagementRate : 0.5) }}>
                                                            {sig ? `${(sig.engagementRate * 100).toFixed(0)}%` : '-'}
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className={styles.pathGroupList}>
                                    {Object.entries(
                                        displayedDropouts.slice(0, 50).reduce((acc, d) => {
                                            if (!acc[d.channel]) acc[d.channel] = []
                                            acc[d.channel].push(d)
                                            return acc
                                        }, {} as Record<string, DropoutPath[]>)
                                    ).map(([channel, rows]) => {
                                        const channelTotal = rows.reduce((s, d) => s + d.dropout, 0)
                                        return (
                                            <div key={channel} className={styles.pathGroup}>
                                                <div className={styles.pathGroupHeader}>
                                                    <span className={styles.chipDot} style={{ background: nodeColor(channel) }} />
                                                    <span className={styles.pathGroupChannel}>{channel}</span>
                                                    <span className={styles.pathGroupTotal}>離脱計 {channelTotal.toLocaleString()}</span>
                                                    <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#9ca3af' }}>
                                                        (離脱全体の{totalDropouts > 0 ? (channelTotal / totalDropouts * 100).toFixed(1) : '-'}%)
                                                    </span>
                                                </div>
                                                {rows.map((d, i) => {
                                                    const barPct = totalDropouts > 0 ? (d.dropout / totalDropouts) * 100 : 0
                                                    const c2 = dropoutDataMode === 'url' ? urlPathColor(d.n2) : nodeColor(d.n2)
                                                    const c1 = dropoutDataMode === 'url' ? urlPathColor(d.n1) : nodeColor(d.n1)
                                                    return (
                                                        <div key={i} className={styles.pathGroupRow}>
                                                            <div className={styles.pathGroupChain}>
                                                                {d.n2 === d.n1 ? (
                                                                    <span className={styles.pathStep} style={{ color: c1, borderColor: c1 + '55' }}>{d.n1} 複数閲覧</span>
                                                                ) : (
                                                                    <>
                                                                        <span className={styles.pathStep} style={{ color: c2, borderColor: c2 + '55' }}>{d.n2}</span>
                                                                        <span className={styles.pathArrow}>→</span>
                                                                        <span className={styles.pathStep} style={{ color: c1, borderColor: c1 + '55' }}>{d.n1}</span>
                                                                    </>
                                                                )}
                                                                <span className={styles.pathArrow}>→</span>
                                                                <span className={styles.pathStep} style={{ color: '#f87171', borderColor: '#f8717155' }}>離脱</span>
                                                                <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#9ca3af' }}>
                                                                    {totalDropouts > 0 ? (d.dropout / totalDropouts * 100).toFixed(1) : '-'}%
                                                                </span>
                                                                {dropoutSignalMap[d.n1] && (
                                                                    <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: '#93c5fd' }}>
                                                                        滞在{formatDuration(dropoutSignalMap[d.n1].avgEngagementSec)}・スク{(dropoutSignalMap[d.n1].scrollRate * 100).toFixed(0)}%・Eng{(dropoutSignalMap[d.n1].engagementRate * 100).toFixed(0)}%
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className={styles.pathGroupBar}>
                                                                <div className={styles.pathGroupBarFill}
                                                                    style={{ width: `${barPct}%`, background: '#f8717180' }} />
                                                            </div>
                                                            <span className={styles.pathGroupCount}>{d.dropout.toLocaleString()}</span>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 2列ランキング */}
                    <div className={styles.rankingGrid}>
                        <div className={styles.rankingCard}>
                            <p className={styles.rankingTitle}>直前ページランキング</p>
                            <p className={styles.rankingSubtitle}>フォーム到達直前に見ていたページ</p>
                            <table className={styles.rankTable}>
                                <thead>
                                    <tr>
                                        <th className={styles.rankTh}>ページ</th>
                                        <th className={styles.rankThNum}>件数</th>
                                        <th className={styles.rankThNum}>割合</th>
                                        <th className={styles.rankThNum}>離脱率</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.referrerRanking.slice(0, 10).map((row, i) => {
                                        const er = data.pageExitRates[row.page ?? ''] ?? null
                                        return (
                                            <tr key={i} className={styles.rankRow}>
                                                <td className={styles.rankTd}>
                                                    <span className={styles.rankDot} style={{ background: nodeColor(row.page ?? '') }} />
                                                    {row.page}
                                                </td>
                                                <td className={styles.rankTdNum}>{row.views.toLocaleString()}</td>
                                                <td className={styles.rankTdNum}>{(row.rate * 100).toFixed(1)}%</td>
                                                <td className={styles.rankTdNum}>
                                                    {er !== null ? (
                                                        <span style={{
                                                            color: exitRateColor(er),
                                                            fontWeight: er >= 0.6 ? 700 : 400,
                                                        }}>
                                                            {(er * 100).toFixed(1)}%
                                                        </span>
                                                    ) : '-'}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className={styles.rankingCard}>
                            <p className={styles.rankingTitle}>チャネル別ランキング</p>
                            <p className={styles.rankingSubtitle}>フォーム到達ユーザーの流入チャネル</p>
                            <table className={styles.rankTable}>
                                <thead>
                                    <tr>
                                        <th className={styles.rankTh}>チャネル</th>
                                        <th className={styles.rankThNum}>件数</th>
                                        <th className={styles.rankThNum}>割合</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.channelRanking.slice(0, 10).map((row, i) => (
                                        <tr key={i} className={styles.rankRow}>
                                            <td className={styles.rankTd}>
                                                <span className={styles.rankDot} style={{ background: nodeColor(row.channel ?? '') }} />
                                                {row.channel}
                                            </td>
                                            <td className={styles.rankTdNum}>{row.views.toLocaleString()}</td>
                                            <td className={styles.rankTdNum}>{(row.rate * 100).toFixed(1)}%</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Gemini AI分析 */}
                    <div className={styles.pathSection}>
                        <div className={styles.pathSectionHeader}>
                            <div>
                                <p className={styles.sectionTitle}>離脱経路 AI分析</p>
                                <p className={styles.sectionNote}>上位20件の離脱経路パターンをもとに、離脱要因と改善提案を生成します</p>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            <button
                                onClick={handleGeminiAnalysis}
                                disabled={geminiLoading}
                                className={styles.button}
                                style={{ whiteSpace: 'nowrap' }}
                            >
                                {geminiLoading ? (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <AISpinner /> 分析中...
                                    </span>
                                ) : 'AIで分析'}
                            </button>
                        </div>
                        {geminiError && <p style={{ color: '#f87171', fontSize: '0.875rem', marginBottom: '0.5rem' }}>{geminiError}</p>}
                        {geminiResult && (
                            <div style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '0.5rem', padding: '1.25rem' }}>
                                {geminiResult.split('\n').map((line, i) => {
                                    const bold = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                    return line.trim() ? <p key={i} style={{ fontSize: '0.9rem', color: '#e5e7eb', lineHeight: 1.7, marginBottom: '0.5rem' }} dangerouslySetInnerHTML={{ __html: bold }} /> : null
                                })}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
