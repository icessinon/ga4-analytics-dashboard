'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useProduct } from '@/lib/contexts/ProductContext'
import BackLink from '@/components/BackLink'
import RelatedPages from '@/components/RelatedPages/RelatedPages'
import PeriodSelect, { usePeriodRange } from '@/components/PeriodSelect/PeriodSelect'
import { withCustomOption, PeriodOption } from '@/lib/utils/period'
import { parseJsonResponse } from '@/lib/utils/fetch'
import { CV_UNIT_VALUE_YEN, formatYenApprox } from '@/lib/constants/cvUnitValue'
import { describeUtm, UTM_CATEGORY_META, UtmCategory } from '@/lib/constants/utmCatalog'
import styles from './UtmReportPage.module.css'

interface UtmRow {
    source: string
    medium: string
    campaign: string
    sessions: number
    users: number
    applyCv: number
    lpApplyCv: number
    signupCv: number
}

interface UtmReportResponse {
    startDate: string
    endDate: string
    rows: UtmRow[]
}

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

function Badge({ category }: { category: UtmCategory }) {
    const meta = UTM_CATEGORY_META[category]
    return (
        <span className={styles.badge} style={{ backgroundColor: `${meta.color}22`, color: meta.color }}>
            {meta.label}
        </span>
    )
}

