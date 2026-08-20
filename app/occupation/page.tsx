'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { useProduct } from '@/lib/contexts/ProductContext'
import BackLink from '@/components/BackLink'
import RelatedPages from '@/components/RelatedPages/RelatedPages'
import AISpinner from '@/components/AISpinner/AISpinner'
import PeriodSelect, { usePeriodRange } from '@/components/PeriodSelect/PeriodSelect'
import { withCustomOption, PeriodOption } from '@/lib/utils/period'
import { parseJsonResponse } from '@/lib/utils/fetch'
import styles from './OccupationPage.module.css'

interface OccupationRow {
    occ: string
    label: string
    slug: string | null
    signupCv: number
    sessions: number | null
    signupRate: number | null
}

interface LpApplyRow {
    slug: string
    label: string
    cv: number
}

interface OccupationResponse {
    occupations: OccupationRow[]
    noOccSignupCv: number
    totalSignupCv: number
    totalSessions: number
    overallSignupRate: number | null
    lpApplies: LpApplyRow[]
    totalLpApplyCv: number
    startDate: string
    endDate: string
}

interface OccupationDetail {
    slug: string
    totalSessions: number
    listTopSessions: number
    prefectureSessions: number
    jobDetailAndOtherSessions: number
    subCategories: Array<{ segment: string; path: string; sessions: number }>
}

const PERIOD_OPTIONS: PeriodOption[] = [
    { value: '7daysAgo', label: '過去7日' },
    { value: '14daysAgo', label: '過去14日' },
    { value: '30daysAgo', label: '過去30日' },
    { value: '90daysAgo', label: '過去90日' },
]

function renderAiLine(line: string, i: number) {
    const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const bold = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    return <p key={i} className={styles.aiLine} dangerouslySetInnerHTML={{ __html: bold }} />
}

