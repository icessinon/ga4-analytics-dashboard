'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useProduct } from '@/contexts/ProductContext'
import PageShell from '@/components/PageShell'
import PeriodSelect from '@/components/PeriodSelect'
import Alert from '@/components/Alert'
import { ui, cx } from '@/components/ui'
import { usePeriodRange } from '@/hooks/usePeriodRange'
import { useReport } from '@/hooks/useReport'
import { type PeriodOption } from '@/lib/utils/period'
import { CV_UNIT_VALUE_YEN, formatYenApprox } from '@/lib/constants/cvUnitValue'
import { describeUtm, describeUtmContent, isEmptyUtmValue, UTM_CATEGORY_META, type UtmCategory } from '@/lib/constants/utmCatalog'
import type { UtmReportResponse, UtmRow } from '@/lib/services/channel/utmReportTypes'
import styles from './UtmReportPage.module.css'

const PERIOD_OPTIONS: PeriodOption[] = [
    { value: '7daysAgo', label: '過去7日' },
    { value: '14daysAgo', label: '過去14日' },
    { value: '30daysAgo', label: '過去30日' },
    { value: '90daysAgo', label: '過去90日' },
]

type SortKey = 'category' | 'utm' | 'sessions' | 'users' | 'cv' | 'cvr'

const totalCvOf = (r: UtmRow) => r.applyCv + r.lpApplyCv + r.signupCv

const cvYenOf = (r: UtmRow) =>
    (r.applyCv + r.lpApplyCv) * CV_UNIT_VALUE_YEN.JobR + r.signupCv * CV_UNIT_VALUE_YEN.signup

/** utm_content を畳むとき: source/medium/campaign が同じ行を足し合わせる */
function mergeByCampaign(rows: UtmRow[]): UtmRow[] {
    const agg = new Map<string, UtmRow>()
    for (const r of rows) {
        const k = [r.source, r.medium, r.campaign].join('|')
        const cur = agg.get(k)
        if (!cur) { agg.set(k, { ...r, content: '(not set)' }); continue }
        cur.sessions += r.sessions
        cur.users += r.users
        cur.applyCv += r.applyCv
        cur.lpApplyCv += r.lpApplyCv
        cur.signupCv += r.signupCv
    }
    return [...agg.values()]
}

function Badge({ category }: { category: UtmCategory }) {
    const meta = UTM_CATEGORY_META[category]
    return (
        <span className={styles.badge} style={{ backgroundColor: `${meta.color}1f` }}>
            <span className={styles.badgeDot} style={{ backgroundColor: meta.color }} aria-hidden="true" />
            {meta.label}
        </span>
    )
}