export default function UtmReportPage() {
    const { currentProduct } = useProduct()
    const periodState = usePeriodRange('30daysAgo')
    const { range } = periodState
    const [data, setData] = useState<UtmReportResponse | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [mediumFilter, setMediumFilter] = useState<string>('all')
    const [query, setQuery] = useState('')

    const load = useCallback(async () => {
        if (!currentProduct?.ga4PropertyId || !range) return
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/utm-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ propertyId: currentProduct.ga4PropertyId, startDate: range.startDate, endDate: range.endDate }),
            })
            const json = await parseJsonResponse<UtmReportResponse & { error?: string }>(res)
            if (!res.ok) throw new Error(json.error || '取得に失敗しました')
            setData(json)
        } catch (e) {
            setError(e instanceof Error ? e.message : '取得に失敗しました')
            setData(null)
        } finally {
            setLoading(false)
        }
    }, [currentProduct?.ga4PropertyId, range])

    useEffect(() => { load() }, [load])

    // medium別のフィルタ候補（セッション降順）
    const mediums = useMemo(() => {
        if (!data) return []
        const agg = new Map<string, number>()
        for (const r of data.rows) agg.set(r.medium, (agg.get(r.medium) ?? 0) + r.sessions)
        return [...agg.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m)
    }, [data])

    const rows = useMemo(() => {
        if (!data) return []
        const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
        return data.rows.filter((r) => {
            if (mediumFilter !== 'all' && r.medium !== mediumFilter) return false
            if (!terms.length) return true
            const d = describeUtm(r.source, r.medium, r.campaign)
            const hay = [r.source, r.medium, r.campaign, d.label, d.timing, UTM_CATEGORY_META[d.category].label].join(' ').toLowerCase()
            return terms.every((t) => hay.includes(t))
        })
    }, [data, mediumFilter, query])

    const totals = useMemo(() => {
        const sessions = rows.reduce((s, r) => s + r.sessions, 0)
        const cv = rows.reduce((s, r) => s + totalCvOf(r), 0)
        const yen = rows.reduce((s, r) => s + cvYenOf(r), 0)
        return { sessions, cv, yen, kinds: rows.length }
    }, [rows])

    const [sortKey, setSortKey] = useState<SortKey>('sessions')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
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
                case 'utm': return `${r.source}/${r.medium}/${r.campaign}`
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

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>UTM別レポート</h1>
                    <p className={styles.subtitle}>
                        utm_source × utm_medium × utm_campaign 別のセッション・ユーザー・CV・期待売上換算。各UTMが「どの施策のリンクで・いつ発行されるか」を注記します。
                    </p>
                </div>
                <BackLink href="/">ダッシュボード</BackLink>
            </div>

            {!currentProduct && <div className={styles.notice}>プロダクトを選択してください</div>}

            <div className={styles.notice}>
                <strong>読み方</strong>: ここに出るのは<strong>流入UTM</strong>（メール/LINE/SMS通知・広告など外部→サイトで新規セッションを作るもの）。
                フッター/サイドバー/バナー等の<strong>サイト内リンクUTM</strong>（utm_source=xwork/thanks）は、GA4がUTMをセッション開始時のみ読むため<strong>ここには出ません</strong>（＝正常）。
                完全な一覧・命名規則は<a href="/docs/glossary" className={styles.strong}> 用語集のUTM節</a>／docs/utm-naming-convention.md。
            </div>

            <RelatedPages pages={[{ href: '/line-report', label: 'LINE配信レポート' }, { href: '/cv-types', label: '求人種別CV分析' }, { href: '/cv-value', label: 'CV単価・お金まわり' }]} />

            <div className={styles.controls}>
                <PeriodSelect
                    state={periodState}
                    options={withCustomOption(PERIOD_OPTIONS)}
                    selectClassName={styles.select}
                    noteClassName={styles.periodNote}
                    resolved={data}
                />
                <input
                    type="search"
                    className={styles.search}
                    placeholder="検索: source / medium / campaign / 施策名（例: keep / richmenu / メール）"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="UTMを検索"
                />
            </div>

            {loading && <p className={styles.loading}>読み込み中...</p>}
            {error && <div className={styles.error}>{error}</div>}

            {data && !loading && (
                <>
                    <div className={styles.summaryRow}>
                        <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>対象セッション</span>
                            <span className={styles.summaryValue}>{totals.sessions.toLocaleString()}</span>
                            <span className={styles.summaryHint}>{mediumFilter === 'all' ? '全UTM' : `medium=${mediumFilter}`}</span>
                        </div>
                        <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>CV（応募+LP+登録）</span>
                            <span className={styles.summaryValue}>{totals.cv.toLocaleString()}</span>
                            <span className={styles.summaryHint}>CVR {totals.sessions ? ((totals.cv / totals.sessions) * 100).toFixed(2) : '0.00'}%</span>
                        </div>
                        <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>期待売上換算</span>
                            <span className={styles.summaryValue}>{formatYenApprox(totals.yen)}</span>
                            <span className={styles.summaryHint}>応募・LP応募は人材紹介単価で近似</span>
                        </div>
                        <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>UTMの種類</span>
                            <span className={styles.summaryValue}>{totals.kinds.toLocaleString()}</span>
                            <span className={styles.summaryHint}>source×medium×campaign の組合せ数</span>
                        </div>
                    </div>

                    <div className={styles.chips}>
                        <button className={`${styles.chip} ${mediumFilter === 'all' ? styles.chipActive : ''}`} onClick={() => setMediumFilter('all')}>すべて</button>
                        {mediums.map((m) => (
                            <button key={m} className={`${styles.chip} ${mediumFilter === m ? styles.chipActive : ''}`} onClick={() => setMediumFilter(m)}>
                                {m}
                            </button>
                        ))}
                    </div>

                    <div className={styles.card}>
                        <div className={styles.tableHead}>
                            <h2 className={styles.sectionTitle}>UTM別 内訳</h2>
                            <span className={styles.count}>{rows.length.toLocaleString()}件表示{data.rows.length !== rows.length ? `（全${data.rows.length.toLocaleString()}件中）` : ''} ・ 見出しクリックで並べ替え</span>
                        </div>
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th className={`${styles.sortable} ${sortKey === 'category' ? styles.sortActive : ''}`} onClick={() => toggleSort('category')}>区分{arrow('category')}</th>
                                        <th className={`${styles.sortable} ${sortKey === 'utm' ? styles.sortActive : ''}`} onClick={() => toggleSort('utm')}>source / medium / campaign{arrow('utm')}</th>
                                        <th>意味・発行タイミング</th>
                                        <th className={`${styles.num} ${styles.sortable} ${sortKey === 'sessions' ? styles.sortActive : ''}`} onClick={() => toggleSort('sessions')}>セッション{arrow('sessions')}</th>
                                        <th className={`${styles.num} ${styles.sortable} ${sortKey === 'users' ? styles.sortActive : ''}`} onClick={() => toggleSort('users')}>ユーザー{arrow('users')}</th>
                                        <th className={`${styles.num} ${styles.sortable} ${sortKey === 'cv' ? styles.sortActive : ''}`} onClick={() => toggleSort('cv')}>CV{arrow('cv')}</th>
                                        <th className={`${styles.num} ${styles.sortable} ${sortKey === 'cvr' ? styles.sortActive : ''}`} onClick={() => toggleSort('cvr')}>CVR{arrow('cvr')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedRows.map((r, i) => {
                                        const d = describeUtm(r.source, r.medium, r.campaign)
                                        const cv = totalCvOf(r)
                                        return (
                                            <tr key={`${r.source}|${r.medium}|${r.campaign}|${i}`}>
                                                <td><Badge category={d.category} /></td>
                                                <td className={styles.mono}>{r.source} / {r.medium}<br />{r.campaign}</td>
                                                <td>
                                                    <div className={styles.meaning}>{d.label}</div>
                                                    <div className={styles.timing}>{d.timing}</div>
                                                    {d.warning && <div className={styles.warn}>⚠️ {d.warning}</div>}
                                                </td>
                                                <td className={`${styles.num} ${styles.strong}`}>{r.sessions.toLocaleString()}</td>
                                                <td className={styles.num}>{r.users.toLocaleString()}</td>
                                                <td className={styles.num}>{cv > 0 ? cv.toLocaleString() : '－'}<br /><span className={styles.summaryHint}>{cv > 0 ? `応${r.applyCv}/LP${r.lpApplyCv}/登${r.signupCv}` : ''}</span></td>
                                                <td className={styles.num}>{r.sessions > 0 && cv > 0 ? `${((cv / r.sessions) * 100).toFixed(1)}%` : '－'}</td>
                                            </tr>
                                        )
                                    })}
                                    {rows.length === 0 && (
                                        <tr><td colSpan={7} className={styles.empty}>該当するUTMがありません</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <p className={styles.tableNote}>
                            ※ CV = 応募(/entry/thanks) + LP応募(/lp-thanks) + 会員登録(/members/signup/thanks) 到達ユーザー。スカウトSMS等は送客が目的のため会員登録CVはほぼ0（scoutId経由の応募に効く）。<br />
                            ※ 2026-08-11〜のUnassignedインシデント中はsource欠落セッションが増えており、チャネル別の絶対数は割り引いて見てください。全GA4集計はデフォルトで国=日本フィルタ適用。
                        </p>
                    </div>
                </>
            )}
        </div>
    )
}
