'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import PageShell from '@/components/PageShell'
import FilterBar, { FilterField } from '@/components/FilterBar'
import DateInput from '@/components/DateInput'
import { ui, cx } from '@/components/ui'
import { useReport } from '@/hooks/useReport'
import { daysAgoStr, fmtYmd } from '@/lib/utils/period'
import styles from './SegmentPage.module.css'

interface CvrResult {
    pv: number
    cv: number
    cvr: number
}

interface SegmentRow {
    name: string
    dataA?: CvrResult
    dataB?: CvrResult
    dataC?: CvrResult
    dataD?: CvrResult
}

interface SegmentResponse {
    abTestName?: string
    segments?: SegmentRow[]
}

const SEGMENT_OPTIONS = [
    { value: 'deviceCategory', label: 'デバイス' },
    { value: 'operatingSystem', label: 'OS' },
    { value: 'browser', label: 'ブラウザ' },
    { value: 'country', label: '国' },
    { value: 'sessionSource', label: '流入元 (Source)' },
    { value: 'sessionMedium', label: '流入経路 (Medium)' },
]

const VARIANTS = ['A', 'B', 'C', 'D'] as const
type Variant = (typeof VARIANTS)[number]
const resultOf = (row: SegmentRow, v: Variant): CvrResult | undefined => row[`data${v}`]

function diffBadge(rateA: number, rateB: number): { text: string; positive: boolean } | null {
    if (!rateA || !rateB) return null
    const diff = ((rateB - rateA) / rateA) * 100
    return { text: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`, positive: diff >= 0 }
}

export default function AbTestSegmentPage() {
    const params = useParams()
    const abTestId = params?.id as string

    // 旧実装の既定は過去 30 日〜今日
    const [segmentDimension, setSegmentDimension] = useState('deviceCategory')
    const [startDate, setStartDate] = useState(daysAgoStr(30))
    const [endDate, setEndDate] = useState(fmtYmd(new Date()))

    const report = useReport<SegmentResponse>(`/api/ab-test/${abTestId}/segment`, {
        body: { segmentDimension, startDate, endDate },
        manual: true,
    })
    const runRef = useRef(report.run)
    runRef.current = report.run
    useEffect(() => { if (abTestId) runRef.current() }, [abTestId])

    const segments = report.data?.segments ?? null
    const first = segments?.[0]
    const variants: Variant[] = first ? VARIANTS.filter((v) => !!resultOf(first, v)) : []
    const hasAB = variants.includes('A') && variants.includes('B')
    const dimensionLabel = SEGMENT_OPTIONS.find((o) => o.value === segmentDimension)?.label ?? segmentDimension

    return (
        <PageShell
            pageId="abTestSegment"
            back={{ href: `/ab-test/${abTestId}`, label: 'ABテスト詳細に戻る' }}
            subtitle={report.data?.abTestName || undefined}
            width="wide"
            status={{ loading: report.loading, error: report.error, source: 'ga4', loadingText: 'セグメントデータを取得中...', onRetry: report.run }}
            controls={
                <FilterBar onSubmit={report.run} submitLabel="分析を実行" submitting={report.loading}>
                    <FilterField label="セグメント軸">
                        <select className={ui.select} value={segmentDimension} onChange={(e) => setSegmentDimension(e.target.value)} aria-label="セグメント軸">
                            {SEGMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </FilterField>
                    <FilterField label="開始日">
                        <DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                    </FilterField>
                    <FilterField label="終了日">
                        <DateInput value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    </FilterField>
                </FilterBar>
            }
        >
            {segments && (
                <div className={ui.card}>
                    <h2 className={ui.sectionTitle}>{dimensionLabel} 別CVR</h2>
                    <p className={ui.sectionNote}>{Math.max(0, segments.length - 1)} セグメント。先頭行は全体の合計です。</p>
                    {segments.length === 0 ? (
                        <p className={ui.empty}>データがありません。期間を調整して再試行してください。</p>
                    ) : (
                        <div className={ui.tableWrap}>
                            <table className={ui.dataTable}>
                                <thead>
                                    <tr>
                                        <th>セグメント</th>
                                        {variants.map((v) => (
                                            <Fragment key={v}>
                                                <th className={ui.num}>PV ({v})</th>
                                                <th className={ui.num}>CV ({v})</th>
                                                <th className={ui.num}>CVR ({v})</th>
                                            </Fragment>
                                        ))}
                                        {hasAB && <th className={ui.num}>B vs A</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {segments.map((row, idx) => {
                                        const isTotal = idx === 0
                                        const rA = resultOf(row, 'A')
                                        const rB = resultOf(row, 'B')
                                        const badge = rA && rB ? diffBadge(rA.cvr, rB.cvr) : null
                                        return (
                                            <tr key={row.name} className={isTotal ? styles.totalRow : undefined}>
                                                <td className={isTotal ? ui.strong : undefined}>{row.name}</td>
                                                {variants.map((v) => {
                                                    const r = resultOf(row, v)
                                                    return (
                                                        <Fragment key={v}>
                                                            <td className={ui.num}>{r ? r.pv.toLocaleString() : '–'}</td>
                                                            <td className={ui.num}>{r ? r.cv.toLocaleString() : '–'}</td>
                                                            <td className={cx(ui.num, styles[`variant${v}`])}>{r ? `${(r.cvr * 100).toFixed(2)}%` : '–'}</td>
                                                        </Fragment>
                                                    )
                                                })}
                                                {hasAB && (
                                                    <td className={ui.num}>
                                                        {badge ? <span className={badge.positive ? styles.diffPositive : styles.diffNegative}>{badge.text}</span> : '–'}
                                                    </td>
                                                )}
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <p className={ui.tableNote}>CVR = CV / PV。「B vs A」は A に対する B の CVR 改善率です。</p>
                </div>
            )}
        </PageShell>
    )
}