export default function OccupationPage() {
    const { currentProduct } = useProduct()
    const periodState = usePeriodRange('30daysAgo')
    const { range } = periodState
    const [data, setData] = useState<OccupationResponse | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [analysis, setAnalysis] = useState<string | null>(null)
    const [aiLoading, setAiLoading] = useState(false)
    const [aiError, setAiError] = useState<string | null>(null)
    const [expandedOcc, setExpandedOcc] = useState<string | null>(null)
    const [details, setDetails] = useState<Record<string, OccupationDetail | 'loading' | 'error'>>({})

    const load = useCallback(async () => {
        if (!currentProduct?.ga4PropertyId || !range) return
        setLoading(true)
        setError(null)
        setAnalysis(null)
        setAiError(null)
        setExpandedOcc(null)
        setDetails({})
        try {
            const res = await fetch('/api/occupation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    propertyId: currentProduct.ga4PropertyId,
                    startDate: range.startDate,
                    endDate: range.endDate,
                }),
            })
            const json = await parseJsonResponse<OccupationResponse & { error?: string }>(res)
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

    async function handleAnalyze() {
        if (!data || aiLoading) return
        setAiLoading(true)
        setAiError(null)
        try {
            const res = await fetch('/api/occupation/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    occupations: data.occupations,
                    lpApplies: data.lpApplies,
                    noOccSignupCv: data.noOccSignupCv,
                    totalSessions: data.totalSessions,
                    overallSignupRate: data.overallSignupRate,
                    startDate: data.startDate,
                    endDate: data.endDate,
                    productId: currentProduct?.id,
                }),
            })
            const json = await parseJsonResponse<{ analysis?: string; error?: string }>(res)
            if (!res.ok || !json.analysis) throw new Error(json.error || 'AI分析に失敗しました')
            setAnalysis(json.analysis)
        } catch (e) {
            setAiError(e instanceof Error ? e.message : 'AI分析に失敗しました')
        } finally {
            setAiLoading(false)
        }
    }

    async function toggleDetail(o: OccupationRow) {
        if (!o.slug || !currentProduct?.ga4PropertyId || !range) return
        if (expandedOcc === o.occ) {
            setExpandedOcc(null)
            return
        }
        setExpandedOcc(o.occ)
        if (details[o.occ]) return
        setDetails((prev) => ({ ...prev, [o.occ]: 'loading' }))
        try {
            const res = await fetch('/api/occupation/detail', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    propertyId: currentProduct.ga4PropertyId,
                    slug: o.slug,
                    startDate: range.startDate,
                    endDate: range.endDate,
                }),
            })
            const json = await parseJsonResponse<OccupationDetail & { error?: string }>(res)
            if (!res.ok) throw new Error(json.error || '取得に失敗しました')
            setDetails((prev) => ({ ...prev, [o.occ]: json }))
        } catch {
            setDetails((prev) => ({ ...prev, [o.occ]: 'error' }))
        }
    }

    const maxSignupCv = Math.max(1, ...(data?.occupations.map((o) => o.signupCv) ?? [1]))

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>職種別CV分析</h1>
                    <p className={styles.subtitle}>
                        会員登録フォームの職種パラメータ（occ）別の登録CVと、職種ページ配下のセッションから、職種ごとの獲得状況を比較します。
                    </p>
                </div>
                <BackLink href="/">ダッシュボード</BackLink>
            </div>

            {!currentProduct && <div className={styles.notice}>プロダクトを選択してください</div>}
            {currentProduct && !currentProduct.ga4PropertyId && (
                <div className={styles.notice}>このプロダクトには GA4 プロパティが設定されていません</div>
            )}

            <RelatedPages pages={[{ href: '/cv-types', label: '求人種別CV分析' }, { href: '/insights', label: '月次インサイト' }, { href: '/funnel/path', label: '経路ファネルビルダー' }]} />

            <div className={styles.controls}>
                <PeriodSelect
                    state={periodState}
                    options={withCustomOption(PERIOD_OPTIONS)}
                    selectClassName={styles.select}
                    noteClassName={styles.periodNote}
                    resolved={data}
                />
            </div>

            {loading && <p className={styles.loading}>読み込み中...</p>}
            {error && <div className={styles.error}>{error}</div>}

            {data && !loading && (
                <>
                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>全体（サイト全体）</h2>
                        <div className={styles.summaryRow}>
                            <div className={styles.summaryCard}>
                                <span className={styles.summaryLabel}>サイト全体セッション</span>
                                <span className={styles.summaryValue}>{data.totalSessions.toLocaleString()}</span>
                            </div>
                            <div className={styles.summaryCard}>
                                <span className={styles.summaryLabel}>会員登録CV合計</span>
                                <span className={styles.summaryValue}>{data.totalSignupCv.toLocaleString()}</span>
                                <span className={styles.summaryHint}>うち職種指定なし {data.noOccSignupCv.toLocaleString()}</span>
                            </div>
                            <div className={styles.summaryCard}>
                                <span className={styles.summaryLabel}>全体登録率</span>
                                <span className={styles.summaryValue}>
                                    {data.overallSignupRate != null ? `${(data.overallSignupRate * 100).toFixed(2)}%` : '－'}
                                </span>
                                <span className={styles.summaryHint}>会員登録CV合計 ÷ サイト全体セッション</span>
                            </div>
                            <div className={styles.summaryCard}>
                                <span className={styles.summaryLabel}>LP応募CV合計</span>
                                <span className={styles.summaryValue}>{data.totalLpApplyCv.toLocaleString()}</span>
                                <span className={styles.summaryHint}>事業領域別LP経由</span>
                            </div>
                        </div>
                    </div>

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>職種別内訳</h2>
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>職種</th>
                                        <th className={styles.num}>会員登録CV</th>
                                        <th className={styles.barCol}></th>
                                        <th className={styles.num}>職種配下セッション</th>
                                        <th className={styles.num}>登録率</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.occupations.map((o) => {
                                        const detail = details[o.occ]
                                        const expanded = expandedOcc === o.occ
                                        return (
                                            <Fragment key={o.occ}>
                                                <tr
                                                    className={o.slug ? styles.expandableRow : undefined}
                                                    onClick={() => toggleDetail(o)}
                                                >
                                                    <td>
                                                        {o.slug && <span className={styles.expandIcon}>{expanded ? '▾' : '▸'}</span>}
                                                        {o.label}<span className={styles.occKey}>{o.occ}</span>
                                                        {o.slug && <span className={styles.slugKey}>/{o.slug} 配下</span>}
                                                    </td>
                                                    <td className={styles.num}>{o.signupCv.toLocaleString()}</td>
                                                    <td className={styles.barCol}>
                                                        <div className={styles.bar} style={{ width: `${(o.signupCv / maxSignupCv) * 100}%` }} />
                                                    </td>
                                                    <td className={styles.num}>{o.sessions != null ? o.sessions.toLocaleString() : '－'}</td>
                                                    <td className={styles.num}>{o.signupRate != null ? `${(o.signupRate * 100).toFixed(2)}%` : '－'}</td>
                                                </tr>
                                                {expanded && (
                                                    <tr className={styles.detailRow}>
                                                        <td colSpan={5}>
                                                            {detail === 'loading' && <p className={styles.detailLoading}>内訳を読み込み中...</p>}
                                                            {detail === 'error' && <p className={styles.detailError}>内訳の取得に失敗しました</p>}
                                                            {detail && detail !== 'loading' && detail !== 'error' && (
                                                                <div className={styles.detailBox}>
                                                                    <div className={styles.detailSummary}>
                                                                        <span>一覧トップ（/{detail.slug}）: {detail.listTopSessions.toLocaleString()}</span>
                                                                        <span>都道府県ページ計: {detail.prefectureSessions.toLocaleString()}</span>
                                                                        <span>求人詳細・その他計: {detail.jobDetailAndOtherSessions.toLocaleString()}</span>
                                                                    </div>
                                                                    {detail.subCategories.length > 0 ? (
                                                                        <table className={styles.detailTable}>
                                                                            <thead>
                                                                                <tr>
                                                                                    <th>サブカテゴリ</th>
                                                                                    <th className={styles.num}>セッション</th>
                                                                                    <th className={styles.num}>職種内構成比</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {detail.subCategories.map((s) => (
                                                                                    <tr key={s.segment}>
                                                                                        <td><span className={styles.slugKey}>{s.path}</span></td>
                                                                                        <td className={styles.num}>{s.sessions.toLocaleString()}</td>
                                                                                        <td className={styles.num}>
                                                                                            {detail.totalSessions > 0 ? `${((s.sessions / detail.totalSessions) * 100).toFixed(1)}%` : '－'}
                                                                                        </td>
                                                                                    </tr>
                                                                                ))}
                                                                            </tbody>
                                                                        </table>
                                                                    ) : (
                                                                        <p className={styles.detailLoading}>サブカテゴリページがありません</p>
                                                                    )}
                                                                    <p className={styles.detailNote}>
                                                                        ※ サブカテゴリのセッションは一覧・検索ページのみで、求人詳細（media_）ページは「求人詳細・その他計」にまとめています。<br />
                                                                        ※ セッションのみの内訳です。会員登録CV（occ）は職種単位でしか計測されないため、サブカテゴリ別CVは表示できません。
                                                                    </p>
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <p className={styles.tableNote}>
                            登録率 = 会員登録CV ÷ 職種配下セッション。各行の対象URL範囲は職種名の下に表示しています（例: ドライバー = /driver 配下すべて）。<br />
                            ※ タクシー・バスは /driver 配下のサブカテゴリのため、セッションはドライバーと重複計上されます。<br />
                            ※ CVは登録フォームで選択された職種（occ）、セッションは対象URL配下ページの閲覧で、母集団は完全には一致しません（例:
                            トップページから直接登録した人はCVのみに計上）。全体の登録率と比較する際の近似指標としてご利用ください。
                        </p>
                    </div>

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}>事業領域別 LP応募CV</h2>
                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>事業領域</th>
                                        <th className={styles.num}>LP応募CV</th>
                                        <th className={styles.num}>構成比</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.lpApplies.map((l) => (
                                        <tr key={l.slug}>
                                            <td>{l.label}</td>
                                            <td className={styles.num}>{l.cv.toLocaleString()}</td>
                                            <td className={styles.num}>
                                                {data.totalLpApplyCv > 0 ? `${((l.cv / data.totalLpApplyCv) * 100).toFixed(1)}%` : '－'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className={styles.card}>
                        <div className={styles.aiHeader}>
                            <h2 className={styles.sectionTitle}>AI考察</h2>
                            <button className={styles.aiButton} onClick={handleAnalyze} disabled={aiLoading}>
                                {aiLoading ? '分析中...' : 'AIで分析する'}
                            </button>
                        </div>
                        {aiLoading && <p className={styles.aiLoadingText}><AISpinner /> 職種別の傾向を分析中...</p>}
                        {aiError && <div className={styles.error}>{aiError}</div>}
                        {analysis && (
                            <div className={styles.aiResult}>
                                {analysis.split('\n').map(renderAiLine)}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
