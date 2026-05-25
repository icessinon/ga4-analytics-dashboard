'use client'

import { useState, Fragment } from 'react'
import { useProduct } from '@/lib/contexts/ProductContext'
import BackLink from '@/components/BackLink'
import Loader from '@/components/Loader'
import AISpinner from '@/components/AISpinner/AISpinner'
import styles from './ScoringPage.module.css'

interface ScoreBreakdown {
    recency: number
    frequency: number
    engagement: number
    depth: number
}

interface ScoredSegment {
    name: string
    score: number
    rank: 'active' | 'dormant' | 'churn'
    activeUsers: number
    sessions: number
    pageViews: number
    sessionsPerUser: number
    pvPerSession: number
    engagementRate: number
    recentUserRatio: number
    scores: ScoreBreakdown
}

interface Summary {
    active: number
    dormant: number
    churn: number
}

const SEGMENT_OPTIONS = [
    { value: 'deviceCategory', label: 'デバイス' },
    { value: 'sessionSource', label: '流入元 (Source)' },
    { value: 'sessionMedium', label: '流入経路 (Medium)' },
    { value: 'operatingSystem', label: 'OS' },
    { value: 'browser', label: 'ブラウザ' },
    { value: 'country', label: '国' },
]

const PERIOD_OPTIONS = [
    { value: 30, label: '過去30日' },
    { value: 60, label: '過去60日' },
    { value: 90, label: '過去90日' },
]

const RANK_META = {
    active: { label: '活性', color: '#34d399', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.3)', icon: '🟢' },
    dormant: { label: '休眠', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)', icon: '🟡' },
    churn: { label: '離脱リスク', color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)', icon: '🔴' },
}

function ScoreBar({ value, max = 25, color }: { value: number; max?: number; color: string }) {
    return (
        <div className={styles.scoreBar}>
            <div className={styles.scoreBarFill} style={{ width: `${(value / max) * 100}%`, background: color }} />
        </div>
    )
}

