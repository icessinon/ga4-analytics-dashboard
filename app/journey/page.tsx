'use client'

import { useEffect, useState } from 'react'
import { useProduct } from '@/lib/contexts/ProductContext'
import AISpinner from '@/components/AISpinner'
import PageShell from '@/components/PageShell'
import FilterBar, { FilterField } from '@/components/FilterBar'
import PeriodSelect from '@/components/PeriodSelect'
import Alert from '@/components/Alert'
import { ui } from '@/components/ui'
import { usePeriodRange } from '@/hooks/usePeriodRange'
import { useReport } from '@/hooks/useReport'
import { fetchJson } from '@/lib/utils/fetch'
import JourneySankey from '@/components/journey/JourneySankey'
import { nodeColor, exitRateColor } from '@/components/journey/journeyColors'
import type { JourneyNode, JourneyFlow, PathFlow, DropoutPath, PageSignal, JourneyData } from '@/lib/services/journey/journeyTypes'
import styles from './JourneyPage.module.css'

const URL_PALETTE = ['#16a34a', '#3b82f6', '#d97706', '#8b5cf6', '#0891b2', '#ec4899', '#84cc16', '#f43f5e', '#0891b2', '#8b5cf6', '#16a34a', '#ea580c']
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
    // 旧実装は日付が空のとき API 既定（30daysAgo〜today）に任せていた。同じ既定で始める
    const periodState = usePeriodRange('30daysAgo')
    const startDate = periodState.range?.startDate
    const endDate = periodState.range?.endDate
    const [goalPath, setGoalPath] = useState('/members/signup')
    const [goalLabel, setGoalLabel] = useState('会員登録フォーム')
    const [presetIdx, setPresetIdx] = useState(0)
    const [deviceFilter, setDeviceFilter] = useState('')
    const [channelFilter, setChannelFilter] = useState<string | null>(null)
    const [pathView, setPathView] = useState<'table' | 'path'>('table')
    const [pathDataMode, setPathDataMode] = useState<'category' | 'url'>('category')
    const [dropoutView, setDropoutView] = useState<'table' | 'path'>('table')
    const [dropoutDataMode, setDropoutDataMode] = useState<'category' | 'url'>('category')
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

    // 分析実行ボタン型なので manual。前回結果は新しい結果が来るまで残す（旧実装と同じ）
    const report = useReport<JourneyData>('/api/journey', {
        body: {
            propertyId: currentProduct?.ga4PropertyId,
            goalPath,
            goalLabel,
            startDate,
            endDate,
            domain: currentProduct?.domain,
            deviceFilter: deviceFilter || undefined,
        },
        manual: true,
        keepPreviousData: true,
    })
    const { data, loading } = report

    // デバイス切替は、結果が出ている間だけ即再取得する。
    // body が state 由来なので、state 反映後の run() を effect で呼ぶ
    const [refetchAfterDevice, setRefetchAfterDevice] = useState(false)
    useEffect(() => {
        if (!refetchAfterDevice) return
        setRefetchAfterDevice(false)
        report.run()
    }, [refetchAfterDevice, report.run])

    async function handleSubmit() {
        if (!periodState.range) return
        setGeminiResult(null)
        setGeminiError(null)
        setChannelFilter(null)
        await report.run()
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
            const json = await fetchJson<{ analysis: string }>('/api/journey/gemini', {
                method: 'POST',
                body: JSON.stringify({
                    paths: topPaths,
                    totalUsers: data.totalUsers,
                    goalUsers: data.goalUsers ?? 0,
                    startDate,
                    endDate,
                }),
            })
            setGeminiResult(json.analysis)
        } catch (e) {
            setGeminiError(e instanceof Error ? e.message : 'エラーが発生しました')
        } finally {
            setGeminiLoading(false)
        }
    }

    function handleDeviceChange(device: string) {
        setDeviceFilter(device)
        if (data) {
            setChannelFilter(null)
            setRefetchAfterDevice(true)
        }
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
        <PageShell
            pageId="journey"
            requireProduct
            status={{ loading, error: report.error, source: 'ga4', onRetry: report.run }}
            keepChildrenWhileLoading
            controls={
                <div className={ui.card}>
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

                    <FilterBar onSubmit={handleSubmit} submitting={loading} disabled={!currentProduct || !periodState.range}>
                        <FilterField label="ゴールURLパス">
                            <input type="text" value={goalPath} onChange={(e) => setGoalPath(e.target.value)}
                                className={styles.goalInput} placeholder="/members/signup" required />
                        </FilterField>
                        <FilterField label="ゴール名（表示用）">
                            <input type="text" value={goalLabel} onChange={(e) => setGoalLabel(e.target.value)}
                                className={styles.goalInput} placeholder="会員登録フォーム" />
                        </FilterField>
                        <FilterField label="期間">
                            <PeriodSelect state={periodState} />
                        </FilterField>
                    </FilterBar>

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
            }
        >
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
                                            <td className={styles.rankTdNum} style={{ color: '#16a34a', fontWeight: 600 }}>
                                                {(fs.arrivalRate * 100).toFixed(2)}%
                                            </td>
                                            <td className={styles.rankTdNum} style={{ color: '#ef4444' }}>
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
                            <p className={`${styles.summaryValue} ${styles.summaryHighlight}`} style={{ color: '#ef4444' }}>
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
                                <p style={{ fontSize: '0.875rem', color: 'var(--gray-500)', padding: '0.5rem 0' }}>
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
                                                        <td className={styles.pathTdNum} style={{ color: 'var(--gray-400)' }}>
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
                                                                <span className={styles.pathStep} style={{ color: '#ef4444', borderColor: '#ef444460' }}>離脱</span>
                                                            </div>
                                                        </td>
                                                        <td className={styles.pathTdNum}>{d.dropout.toLocaleString()}</td>
                                                        <td className={styles.pathTdNum} style={{ color: 'var(--gray-400)' }}>{globalPct}%</td>
                                                        <td className={styles.pathTdNum} style={{ color: '#3b82f6' }}>
                                                            {sig ? formatDuration(sig.avgEngagementSec) : '-'}
                                                        </td>
                                                        <td className={styles.pathTdNum} style={{ color: '#3b82f6' }}>
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
                                                    <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--gray-400)' }}>
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
                                                                <span className={styles.pathStep} style={{ color: '#ef4444', borderColor: '#ef444455' }}>離脱</span>
                                                                <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--gray-400)' }}>
                                                                    {totalDropouts > 0 ? (d.dropout / totalDropouts * 100).toFixed(1) : '-'}%
                                                                </span>
                                                                {dropoutSignalMap[d.n1] && (
                                                                    <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: '#3b82f6' }}>
                                                                        滞在{formatDuration(dropoutSignalMap[d.n1].avgEngagementSec)}・スク{(dropoutSignalMap[d.n1].scrollRate * 100).toFixed(0)}%・Eng{(dropoutSignalMap[d.n1].engagementRate * 100).toFixed(0)}%
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className={styles.pathGroupBar}>
                                                                <div className={styles.pathGroupBarFill}
                                                                    style={{ width: `${barPct}%`, background: '#ef444480' }} />
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
                                className={ui.btnPrimary}
                                style={{ whiteSpace: 'nowrap' }}
                            >
                                {geminiLoading ? (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <AISpinner /> 分析中...
                                    </span>
                                ) : 'AIで分析'}
                            </button>
                        </div>
                        {geminiError && <Alert tone="error">{geminiError}</Alert>}
                        {geminiResult && (
                            <div style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '0.5rem', padding: '1.25rem' }}>
                                {geminiResult.split('\n').map((line, i) => {
                                    const bold = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                    return line.trim() ? <p key={i} style={{ fontSize: '0.9rem', color: 'var(--gray-200)', lineHeight: 1.7, marginBottom: '0.5rem' }} dangerouslySetInnerHTML={{ __html: bold }} /> : null
                                })}
                            </div>
                        )}
                    </div>
                </>
            )}
        </PageShell>
    )
}
