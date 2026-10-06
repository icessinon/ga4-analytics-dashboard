'use client'

import { useEffect, useState, Fragment } from 'react'
import { useProduct } from '@/lib/contexts/ProductContext'
import AISpinner from '@/components/AISpinner'
import InfoTooltip from '@/components/InfoTooltip'
import PageShell from '@/components/PageShell'
import FilterBar, { FilterField } from '@/components/FilterBar'
import PeriodSelect from '@/components/PeriodSelect'
import Alert from '@/components/Alert'
import { ui } from '@/components/ui'
import { usePeriodRange } from '@/hooks/usePeriodRange'
import { useReport } from '@/hooks/useReport'
import { fetchJson } from '@/lib/utils/fetch'
import { calculateDaysBetween } from '@/lib/utils/date'
import { type PeriodOption } from '@/lib/utils/period'
import { CHART_COLORS, STATUS_COLORS } from '@/lib/constants/chartColors'
import type { ScoreRank, ScoringResponse } from '@/lib/services/user/scoringTypes'
import styles from './ScoringPage.module.css'

const SEGMENT_OPTIONS = [
    { value: 'deviceCategory', label: 'デバイス' },
    { value: 'sessionSource', label: '流入元 (Source)' },
    { value: 'sessionMedium', label: '流入経路 (Medium)' },
    { value: 'operatingSystem', label: 'OS' },
    { value: 'browser', label: 'ブラウザ' },
    { value: 'country', label: '国' },
]

const PERIOD_OPTIONS: PeriodOption[] = [
    { value: '30daysAgo', label: '過去30日' },
    { value: '60daysAgo', label: '過去60日' },
    { value: '90daysAgo', label: '過去90日' },
]