export default function ScoringPage() {
    const { currentProduct } = useProduct()

    const [segmentDimension, setSegmentDimension] = useState('deviceCategory')
    const [periodDays, setPeriodDays] = useState(30)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [segments, setSegments] = useState<ScoredSegment[] | null>(null)
    const [summary, setSummary] = useState<Summary | null>(null)
    const [expandedRow, setExpandedRow] = useState<string | null>(null)
    const [geminiLoading, setGeminiLoading] = useState(false)
    const [geminiResult, setGeminiResult] = useState<string | null>(null)
    const [geminiError, setGeminiError] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!currentProduct) return
        setLoading(true)
        setError(null)
        setSegments(null)
        setSummary(null)

        try {
            const res = await fetch('/api/user/scoring', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    propertyId: currentProduct.ga4PropertyId,
                    segmentDimension,
                    periodDays,
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.message || data.error || '取得に失敗しました')
            setSegments(data.segments)
            setSummary(data.summary)
            setGeminiResult(null)
            setGeminiError(null)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'エラーが発生しました')
        } finally {
            setLoading(false)
        }
    }

    const handleGeminiAnalysis = async () => {
        if (!segments) return
        setGeminiLoading(true)
        setGeminiError(null)
        setGeminiResult(null)
        try {
            const res = await fetch('/api/user/scoring/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    segments: segments.map((s) => ({
                        name: s.name, score: s.score, rank: s.rank,
                        activeUsers: s.activeUsers, sessionsPerUser: s.sessionsPerUser,
                        pvPerSession: s.pvPerSession, engagementRate: s.engagementRate,
                        recentUserRatio: s.recentUserRatio,
                    })),
                    segmentDimension,
                    periodDays,
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

    if (!currentProduct) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h1 className={styles.title}>活動スコアリング</h1>
                    <BackLink href="/user">ユーザー分析に戻る</BackLink>
                </div>
                <div className={styles.warningBox}>
                    プロダクトを選択してください。右上のドロップダウンから選択できます。
                </div>
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>活動スコアリング</h1>
                    <p className={styles.subtitle}>
                        セグメントごとの行動データから活性度を0〜100点でスコアリングし、施策優先度を可視化します
                    </p>
                </div>
                <BackLink href="/user">ユーザー分析に戻る</BackLink>
            </div>

            {/* スコアリングの説明 */}
            <div className={styles.legendSection}>
                <div className={styles.legendItem}>
                    <span className={styles.legendIcon}>🟢</span>
                    <span className={styles.legendLabel}>活性（70〜100点）</span>
                    <span className={styles.legendDesc}>直近の来訪が多く、深くエンゲージしている</span>
                </div>
                <div className={styles.legendItem}>
                    <span className={styles.legendIcon}>🟡</span>
                    <span className={styles.legendLabel}>休眠（30〜69点）</span>
                    <span className={styles.legendDesc}>来訪はあるが頻度・深度が低下傾向</span>
                </div>
                <div className={styles.legendItem}>
                    <span className={styles.legendIcon}>🔴</span>
                    <span className={styles.legendLabel}>離脱リスク（0〜29点）</span>
                    <span className={styles.legendDesc}>直近の来訪が少なく、エンゲージメントが低い</span>
                </div>
            </div>

            {/* 条件フォーム */}
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>条件</h2>
                <form onSubmit={handleSubmit}>
                    <div className={styles.formGrid}>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>セグメント軸</label>
                            <select
                                value={segmentDimension}
                                onChange={(e) => setSegmentDimension(e.target.value)}
                                className={styles.formSelect}
                            >
                                {SEGMENT_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>集計期間</label>
                            <select
                                value={periodDays}
                                onChange={(e) => setPeriodDays(Number(e.target.value))}
                                className={styles.formSelect}
                            >
                                {PERIOD_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className={styles.formActions}>
                        <button type="submit" disabled={loading} className="executionButton">
                            {loading ? '分析中...' : 'スコアリングを実行'}
                        </button>
                    </div>
                </form>
            </div>

            {error && (
                <div className={styles.errorBox}>
                    <p className={styles.errorTitle}>エラー</p>
                    <p>{error}</p>
                </div>
            )}

            {loading && (
                <div className={styles.loaderContainer}>
                    <Loader />
                    <span>スコアを計算中...</span>
                </div>
            )}

            {summary && segments && !loading && (
                <>
                    {/* サマリーカード */}
                    <div className={styles.summaryRow}>
                        {(['active', 'dormant', 'churn'] as const).map((rank) => {
                            const meta = RANK_META[rank]
                            const count = summary[rank]
                            const segs = segments.filter((s) => s.rank === rank)
                            const totalUsers = segs.reduce((sum, s) => sum + s.activeUsers, 0)
                            return (
                                <div
                                    key={rank}
                                    className={styles.summaryCard}
                                    style={{ borderColor: meta.border, background: meta.bg }}
                                >
                                    <p className={styles.summaryIcon}>{meta.icon}</p>
                                    <p className={styles.summaryRank} style={{ color: meta.color }}>{meta.label}</p>
                                    <p className={styles.summaryCount}>{count} セグメント</p>
                                    <p className={styles.summaryUsers}>{totalUsers.toLocaleString()} ユーザー</p>
                                </div>
                            )
                        })}
                    </div>

                    {/* スコアテーブル */}
                    <div className={styles.section}>
                        <h2 className={styles.sectionTitle}>
                            {SEGMENT_OPTIONS.find((o) => o.value === segmentDimension)?.label ?? segmentDimension} 別スコア
                        </h2>

                        {segments.length === 0 ? (
                            <p className={styles.empty}>データがありません。期間を変更して再試行してください。</p>
                        ) : (
                            <div className={styles.tableWrapper}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th className={styles.thLabel}>セグメント</th>
                                            <th className={styles.thCenter}>ランク</th>
                                            <th className={styles.thNum}>スコア</th>
                                            <th className={styles.thNum}>ユーザー数</th>
                                            <th className={styles.thNum}>直近7日比</th>
                                            <th className={styles.thNum}>セッション/人</th>
                                            <th className={styles.thNum}>PV/セッション</th>
                                            <th className={styles.thNum}>EG率</th>
                                            <th className={styles.thCenter}>詳細</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {segments.map((seg) => {
                                            const meta = RANK_META[seg.rank]
                                            const isExpanded = expandedRow === seg.name
                                            return (
                                                <Fragment key={seg.name}>
                                                    <tr
                                                        className={styles.dataRow}
                                                        style={{ borderLeft: `3px solid ${meta.color}` }}
                                                    >
                                                        <td className={styles.tdLabel}>{seg.name}</td>
                                                        <td className={styles.tdCenter}>
                                                            <span
                                                                className={styles.rankBadge}
                                                                style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}
                                                            >
                                                                {meta.label}
                                                            </span>
                                                        </td>
                                                        <td className={styles.tdNum}>
                                                            <span className={styles.scoreValue} style={{ color: meta.color }}>
                                                                {seg.score}
                                                            </span>
                                                            <span className={styles.scoreMax}>/100</span>
                                                        </td>
                                                        <td className={styles.tdNum}>{seg.activeUsers.toLocaleString()}</td>
                                                        <td className={styles.tdNum}>{(seg.recentUserRatio * 100).toFixed(0)}%</td>
                                                        <td className={styles.tdNum}>{seg.sessionsPerUser.toFixed(1)}</td>
                                                        <td className={styles.tdNum}>{seg.pvPerSession.toFixed(1)}</td>
                                                        <td className={styles.tdNum}>{(seg.engagementRate * 100).toFixed(1)}%</td>
                                                        <td className={styles.tdCenter}>
                                                            <button
                                                                className={styles.expandBtn}
                                                                onClick={() => setExpandedRow(isExpanded ? null : seg.name)}
                                                            >
                                                                {isExpanded ? '▲' : '▼'}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                    {isExpanded && (
                                                        <tr className={styles.detailRow}>
                                                            <td colSpan={9} className={styles.detailCell}>
                                                                <div className={styles.detailGrid}>
                                                                    <div className={styles.detailItem}>
                                                                        <p className={styles.detailLabel}>直近性（Recency）</p>
                                                                        <ScoreBar value={seg.scores.recency} color="#818cf8" />
                                                                        <p className={styles.detailScore}>{seg.scores.recency} / 25点</p>
                                                                        <p className={styles.detailNote}>直近7日のユーザー比率: {(seg.recentUserRatio * 100).toFixed(1)}%</p>
                                                                    </div>
                                                                    <div className={styles.detailItem}>
                                                                        <p className={styles.detailLabel}>頻度（Frequency）</p>
                                                                        <ScoreBar value={seg.scores.frequency} color="#34d399" />
                                                                        <p className={styles.detailScore}>{seg.scores.frequency} / 25点</p>
                                                                        <p className={styles.detailNote}>セッション/人: {seg.sessionsPerUser.toFixed(2)}</p>
                                                                    </div>
                                                                    <div className={styles.detailItem}>
                                                                        <p className={styles.detailLabel}>熱量（Engagement）</p>
                                                                        <ScoreBar value={seg.scores.engagement} color="#fbbf24" />
                                                                        <p className={styles.detailScore}>{seg.scores.engagement} / 25点</p>
                                                                        <p className={styles.detailNote}>エンゲージメント率: {(seg.engagementRate * 100).toFixed(1)}%</p>
                                                                    </div>
                                                                    <div className={styles.detailItem}>
                                                                        <p className={styles.detailLabel}>深度（Depth）</p>
                                                                        <ScoreBar value={seg.scores.depth} color="#f87171" />
                                                                        <p className={styles.detailScore}>{seg.scores.depth} / 25点</p>
                                                                        <p className={styles.detailNote}>PV/セッション: {seg.pvPerSession.toFixed(2)}</p>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </Fragment>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <p className={styles.note}>
                            * スコアはこのセグメント軸内での相対評価です（最高スコアのセグメントを100点基準に正規化）。
                            直近7日比 = 全期間ユーザー中、直近7日に来訪した割合。
                        </p>
                    </div>

                    {/* Gemini AI診断 */}
                    <div className={styles.section}>
                        <h2 className={styles.sectionTitle}>AIによるセグメント診断</h2>
                        <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '1rem' }}>
                            スコアリング結果をもとに、活性・休眠・離脱リスクの行動パターン差異と施策を生成します
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            <button
                                onClick={handleGeminiAnalysis}
                                disabled={geminiLoading}
                                className="executionButton"
                                style={{ whiteSpace: 'nowrap', opacity: geminiLoading ? 0.6 : 1, cursor: geminiLoading ? 'not-allowed' : 'pointer' }}
                            >
                                {geminiLoading ? (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <AISpinner /> 診断中...
                                    </span>
                                ) : 'AIで診断'}
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
