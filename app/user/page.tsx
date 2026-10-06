'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useProduct } from '@/contexts/ProductContext'
import PageShell from '@/components/PageShell'
import FilterBar, { FilterField } from '@/components/FilterBar'
import PeriodSelect from '@/components/PeriodSelect'
import LoadState from '@/components/LoadState'
import { ui, cx } from '@/components/ui'
import { usePeriodRange } from '@/hooks/usePeriodRange'
import { useReport } from '@/hooks/useReport'
import type { UserSegment, UserSegmentListResponse, UserTimelineEvent, UserTimelineResponse } from '@/lib/services/user/userSegmentsTypes'
import styles from './UserPage.module.css'

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

function segmentLabel(s: UserSegment): string {
    const parts = [
        s.deviceCategory,
        s.browser,
        s.operatingSystem,
        s.sessionSource && !notSet(s.sessionSource) ? `${s.sessionSource}/${s.sessionMedium}` : null,
        s.country && !notSet(s.country) ? s.country : null,
    ].filter(Boolean)
    return parts.join(' · ')
}

export default function UserPage() {
    const { currentProduct } = useProduct()
    const periodState = usePeriodRange('30daysAgo')
    const { range } = periodState

    // ─── セグメント一覧（手動実行。行数が多く GA4 の 1 万行取得なので期間変更で勝手には取りに行かない） ───
    const list = useReport<UserSegmentListResponse>('/api/user/list', {
        body: { propertyId: currentProduct?.ga4PropertyId, startDate: range?.startDate, endDate: range?.endDate },
        manual: true,
    })
    const segments = list.data?.segments ?? null
    const [listSearch, setListSearch] = useState('')
    const [sortCol, setSortCol] = useState<keyof UserSegment>('totalUsers')
    const [sortAsc, setSortAsc] = useState(false)

    // ─── タイムライン（行クリックで取得） ───
    const [selectedSegment, setSelectedSegment] = useState<UserSegment | null>(null)
    const timeline = useReport<UserTimelineResponse>('/api/user/timeline', {
        body: {
            propertyId: currentProduct?.ga4PropertyId,
            startDate: range?.startDate,
            endDate: range?.endDate,
            deviceCategory: selectedSegment?.deviceCategory,
            browser: selectedSegment?.browser,
            operatingSystem: selectedSegment?.operatingSystem,
            country: selectedSegment?.country,
            sessionSource: selectedSegment?.sessionSource,
            sessionMedium: selectedSegment?.sessionMedium,
        },
        manual: true,
    })
    const events = timeline.data?.events ?? null
    const [eventFilter, setEventFilter] = useState('')
    const [tlSearch, setTlSearch] = useState('')

    // body が state 由来なので、選択が反映された描画の後に run する
    const runTimeline = useRef(timeline.run)
    runTimeline.current = timeline.run
    const resetTimeline = useRef(timeline.reset)
    resetTimeline.current = timeline.reset
    useEffect(() => {
        setEventFilter('')
        setTlSearch('')
        if (selectedSegment) runTimeline.current()
        else resetTimeline.current()
    }, [selectedSegment])

    function handleSubmit() {
        if (!currentProduct || !range) return
        setSelectedSegment(null)
        list.run()
    }

    // ─── 一覧フィルタ・ソート ───
    const sortedSegments = useMemo(() => {
        if (!segments) return []
        let rows = segments
        if (listSearch) {
            const q = listSearch.toLowerCase()
            rows = rows.filter((s) =>
                [s.browser, s.operatingSystem, s.deviceCategory, s.sessionSource, s.sessionMedium, s.country]
                    .some((v) => v.toLowerCase().includes(q))
            )
        }
        return [...rows].sort((a, b) => {
            const av = a[sortCol] ?? ''
            const bv = b[sortCol] ?? ''
            const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
            return sortAsc ? cmp : -cmp
        })
    }, [segments, listSearch, sortCol, sortAsc])

    const handleSort = (key: keyof UserSegment) => {
        if (sortCol === key) setSortAsc((p) => !p)
        else { setSortCol(key); setSortAsc(false) }
    }
    const sortIcon = (key: keyof UserSegment) => sortCol === key ? (sortAsc ? ' ▲' : ' ▼') : ''

    // ─── タイムラインフィルタ ───
    const { filteredEvents, groupedByDate, uniqueEventNames } = useMemo(() => {
        if (!events) return { filteredEvents: [] as UserTimelineEvent[], groupedByDate: {} as Record<string, UserTimelineEvent[]>, uniqueEventNames: [] as string[] }
        const uniqueEventNames = [...new Set(events.map((e) => e.eventName))].sort()
        let filtered = events
        if (eventFilter) filtered = filtered.filter((e) => e.eventName === eventFilter)
        if (tlSearch) {
            const q = tlSearch.toLowerCase()
            filtered = filtered.filter((e) =>
                e.pagePath.toLowerCase().includes(q) || e.pageTitle.toLowerCase().includes(q) || e.eventName.toLowerCase().includes(q)
            )
        }
        const groupedByDate: Record<string, UserTimelineEvent[]> = {}
        for (const ev of filtered) (groupedByDate[ev.date] ??= []).push(ev)
        return { filteredEvents: filtered, groupedByDate, uniqueEventNames }
    }, [events, eventFilter, tlSearch])

    const chips = (s: UserSegment) => (
        <>
            {!notSet(s.deviceCategory) && <span className={cx(styles.chip, styles.chipDevice)}>{s.deviceCategory}</span>}
            {!notSet(s.browser) && <span className={cx(styles.chip, styles.chipBrowser)}>{s.browser}</span>}
            {!notSet(s.operatingSystem) && <span className={cx(styles.chip, styles.chipOS)}>{s.operatingSystem}</span>}
            {!notSet(s.sessionSource) && <span className={cx(styles.chip, styles.chipSource)}>{s.sessionSource}</span>}
        </>
    )

    return (
        <PageShell
            pageId="user"
            requireProduct
            status={{ loading: list.loading, error: list.error, source: 'ga4', onRetry: list.run }}
            controls={
                <div className={ui.card}>
                    <FilterBar onSubmit={handleSubmit} submitLabel="セグメント一覧を取得" submitting={list.loading} disabled={!currentProduct || !range}>
                        <FilterField label="期間">
                            <PeriodSelect state={periodState} />
                        </FilterField>
                    </FilterBar>
                </div>
            }
        >
            {segments && (
                <div className={ui.card}>
                    <div className={styles.resultHeader}>
                        <h2 className={ui.sectionTitle} style={{ marginBottom: 0 }}>セグメント一覧</h2>
                        <p className={ui.note}>{sortedSegments.length} 件 / 全 {segments.length} 件</p>
                    </div>
                    <div className={styles.filterBar}>
                        <input
                            type="text"
                            value={listSearch}
                            onChange={(e) => setListSearch(e.target.value)}
                            placeholder="ブラウザ・OS・流入元・国で絞り込み"
                            className={styles.filterInput}
                        />
                    </div>
                    <div className={ui.tableWrap}>
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
                                        <td colSpan={10} className={cx(styles.userTableCell, ui.empty)}>データがありません</td>
                                    </tr>
                                ) : sortedSegments.map((seg, i) => (
                                    <tr
                                        key={i}
                                        className={cx(styles.userTableRow, selectedSegment === seg && styles.userTableRowSelected)}
                                        onClick={() => setSelectedSegment(seg)}
                                        title="クリックしてタイムラインを表示"
                                    >
                                        <td className={cx(styles.userTableCell, styles.numCell)}>{seg.totalUsers.toLocaleString()}</td>
                                        <td className={cx(styles.userTableCell, styles.numCell)}>{seg.totalSessions.toLocaleString()}</td>
                                        <td className={cx(styles.userTableCell, styles.numCell)}>{seg.totalPageViews.toLocaleString()}</td>
                                        <td className={cx(styles.userTableCell, styles.numCell)}>{seg.totalEvents.toLocaleString()}</td>
                                        <td className={styles.userTableCell}>{!notSet(seg.deviceCategory) && <span className={cx(styles.chip, styles.chipDevice)}>{seg.deviceCategory}</span>}</td>
                                        <td className={styles.userTableCell}>{!notSet(seg.browser) && <span className={cx(styles.chip, styles.chipBrowser)}>{seg.browser}</span>}</td>
                                        <td className={styles.userTableCell}>{!notSet(seg.operatingSystem) && <span className={cx(styles.chip, styles.chipOS)}>{seg.operatingSystem}</span>}</td>
                                        <td className={styles.userTableCell}>
                                            {!notSet(seg.sessionSource) && (
                                                <span className={cx(styles.chip, styles.chipSource)}>
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

            {selectedSegment && (
                <div className={ui.card}>
                    <div className={styles.selectedUserBanner}>
                        <div>
                            <span className={styles.selectedUserLabel}>選択中のセグメント: </span>
                            <span className={styles.selectedUserId}>{segmentLabel(selectedSegment)}</span>
                        </div>
                        <div className={styles.selectedUserChips}>
                            {chips(selectedSegment)}
                            <button type="button" className={ui.btnGhost} onClick={() => setSelectedSegment(null)}>閉じる</button>
                        </div>
                    </div>

                    <LoadState variant="inline" loading={timeline.loading} error={timeline.error} source="ga4" onRetry={timeline.run}>
                        {events && (
                            <>
                                <div className={styles.resultHeader}>
                                    <h2 className={ui.sectionTitle} style={{ marginBottom: 0 }}>イベントタイムライン</h2>
                                    <p className={ui.note}>{filteredEvents.length} 件 / 全 {events.length} 件</p>
                                </div>
                                <div className={styles.filterBar}>
                                    <input
                                        type="text"
                                        value={tlSearch}
                                        onChange={(e) => setTlSearch(e.target.value)}
                                        placeholder="ページパス・イベント名で絞り込み"
                                        className={styles.filterInput}
                                    />
                                    <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} className={ui.select}>
                                        <option value="">すべてのイベント</option>
                                        {uniqueEventNames.map((name) => (
                                            <option key={name} value={name}>{name}</option>
                                        ))}
                                    </select>
                                </div>

                                {filteredEvents.length === 0 ? (
                                    <p className={ui.empty}>該当するイベントがありません</p>
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
                                                                <span className={cx(styles.eventBadge, eventBadgeClass(ev.eventName))}>{ev.eventName}</span>
                                                                {ev.userCount > 0 && <span className={styles.metaChip}>{ev.userCount.toLocaleString()} ユーザー</span>}
                                                            </div>
                                                            {ev.pagePath && !notSet(ev.pagePath) && <p className={styles.eventPagePath}>{ev.pagePath}</p>}
                                                            {ev.pageTitle && !notSet(ev.pageTitle) && <p className={styles.eventPageTitle}>{ev.pageTitle}</p>}
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
                    </LoadState>
                </div>
            )}
        </PageShell>
    )
}
