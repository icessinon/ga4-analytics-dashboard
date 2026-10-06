'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import PageShell from '@/components/PageShell'
import FilterBar, { FilterField } from '@/components/FilterBar'
import DateInput from '@/components/DateInput'
import { ui, cx } from '@/components/ui'
import { useReport } from '@/hooks/useReport'
import { CHART_COLORS } from '@/lib/constants/chartColors'
import styles from './DailyPage.module.css'

interface VariantDaily {
    pv: number
    cv: number
    cvr: number
    cumPv: number
    cumCv: number
    cumCvr: number
}

type Variant = 'A' | 'B' | 'C' | 'D'
type DayRow = { date: string } & Partial<Record<Variant, VariantDaily>>

interface DailyResponse {
    abTestName?: string
    days?: DayRow[]
    variants?: string[]
    startDate?: string
    endDate?: string
}

const VARIANT_COLORS: Record<string, string> = {
    A: CHART_COLORS.blue,
    B: CHART_COLORS.green,
    C: CHART_COLORS.violet,
    D: CHART_COLORS.orange,
}
const colorOf = (v: string) => VARIANT_COLORS[v] ?? CHART_COLORS.violet

type Mode = 'daily' | 'cumulative'

export default function AbTestDailyCvrPage() {
    const params = useParams()
    const abTestId = params?.id as string

    // 初回は API 側の既定（テスト期間）で取得し、レスポンスの期間をフォームに反映する
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [mode, setMode] = useState<Mode>('cumulative')

    const report = useReport<DailyResponse>(`/api/ab-test/${abTestId}/daily`, {
        body: { startDate: startDate || undefined, endDate: endDate || undefined },
        manual: true,
        keepPreviousData: true,
    })
    const runRef = useRef(report.run)
    runRef.current = report.run
    useEffect(() => { if (abTestId) runRef.current() }, [abTestId])
    useEffect(() => {
        if (report.data?.startDate) setStartDate(report.data.startDate)
        if (report.data?.endDate) setEndDate(report.data.endDate)
    }, [report.data])

    const days = report.data?.days ?? null
    const variants = report.data?.variants ?? []
    const rateOf = (r: VariantDaily | undefined) => (r ? (mode === 'cumulative' ? r.cumCvr : r.cvr) : null)
    const chartData = (days ?? []).map((d) => {
        const row: Record<string, string | number | null> = { date: d.date }
        for (const v of variants) {
            const rate = rateOf(d[v as Variant])
            row[v] = rate == null ? null : rate * 100
        }
        return row
    })

    return (
        <PageShell
            pageId="abTestDaily"
            back={{ href: `/ab-test/${abTestId}`, label: 'ABテスト詳細に戻る' }}
            subtitle={report.data?.abTestName || undefined}
            width="wide"
            status={{ loading: report.loading, error: report.error, source: 'ga4', loadingText: '日次データを取得中...', onRetry: report.run }}
            keepChildrenWhileLoading
            controls={
                <FilterBar onSubmit={report.run} submitLabel="推移を取得" submitting={report.loading}>
                    <FilterField label="開始日">
                        <DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                    </FilterField>
                    <FilterField label="終了日">
                        <DateInput value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    </FilterField>
                </FilterBar>
            }
        >
            {days && (
                <div className={ui.card}>
                    <div className={styles.resultHeader}>
                        <h2 className={ui.sectionTitle}>バリアント別CVR推移（{mode === 'cumulative' ? '累積' : '日次'}）</h2>
                        <div className={ui.tabs} role="tablist">
                            {([['cumulative', '累積CVR'], ['daily', '日次CVR']] as const).map(([m, label]) => (
                                <button key={m} type="button" role="tab" aria-selected={mode === m} className={cx(ui.tab, mode === m && ui.tabActive)} onClick={() => setMode(m)}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {days.length === 0 ? (
                        <p className={ui.empty}>データがありません。期間を調整して再試行してください。</p>
                    ) : (
                        <>
                            <div className={styles.chartWrap}>
                                <ResponsiveContainer width="100%" height={320}>
                                    <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                                        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: string) => v.slice(5)} />
                                        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => `${v.toFixed(1)}%`} />
                                        <Tooltip
                                            cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }}
                                            content={({ active, payload, label }) => {
                                                if (!active || !payload?.length) return null
                                                return (
                                                    <div className={styles.chartTooltip}>
                                                        <p className={styles.chartTooltipLabel}>{label}</p>
                                                        {payload.map((p) => (
                                                            <p key={String(p.dataKey)} className={styles.chartTooltipRow}>
                                                                <span style={{ color: p.color as string }}>{String(p.dataKey)}</span>
                                                                <span>{p.value != null ? `${(p.value as number).toFixed(2)}%` : '–'}</span>
                                                            </p>
                                                        ))}
                                                    </div>
                                                )
                                            }}
                                        />
                                        <Legend wrapperStyle={{ fontSize: 12 }} />
                                        {variants.map((v) => (
                                            <Line key={v} type="monotone" dataKey={v} stroke={colorOf(v)} strokeWidth={2} dot={{ r: 2, fill: colorOf(v) }} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
                                        ))}
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>

                            <div className={ui.tableWrap}>
                                <table className={ui.dataTable}>
                                    <thead>
                                        <tr>
                                            <th>日付</th>
                                            {variants.map((v) => <th key={v} className={ui.num}>{mode === 'cumulative' ? `累積CVR (${v})` : `CVR (${v})`}</th>)}
                                            {variants.map((v) => <th key={`pv-${v}`} className={ui.num}>PV/CV ({v})</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[...days].reverse().map((d) => (
                                            <tr key={d.date}>
                                                <td>{d.date}</td>
                                                {variants.map((v) => {
                                                    const rate = rateOf(d[v as Variant])
                                                    return <td key={v} className={ui.num}>{rate != null ? `${(rate * 100).toFixed(2)}%` : '–'}</td>
                                                })}
                                                {variants.map((v) => {
                                                    const r = d[v as Variant]
                                                    return <td key={`pv-${v}`} className={ui.num}>{r ? `${r.pv.toLocaleString()} / ${r.cv.toLocaleString()}` : '–'}</td>
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className={ui.tableNote}>累積CVRはテスト開始（取得期間の先頭）からの累計CV÷累計PV。日次CVRはその日1日のCV÷PVです。</p>
                        </>
                    )}
                </div>
            )}
        </PageShell>
    )
}