const RANK_META: Record<ScoreRank, { label: string; color: string; bg: string; border: string; icon: string }> = {
    active: { label: '活性', color: STATUS_COLORS.good, bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.3)', icon: '🟢' },
    dormant: { label: '休眠', color: STATUS_COLORS.warn, bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)', icon: '🟡' },
    churn: { label: '離脱リスク', color: STATUS_COLORS.bad, bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)', icon: '🔴' },
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
    const periodState = usePeriodRange('30daysAgo')
    const { range } = periodState
    const [expandedRow, setExpandedRow] = useState<string | null>(null)

    // 軸か期間を変えると即再取得（旧実装は「スコアリングを実行」ボタン。GA4 2 リクエストと軽い）
    const report = useReport<ScoringResponse>('/api/user/scoring', {
        body: { propertyId: currentProduct?.ga4PropertyId, segmentDimension, startDate: range?.startDate, endDate: range?.endDate },
        enabled: !!currentProduct && !!range,
    })
    const segments = report.data?.segments ?? null
    const summary = report.data?.summary ?? null

    const [geminiLoading, setGeminiLoading] = useState(false)
    const [geminiResult, setGeminiResult] = useState<string | null>(null)
    const [geminiError, setGeminiError] = useState<string | null>(null)
    useEffect(() => { setGeminiResult(null); setGeminiError(null); setExpandedRow(null) }, [report.data])

    const handleGeminiAnalysis = async () => {
        if (!segments || !range) return
        setGeminiLoading(true)
        setGeminiError(null)
        setGeminiResult(null)
        try {
            const json = await fetchJson<{ analysis: string }>('/api/user/scoring/gemini', {
                method: 'POST',
                body: JSON.stringify({
                    segments: segments.map((s) => ({
                        name: s.name, score: s.score, rank: s.rank,
                        activeUsers: s.activeUsers, sessionsPerUser: s.sessionsPerUser,
                        pvPerSession: s.pvPerSession, engagementRate: s.engagementRate,
                        recentUserRatio: s.recentUserRatio,
                    })),
                    segmentDimension,
                    periodDays: calculateDaysBetween(range.startDate, range.endDate),
                }),
            })
            setGeminiResult(json.analysis)
        } catch (e) {
            setGeminiError(e instanceof Error ? e.message : 'エラーが発生しました')
        } finally {
            setGeminiLoading(false)
        }
    }

    return (
        <PageShell
            pageId="userScoring"
            requireProduct
            status={{ loading: report.loading, error: report.error, source: 'ga4', onRetry: report.run }}
            controls={
                <>
                    <div className={styles.legendSection}>
                        {(['active', 'dormant', 'churn'] as const).map((rank) => (
                            <div key={rank} className={styles.legendItem}>
                                <span className={styles.legendIcon}>{RANK_META[rank].icon}</span>
                                <span className={styles.legendLabel}>
                                    {RANK_META[rank].label}（{rank === 'active' ? '70〜100' : rank === 'dormant' ? '30〜69' : '0〜29'}点）
                                </span>
                                <span className={styles.legendDesc}>
                                    {rank === 'active' ? '直近の来訪が多く、深くエンゲージしている' : rank === 'dormant' ? '来訪はあるが頻度・深度が低下傾向' : '直近の来訪が少なく、エンゲージメントが低い'}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className={ui.card}>
                        <FilterBar>
                            <FilterField label="セグメント軸">
                                <select value={segmentDimension} onChange={(e) => setSegmentDimension(e.target.value)} className={ui.select}>
                                    {SEGMENT_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                            </FilterField>
                            <FilterField label="集計期間">
                                <PeriodSelect state={periodState} options={PERIOD_OPTIONS} />
                            </FilterField>
                        </FilterBar>
                    </div>
                </>
            }
        >
            {summary && segments && (
                <>
                    <div className={styles.summaryRow}>
                        {(['active', 'dormant', 'churn'] as const).map((rank) => {
                            const meta = RANK_META[rank]
                            const segs = segments.filter((s) => s.rank === rank)
                            const totalUsers = segs.reduce((sum, s) => sum + s.activeUsers, 0)
                            return (
                                <div key={rank} className={styles.summaryCard} style={{ borderColor: meta.border, background: meta.bg }}>
                                    <p className={styles.summaryIcon}>{meta.icon}</p>
                                    <p className={styles.summaryRank} style={{ color: meta.color }}>{meta.label}</p>
                                    <p className={styles.summaryCount}>{summary[rank]} セグメント</p>
                                    <p className={styles.summaryUsers}>{totalUsers.toLocaleString()} ユーザー</p>
                                </div>
                            )
                        })}
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>
                            {SEGMENT_OPTIONS.find((o) => o.value === segmentDimension)?.label ?? segmentDimension} 別スコア
                        </h2>

                        {segments.length === 0 ? (
                            <p className={ui.empty}>データがありません。期間を変更して再試行してください。</p>
                        ) : (
                            <div className={ui.tableWrap}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th className={styles.thLabel}>セグメント</th>
                                            <th className={styles.thCenter}>ランク</th>
                                            <th className={styles.thNum}>スコア<InfoTooltip text="0〜100点のスコア。直近性・頻度・熱量・深度の4指標（各25点）を合算して算出。" direction="bottom" /></th>
                                            <th className={styles.thNum}>ユーザー数</th>
                                            <th className={styles.thNum}>直近7日比<InfoTooltip text="全期間ユーザーのうち直近7日以内に訪問したユーザーの割合（Recency指標の元データ）。" direction="bottom" /></th>
                                            <th className={styles.thNum}>セッション/人<InfoTooltip text="1ユーザーあたりの平均セッション数（sessions ÷ activeUsers）。訪問頻度の指標（Frequency）。" direction="bottom" /></th>
                                            <th className={styles.thNum}>PV/セッション<InfoTooltip text="1セッションあたりの平均ページビュー数。コンテンツ回遊の深さを示す（Depth指標）。" direction="bottom" /></th>
                                            <th className={styles.thNum}>EG率<InfoTooltip text="エンゲージメント率（engagedSessions ÷ sessions）。熱量を示す指標（Engagement）。" direction="bottom" /></th>
                                            <th className={styles.thCenter}>詳細</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {segments.map((seg) => {
                                            const meta = RANK_META[seg.rank]
                                            const isExpanded = expandedRow === seg.name
                                            return (
                                                <Fragment key={seg.name}>
                                                    <tr className={styles.dataRow} style={{ borderLeft: `3px solid ${meta.color}` }}>
                                                        <td className={styles.tdLabel}>{seg.name}</td>
                                                        <td className={styles.tdCenter}>
                                                            <span className={styles.rankBadge} style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}>
                                                                {meta.label}
                                                            </span>
                                                        </td>
                                                        <td className={styles.tdNum}>
                                                            <span className={styles.scoreValue} style={{ color: meta.color }}>{seg.score}</span>
                                                            <span className={styles.scoreMax}>/100</span>
                                                        </td>
                                                        <td className={styles.tdNum}>{seg.activeUsers.toLocaleString()}</td>
                                                        <td className={styles.tdNum}>{(seg.recentUserRatio * 100).toFixed(0)}%</td>
                                                        <td className={styles.tdNum}>{seg.sessionsPerUser.toFixed(1)}</td>
                                                        <td className={styles.tdNum}>{seg.pvPerSession.toFixed(1)}</td>
                                                        <td className={styles.tdNum}>{(seg.engagementRate * 100).toFixed(1)}%</td>
                                                        <td className={styles.tdCenter}>
                                                            <button type="button" className={styles.expandBtn} onClick={() => setExpandedRow(isExpanded ? null : seg.name)} aria-expanded={isExpanded}>
                                                                {isExpanded ? '▲' : '▼'}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                    {isExpanded && (
                                                        <tr className={styles.detailRow}>
                                                            <td colSpan={9} className={styles.detailCell}>
                                                                <div className={styles.detailGrid}>
                                                                    <div>
                                                                        <p className={styles.detailLabel}>直近性（Recency）<InfoTooltip text="直近7日以内に来訪したユーザーの比率が高いほど高得点。最大25点。" /></p>
                                                                        <ScoreBar value={seg.scores.recency} color={CHART_COLORS.violet} />
                                                                        <p className={styles.detailScore}>{seg.scores.recency} / 25点</p>
                                                                        <p className={styles.detailNote}>直近7日のユーザー比率: {(seg.recentUserRatio * 100).toFixed(1)}%</p>
                                                                    </div>
                                                                    <div>
                                                                        <p className={styles.detailLabel}>頻度（Frequency）<InfoTooltip text="セッション数 ÷ ユーザー数（訪問頻度）が高いほど高得点。最大25点。" /></p>
                                                                        <ScoreBar value={seg.scores.frequency} color={CHART_COLORS.green} />
                                                                        <p className={styles.detailScore}>{seg.scores.frequency} / 25点</p>
                                                                        <p className={styles.detailNote}>セッション/人: {seg.sessionsPerUser.toFixed(2)}</p>
                                                                    </div>
                                                                    <div>
                                                                        <p className={styles.detailLabel}>熱量（Engagement）<InfoTooltip text="エンゲージメント率（エンゲージドセッション ÷ 全セッション）が高いほど高得点。最大25点。" /></p>
                                                                        <ScoreBar value={seg.scores.engagement} color={CHART_COLORS.amber} />
                                                                        <p className={styles.detailScore}>{seg.scores.engagement} / 25点</p>
                                                                        <p className={styles.detailNote}>エンゲージメント率: {(seg.engagementRate * 100).toFixed(1)}%</p>
                                                                    </div>
                                                                    <div>
                                                                        <p className={styles.detailLabel}>深度（Depth）<InfoTooltip text="PV ÷ セッション数（1セッションで何ページ閲覧するか）が高いほど高得点。最大25点。" /></p>
                                                                        <ScoreBar value={seg.scores.depth} color={CHART_COLORS.red} />
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

                        <p className={ui.tableNote}>
                            * スコアはこのセグメント軸内での相対評価です（最高スコアのセグメントを100点基準に正規化）。
                            直近7日比 = 全期間ユーザー中、直近7日に来訪した割合。
                        </p>
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>AIによるセグメント診断</h2>
                        <p className={ui.sectionNote}>スコアリング結果をもとに、活性・休眠・離脱リスクの行動パターン差異と施策を生成します</p>
                        <div className={ui.controls}>
                            <button type="button" onClick={handleGeminiAnalysis} disabled={geminiLoading} className={ui.btnPrimary}>
                                {geminiLoading ? <span className={ui.inlineLoading}><AISpinner /> 診断中...</span> : 'AIで診断'}
                            </button>
                        </div>
                        {geminiError && <Alert tone="error">{geminiError}</Alert>}
                        {geminiResult && (
                            <div className={ui.aiResult}>
                                {geminiResult.split('\n').map((line, i) => {
                                    const bold = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
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
