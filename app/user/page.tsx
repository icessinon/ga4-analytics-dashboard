'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import DateInput from '@/components/DateInput'
import BackLink from '@/components/BackLink'
import Loader from '@/components/Loader'
import { useProduct } from '@/lib/contexts/ProductContext'
import styles from './UserPage.module.css'

// ────────────────────────────────────────────────────────────
// 型定義
// ────────────────────────────────────────────────────────────
interface Segment {
    deviceCategory: string
    browser: string
    operatingSystem: string
    country: string
    sessionSource: string
    sessionMedium: string
    lastDate: string
    totalUsers: number
    totalSessions: number
    totalPageViews: number
    totalEvents: number
}

interface UserEvent {
    sortKey: string
    date: string
    time: string
    eventName: string
    pagePath: string
    pageTitle: string
    sessionSource: string
    deviceCategory: string
    eventCount: number
    userCount: number
}

// ────────────────────────────────────────────────────────────
// ユーティリティ
// ────────────────────────────────────────────────────────────
function getDefaultDateRange() {
    const today = new Date()
    const past = new Date(today)
    past.setDate(today.getDate() - 29)
    const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { startDate: fmt(past), endDate: fmt(today) }
}

function eventBadgeClass(eventName: string): string {
    if (eventName === 'page_view') return styles.badgePageView
    if (['click', 'scroll'].includes(eventName)) return styles.badgeClick
    if (['session_start', 'first_visit', 'user_engagement'].includes(eventName)) return styles.badgeSession
    if (['generate_lead', 'purchase', 'sign_up', 'form_submit', 'conversion'].some((k) => eventName.includes(k)))
        return styles.badgeConversion
    return styles.badgeDefault
}

function notSet(v: string) {
    return !v || v === '(not set)'
}

function segmentLabel(s: Segment): string {
    const parts = [
        s.deviceCategory,
        s.browser,
        s.operatingSystem,
        s.sessionSource && !notSet(s.sessionSource) ? `${s.sessionSource}/${s.sessionMedium}` : null,
        s.country && !notSet(s.country) ? s.country : null,
    ].filter(Boolean)
    return parts.join(' · ')
}