export default function UtmReportPage() {
    const { currentProduct } = useProduct()
    const periodState = usePeriodRange('30daysAgo')
    const { range } = periodState
    const [mediumFilter, setMediumFilter] = useState<string>('all')
    const [query, setQuery] = useState('')
    const [splitByContent, setSplitByContent] = useState(true)
    // 500 行を一度に描くと重く、下まで読めない。上位から段階的に出す
    const PAGE = 100
    const [visible, setVisible] = useState(PAGE)
    const [sortKey, setSortKey] = useState<SortKey>('sessions')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

    const report = useReport<UtmReportResponse>('/api/utm-report', {
        body: { propertyId: currentProduct?.ga4PropertyId, startDate: range?.startDate, endDate: range?.endDate },
        enabled: !!currentProduct?.ga4PropertyId && !!range,
    })
    const data = report.data

    // medium別のフィルタ候補（セッション降順）
    const mediums = useMemo(() => {
        if (!data) return []
        const agg = new Map<string, number>()
        for (const r of data.rows) agg.set(r.medium, (agg.get(r.medium) ?? 0) + r.sessions)
        return [...agg.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m)
    }, [data])

    const rows = useMemo(() => {
        if (!data) return []
        const base = splitByContent ? data.rows : mergeByCampaign(data.rows)
        const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
        return base.filter((r) => {
            if (mediumFilter !== 'all' && r.medium !== mediumFilter) return false
            if (!terms.length) return true
            const d = describeUtm(r.source, r.medium, r.campaign)
            const contentNote = describeUtmContent(r.source, r.medium, r.campaign, r.content) ?? ''
            const hay = [r.source, r.medium, r.campaign, r.content, d.label, d.timing, contentNote, UTM_CATEGORY_META[d.category].label].join(' ').toLowerCase()
            return terms.every((t) => hay.includes(t))
        })
    }, [data, mediumFilter, query, splitByContent])

    const totals = useMemo(() => ({
        sessions: rows.reduce((s, r) => s + r.sessions, 0),
        cv: rows.reduce((s, r) => s + totalCvOf(r), 0),
        yen: rows.reduce((s, r) => s + cvYenOf(r), 0),
        kinds: rows.length,
    }), [rows])

    useEffect(() => { setVisible(PAGE) }, [mediumFilter, query, splitByContent, sortKey, sortDir]) // eslint-disable-line react-hooks/exhaustive-deps

    const toggleSort = (k: SortKey) => {
        if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        else { setSortKey(k); setSortDir(k === 'utm' || k === 'category' ? 'asc' : 'desc') }
    }
    const sortedRows = useMemo(() => {
        const val = (r: UtmRow): number | string => {
            switch (sortKey) {
                case 'sessions': return r.sessions
                case 'users': return r.users
                case 'cv': return totalCvOf(r)
                case 'cvr': return r.sessions > 0 ? totalCvOf(r) / r.sessions : 0
                case 'category': return UTM_CATEGORY_META[describeUtm(r.source, r.medium, r.campaign).category].label
                case 'utm': return `${r.source}/${r.medium}/${r.campaign}/${r.content}`
            }
        }
        const dir = sortDir === 'asc' ? 1 : -1
        return [...rows].sort((a, b) => {
            const va = val(a), vb = val(b)
            if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
            return String(va).localeCompare(String(vb), 'ja') * dir
        })
    }, [rows, sortKey, sortDir])
    const arrow = (k: SortKey) => (sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '')
    const sortTh = (k: SortKey, label: string, num = false) => (
        <th className={cx(num && ui.num, styles.sortable, sortKey === k && styles.sortActive)} onClick={() => toggleSort(k)}>{label}{arrow(k)}</th>
    )

    return (
        <PageShell
            pageId="utmReport"
            width="wide"
            requireProduct
            status={{ loading: report.loading, error: report.error, source: 'ga4', onRetry: report.run }}
            controls={
                <>
                    <PeriodSelect state={periodState} options={PERIOD_OPTIONS} resolved={data} />
                    <input
                        type="search"
                        className={styles.search}
                        placeholder="検索: source / medium / campaign / 施策名（例: keep / richmenu / メール）"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        aria-label="UTMを検索"
                    />
                    <label className={styles.toggle}>
                        <input type="checkbox" checked={splitByContent} onChange={(e) => setSplitByContent(e.target.checked)} />
                        utm_contentで分ける
                    </label>
                </>
            }
        >
            <Alert tone="info" title="読み方">
                ここに出るのは<strong>流入UTM</strong>（メール/LINE/SMS通知・広告など外部→サイトで新規セッションを作るもの）。
                フッター/サイドバー/バナー等の<strong>サイト内リンクUTM</strong>（utm_source=xwork/thanks）は、GA4がUTMをセッション開始時のみ読むため<strong>ここには出ません</strong>（＝正常）。
                完全な一覧・命名規則は<Link href="/docs/glossary" className={styles.inlineLink}>用語集のUTM節</Link>／docs/utm-naming-convention.md。
                <br />
                <strong>utm_content</strong> は「同じ配信の中のどのリンク／どの文面か」を分ける4つ目の軸です。
                ステップメールはリンク位置（profile_register / line_settings / recommend_N）、スカウトSMSは文面のAB（featured_a / featured_b）、広告はクリエイティブIDが入ります。
                付けていない配信は <code>(not set)</code> に寄るので、上の「utm_contentで分ける」を外すとcampaignまでの粒度に畳めます。
            </Alert>

            {data && (
                <>
                    <div className={ui.summaryRow}>
                        <div className={ui.summaryCard}>
                            <span className={ui.summaryLabel}>対象セッション</span>
                            <span className={ui.summaryValue}>{totals.sessions.toLocaleString()}</span>
                            <span className={ui.summaryHint}>{mediumFilter === 'all' ? '全UTM' : `medium=${mediumFilter}`}</span>
                        </div>
                        <div className={ui.summaryCard}>
                            <span className={ui.summaryLabel}>CV（応募+LP+登録）</span>
                            <span className={ui.summaryValue}>{totals.cv.toLocaleString()}</span>
                            <span className={ui.summaryHint}>CVR {totals.sessions ? ((totals.cv / totals.sessions) * 100).toFixed(2) : '0.00'}%</span>
                        </div>
                        <div className={ui.summaryCard}>
                            <span className={ui.summaryLabel}>期待売上換算</span>
                            <span className={ui.summaryValue}>{formatYenApprox(totals.yen)}</span>
                            <span className={ui.summaryHint}>応募・LP応募は人材紹介単価で近似</span>
                        </div>
                        <div className={ui.summaryCard}>
                            <span className={ui.summaryLabel}>UTMの種類</span>
                            <span className={ui.summaryValue}>{totals.kinds.toLocaleString()}</span>
                            <span className={ui.summaryHint}>{splitByContent ? 'source×medium×campaign×content の組合せ数' : 'source×medium×campaign の組合せ数'}</span>
                        </div>
                    </div>

                    <div className={styles.chips}>
                        <button type="button" className={cx(styles.chip, mediumFilter === 'all' && styles.chipActive)} onClick={() => setMediumFilter('all')}>すべて</button>
                        {mediums.map((m) => (
                            <button key={m} type="button" className={cx(styles.chip, mediumFilter === m && styles.chipActive)} onClick={() => setMediumFilter(m)}>{m}</button>
                        ))}
                    </div>

                    <div className={ui.card}>
                        <div className={styles.tableHead}>
                            <h2 className={ui.sectionTitle} style={{ marginBottom: 0 }}>UTM別 内訳</h2>
                            <span className={ui.note}>{rows.length.toLocaleString()}件表示{data.rows.length !== rows.length ? `（全${data.rows.length.toLocaleString()}件中）` : ''} ・ 見出しクリックで並べ替え</span>
                        </div>
                        <div className={ui.tableWrap}>
                            <table className={ui.dataTable}>
                                <thead>
                                    <tr>
                                        {sortTh('category', '区分')}
                                        {sortTh('utm', `UTM（source / medium / campaign${splitByContent ? ' / content' : ''}）と意味・発行タイミング`)}
                                        {sortTh('sessions', 'セッション', true)}
                                        {sortTh('users', 'ユーザー', true)}
                                        {sortTh('cv', 'CV', true)}
                                        {sortTh('cvr', 'CVR', true)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedRows.slice(0, visible).map((r, i) => {
                                        const d = describeUtm(r.source, r.medium, r.campaign)
                                        const hasContent = splitByContent && !isEmptyUtmValue(r.content)
                                        const contentNote = hasContent ? describeUtmContent(r.source, r.medium, r.campaign, r.content) : null
                                        const cv = totalCvOf(r)
                                        return (
                                            <tr key={`${r.source}|${r.medium}|${r.campaign}|${r.content}|${i}`}>
                                                <td><Badge category={d.category} /></td>
                                                <td className={styles.utmCell}>
                                                    {/* UTM の値（等幅）→ 意味 → 発行タイミングの順に縦に積む。横に並べると長い campaign が説明に食い込む */}
                                                    <span className={styles.mono}>{r.source} / {r.medium}</span>
                                                    <span className={cx(styles.mono, styles.campaign)} title={r.campaign}>{r.campaign}</span>
                                                    {hasContent && <span className={cx(styles.mono, styles.content)} title={r.content}>content: {r.content}</span>}
                                                    <span className={styles.meaning}>{d.label}</span>
                                                    <span className={styles.timing}>{d.timing}</span>
                                                    {contentNote && <span className={styles.timing}>content: {contentNote}</span>}
                                                    {d.warning && <span className={styles.warn}>⚠️ {d.warning}</span>}
                                                </td>
                                                <td className={cx(ui.num, ui.strong)}>{r.sessions.toLocaleString()}</td>
                                                <td className={ui.num}>{r.users.toLocaleString()}</td>
                                                <td className={cx(ui.num, styles.cvCell)}>{cv > 0 ? cv.toLocaleString() : '－'}{cv > 0 && <span className={styles.cvBreakdown}>応{r.applyCv}/LP{r.lpApplyCv}/登{r.signupCv}</span>}</td>
                                                <td className={ui.num}>{r.sessions > 0 && cv > 0 ? `${((cv / r.sessions) * 100).toFixed(1)}%` : '－'}</td>
                                            </tr>
                                        )
                                    })}
                                    {rows.length === 0 && <tr><td colSpan={6} className={ui.empty}>該当するUTMがありません</td></tr>}
                                </tbody>
                            </table>
                        </div>
                        {sortedRows.length > visible && (
                            <div className={ui.controls}>
                                <button type="button" className={ui.btnGhost} onClick={() => setVisible((v) => v + PAGE)}>
                                    さらに表示（残り {(sortedRows.length - visible).toLocaleString()} 件）
                                </button>
                            </div>
                        )}
                        <p className={ui.tableNote}>
                            ※ CV = 応募(/entry/thanks) + LP応募(/lp-thanks) + 会員登録(/members/signup/thanks) 到達ユーザー。スカウトSMS等は送客が目的のため会員登録CVはほぼ0（scoutId経由の応募に効く）。<br />
                            ※ 2026-08-11〜のUnassignedインシデント中はsource欠落セッションが増えており、チャネル別の絶対数は割り引いて見てください。全GA4集計はデフォルトで国=日本フィルタ適用。
                        </p>
                    </div>
                </>
            )}
        </PageShell>
    )
}