// ────────────────────────────────────────────────────────────
// メインコンポーネント
// ────────────────────────────────────────────────────────────
export default function UserPage() {
    const { currentProduct } = useProduct()
    const router = useRouter()
    const { startDate: defaultStart, endDate: defaultEnd } = getDefaultDateRange()

    // 共通フォーム
    const [startDate, setStartDate] = useState(defaultStart)
    const [endDate, setEndDate] = useState(defaultEnd)
    const [accessToken, setAccessToken] = useState('')

    // セグメント一覧
    const [listLoading, setListLoading] = useState(false)
    const [segments, setSegments] = useState<Segment[] | null>(null)
    const [listError, setListError] = useState<string | null>(null)
    const [listSearch, setListSearch] = useState('')
    const [sortCol, setSortCol] = useState<keyof Segment>('totalUsers')
    const [sortAsc, setSortAsc] = useState(false)

    // タイムライン
    const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null)
    const [timelineLoading, setTimelineLoading] = useState(false)
    const [events, setEvents] = useState<UserEvent[] | null>(null)
    const [timelineError, setTimelineError] = useState<string | null>(null)
    const [eventFilter, setEventFilter] = useState('')
    const [tlSearch, setTlSearch] = useState('')

    // ─── セグメント一覧取得 ───
    const fetchSegments = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!currentProduct) return
        setListLoading(true)
        setListError(null)
        setSegments(null)
        setSelectedSegment(null)
        setEvents(null)

        try {
            const res = await fetch('/api/user/list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    propertyId: currentProduct.ga4PropertyId,
                    startDate,
                    endDate,
                    accessToken: accessToken || undefined,
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.message || data.error || '取得に失敗しました')
            setSegments(data.segments)
        } catch (err) {
            setListError(err instanceof Error ? err.message : 'エラーが発生しました')
        } finally {
            setListLoading(false)
        }
    }

    // ─── タイムライン取得 ───
    const fetchTimeline = async (seg: Segment) => {
        setSelectedSegment(seg)
        setTimelineLoading(true)
        setTimelineError(null)
        setEvents(null)
        setEventFilter('')
        setTlSearch('')

        try {
            const res = await fetch('/api/user/timeline', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    propertyId: currentProduct!.ga4PropertyId,
                    startDate,
                    endDate,
                    accessToken: accessToken || undefined,
                    deviceCategory:  seg.deviceCategory,
                    browser:         seg.browser,
                    operatingSystem: seg.operatingSystem,
                    country:         seg.country,
                    sessionSource:   seg.sessionSource,
                    sessionMedium:   seg.sessionMedium,
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.message || data.error || '取得に失敗しました')
            setEvents(data.events)
        } catch (err) {
            setTimelineError(err instanceof Error ? err.message : 'エラーが発生しました')
        } finally {
            setTimelineLoading(false)
        }
    }

    // ─── 一覧フィルタ・ソート ───
    const sortedSegments = useMemo(() => {
        if (!segments) return []
        let list = segments
        if (listSearch) {
            const q = listSearch.toLowerCase()
            list = list.filter((s) =>
                [s.browser, s.operatingSystem, s.deviceCategory, s.sessionSource, s.sessionMedium, s.country]
                    .some((v) => v.toLowerCase().includes(q))
            )
        }
        return [...list].sort((a, b) => {
            const av = a[sortCol] ?? ''
            const bv = b[sortCol] ?? ''
            const cmp = typeof av === 'number' && typeof bv === 'number'
                ? av - bv
                : String(av).localeCompare(String(bv))
            return sortAsc ? cmp : -cmp
        })
    }, [segments, listSearch, sortCol, sortAsc])

    const handleSort = (key: keyof Segment) => {
        if (sortCol === key) setSortAsc((p) => !p)
        else { setSortCol(key); setSortAsc(false) }
    }
    const sortIcon = (key: keyof Segment) => sortCol === key ? (sortAsc ? ' ▲' : ' ▼') : ''

    // ─── タイムラインフィルタ ───
    const { filteredEvents, groupedByDate, uniqueEventNames } = useMemo(() => {
        if (!events) return { filteredEvents: [], groupedByDate: {}, uniqueEventNames: [] }
        const uniqueEventNames = [...new Set(events.map((e) => e.eventName))].sort()
        let filtered = events
        if (eventFilter) filtered = filtered.filter((e) => e.eventName === eventFilter)
        if (tlSearch) {
            const q = tlSearch.toLowerCase()
            filtered = filtered.filter((e) =>
                e.pagePath.toLowerCase().includes(q) ||
                e.pageTitle.toLowerCase().includes(q) ||
                e.eventName.toLowerCase().includes(q)
            )
        }
        const groupedByDate: Record<string, UserEvent[]> = {}
        for (const ev of filtered) {
            if (!groupedByDate[ev.date]) groupedByDate[ev.date] = []
            groupedByDate[ev.date].push(ev)
        }
        return { filteredEvents: filtered, groupedByDate, uniqueEventNames }
    }, [events, eventFilter, tlSearch])

    // ────────────────────────────────────────────────────────
    // レンダリング
    // ────────────────────────────────────────────────────────
    if (!currentProduct) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h1 className={styles.title}>ユーザー行動分析</h1>
                    <BackLink href="/">ダッシュボードに戻る</BackLink>
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
                    <h1 className={styles.title}>ユーザー行動分析</h1>
                    <p className={styles.subtitle}>
                        デバイス・ブラウザ・OS・流入元ごとのセグメント一覧を表示し、クリックで行動タイムラインを確認
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                        <button onClick={() => router.push('/user/segment-builder')} className={styles.subNavBtn}>
                            ユーザーリスト抽出
                        </button>
                        <button onClick={() => router.push('/user/scoring')} className={styles.subNavBtn}>
                            活動スコアリング
                        </button>
                        <button onClick={() => router.push('/user/cohort')} className={styles.subNavBtn}>
                            コホートリテンション
                        </button>
                        <button onClick={() => router.push('/user/stickiness')} className={styles.subNavBtn}>
                            スティッキネス
                        </button>
                    </div>
                </div>
                <BackLink href="/">ダッシュボードに戻る</BackLink>
            </div>

            {/* 検索フォーム */}
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>期間</h2>
                <form onSubmit={fetchSegments}>
                    <div className={styles.formGrid}>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>開始日</label>
                            <DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)} className={styles.formInput} required />
                        </div>
                        <div className={styles.formField}>
                            <label className={styles.formLabel}>終了日</label>
                            <DateInput value={endDate} onChange={(e) => setEndDate(e.target.value)} className={styles.formInput} required />
                        </div>
                        <div className={styles.formFieldFull}>
                            <label className={styles.formLabel}>GA4アクセストークン（オプション）</label>
                            <input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="サービスアカウントを使用する場合は空欄でOK" className={styles.formInput} />
                        </div>
                    </div>
                    <div className={styles.formActions}>
                        <button type="submit" disabled={listLoading} className="executionButton">
                            {listLoading ? '取得中...' : 'セグメント一覧を取得'}
                        </button>
                    </div>
                </form>
            </div>

            {listError && (
                <div className={styles.errorBox}>
                    <p className={styles.errorTitle}>エラー</p>
                    <p>{listError}</p>
                </div>
            )}

            {listLoading && (
                <div className={styles.loaderContainer}>
                    <Loader />
                    <span>セグメント一覧を取得中...</span>
                </div>
            )}

            {/* セグメント一覧 */}
            {segments && !listLoading && (
                <div className={styles.section}>
                    <div className={styles.resultHeader}>
                        <p className={styles.resultTitle}>セグメント一覧</p>
                        <p className={styles.resultMeta}>{sortedSegments.length} 件 / 全 {segments.length} 件</p>
                    </div>
                    <div className={styles.filterBar}>
                        <input
                            type="text"
                            value={listSearch}
                            onChange={(e) => setListSearch(e.target.value)}
                            placeholder="ブラウザ・OS・流入元・国で絞り込み"
                            className={styles.filterInput}
                            style={{ width: 260 }}
                        />
                    </div>
                    <div className={styles.tableWrapper}>
                        <table className={styles.userTable}>
                            <thead className={styles.userTableHead}>
                                <tr>
                                    <th onClick={() => handleSort('totalUsers')}>ユーザー数{sortIcon('totalUsers')}</th>
                                    <th onClick={() => handleSort('totalSessions')}>セッション{sortIcon('totalSessions')}</th>
                                    <th onClick={() => handleSort('totalPageViews')}>PV{sortIcon('totalPageViews')}</th>
                                    <th onClick={() => handleSort('totalEvents')}>イベント数{sortIcon('totalEvents')}</th>
                                    <th onClick={() => handleSort('deviceCategory')}>デバイス{sortIcon('deviceCategory')}</th>
                                    <th onClick={() => handleSort('browser')}>ブラウザ{sortIcon('browser')}</th>
                                    <th onClick={() => handleSort('operatingSystem')}>OS{sortIcon('operatingSystem')}</th>
                                    <th onClick={() => handleSort('sessionSource')}>流入元{sortIcon('sessionSource')}</th>
                                    <th onClick={() => handleSort('country')}>国{sortIcon('country')}</th>
                                    <th onClick={() => handleSort('lastDate')}>最終日{sortIcon('lastDate')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedSegments.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} className={styles.userTableCell} style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}>
                                            データがありません
                                        </td>
                                    </tr>
                                ) : sortedSegments.map((seg, i) => (
                                    <tr
                                        key={i}
                                        className={`${styles.userTableRow} ${selectedSegment === seg ? styles.userTableRowSelected : ''}`}
                                        onClick={() => fetchTimeline(seg)}
                                        title="クリックしてタイムラインを表示"
                                    >
                                        <td className={`${styles.userTableCell} ${styles.numCell}`}>{seg.totalUsers.toLocaleString()}</td>
                                        <td className={`${styles.userTableCell} ${styles.numCell}`}>{seg.totalSessions.toLocaleString()}</td>
                                        <td className={`${styles.userTableCell} ${styles.numCell}`}>{seg.totalPageViews.toLocaleString()}</td>
                                        <td className={`${styles.userTableCell} ${styles.numCell}`}>{seg.totalEvents.toLocaleString()}</td>
                                        <td className={styles.userTableCell}>
                                            {!notSet(seg.deviceCategory) && <span className={`${styles.chip} ${styles.chipDevice}`}>{seg.deviceCategory}</span>}
                                        </td>
                                        <td className={styles.userTableCell}>
                                            {!notSet(seg.browser) && <span className={`${styles.chip} ${styles.chipBrowser}`}>{seg.browser}</span>}
                                        </td>
                                        <td className={styles.userTableCell}>
                                            {!notSet(seg.operatingSystem) && <span className={`${styles.chip} ${styles.chipOS}`}>{seg.operatingSystem}</span>}
                                        </td>
                                        <td className={styles.userTableCell}>
                                            {!notSet(seg.sessionSource) && (
                                                <span className={`${styles.chip} ${styles.chipSource}`}>
                                                    {seg.sessionSource}{!notSet(seg.sessionMedium) ? ` / ${seg.sessionMedium}` : ''}
                                                </span>
                                            )}
                                        </td>
                                        <td className={styles.userTableCell}>{!notSet(seg.country) ? seg.country : '-'}</td>
                                        <td className={styles.userTableCell}>{seg.lastDate}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* タイムライン */}
            {selectedSegment && (
                <div className={styles.section}>
                    <div className={styles.selectedUserBanner}>
                        <div>
                            <span className={styles.selectedUserLabel}>選択中のセグメント: </span>
                            <span className={styles.selectedUserId}>{segmentLabel(selectedSegment)}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            {!notSet(selectedSegment.deviceCategory) && <span className={`${styles.chip} ${styles.chipDevice}`}>{selectedSegment.deviceCategory}</span>}
                            {!notSet(selectedSegment.browser) && <span className={`${styles.chip} ${styles.chipBrowser}`}>{selectedSegment.browser}</span>}
                            {!notSet(selectedSegment.operatingSystem) && <span className={`${styles.chip} ${styles.chipOS}`}>{selectedSegment.operatingSystem}</span>}
                            {!notSet(selectedSegment.sessionSource) && <span className={`${styles.chip} ${styles.chipSource}`}>{selectedSegment.sessionSource}</span>}
                            <button className={styles.clearButton} onClick={() => { setSelectedSegment(null); setEvents(null) }}>
                                閉じる
                            </button>
                        </div>
                    </div>

                    {timelineLoading && (
                        <div className={styles.loaderContainer}>
                            <Loader />
                            <span>タイムラインを取得中...</span>
                        </div>
                    )}

                    {timelineError && (
                        <div className={styles.errorBox}>
                            <p className={styles.errorTitle}>エラー</p>
                            <p>{timelineError}</p>
                        </div>
                    )}

                    {events && !timelineLoading && (
                        <>
                            <div className={styles.resultHeader}>
                                <p className={styles.resultTitle}>イベントタイムライン</p>
                                <p className={styles.resultMeta}>{filteredEvents.length} 件 / 全 {events.length} 件</p>
                            </div>
                            <div className={styles.filterBar}>
                                <input
                                    type="text"
                                    value={tlSearch}
                                    onChange={(e) => setTlSearch(e.target.value)}
                                    placeholder="ページパス・イベント名で絞り込み"
                                    className={styles.filterInput}
                                />
                                <select
                                    value={eventFilter}
                                    onChange={(e) => setEventFilter(e.target.value)}
                                    className={styles.filterInput}
                                    style={{ width: 'auto' }}
                                >
                                    <option value="">すべてのイベント</option>
                                    {uniqueEventNames.map((name) => (
                                        <option key={name} value={name}>{name}</option>
                                    ))}
                                </select>
                            </div>

                            {filteredEvents.length === 0 ? (
                                <p className={styles.emptyState}>該当するイベントがありません</p>
                            ) : (
                                <div className={styles.timeline}>
                                    {Object.entries(groupedByDate).map(([date, dayEvents]) => (
                                        <div key={date} className={styles.dateGroup}>
                                            <p className={styles.dateLabel}>{date}</p>
                                            {dayEvents.map((ev, i) => (
                                                <div key={`${ev.sortKey}-${i}`} className={styles.eventRow}>
                                                    <span className={styles.eventTime}>{ev.time}</span>
                                                    <div className={styles.eventBody}>
                                                        <div className={styles.eventNameRow}>
                                                            <span className={`${styles.eventBadge} ${eventBadgeClass(ev.eventName)}`}>
                                                                {ev.eventName}
                                                            </span>
                                                            {ev.userCount > 0 && (
                                                                <span className={styles.metaChip}>{ev.userCount.toLocaleString()} ユーザー</span>
                                                            )}
                                                        </div>
                                                        {ev.pagePath && !notSet(ev.pagePath) && (
                                                            <p className={styles.eventPagePath}>{ev.pagePath}</p>
                                                        )}
                                                        {ev.pageTitle && !notSet(ev.pageTitle) && (
                                                            <p className={styles.eventPageTitle}>{ev.pageTitle}</p>
                                                        )}
                                                    </div>
                                                    <span className={styles.eventCount}>×{ev.eventCount.toLocaleString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
