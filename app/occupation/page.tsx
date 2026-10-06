'use client'

import { Fragment, useEffect, useState } from 'react'
import { useProduct } from '@/lib/contexts/ProductContext'
import AISpinner from '@/components/AISpinner'
import PageShell from '@/components/PageShell'
import PeriodSelect from '@/components/PeriodSelect'
import Alert from '@/components/Alert'
import { ui, cx } from '@/components/ui'
import { usePeriodRange } from '@/hooks/usePeriodRange'
import { useReport } from '@/hooks/useReport'
import { fetchJson } from '@/lib/utils/fetch'
import { type PeriodOption } from '@/lib/utils/period'
import type { OccupationDetailResponse, OccupationResponse, OccupationRow } from '@/lib/services/cv/occupationTypes'
import styles from './OccupationPage.module.css'

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

type DetailState = OccupationDetailResponse | 'loading' | 'error'

export default function OccupationPage() {
    const { currentProduct } = useProduct()
    const periodState = usePeriodRange('30daysAgo')
    const { range } = periodState

    const report = useReport<OccupationResponse>('/api/occupation', {
        body: { propertyId: currentProduct?.ga4PropertyId, startDate: range?.startDate, endDate: range?.endDate },
        enabled: !!currentProduct?.ga4PropertyId && !!range,
    })
    const data = report.data

    const [analysis, setAnalysis] = useState<string | null>(null)
    const [aiLoading, setAiLoading] = useState(false)
    const [aiError, setAiError] = useState<string | null>(null)
    const [expandedOcc, setExpandedOcc] = useState<string | null>(null)
    const [details, setDetails] = useState<Record<string, DetailState>>({})

    // 期間が変わったら AI 考察と展開中の内訳は捨てる
    useEffect(() => {
        setAnalysis(null)
        setAiError(null)
        setExpandedOcc(null)
        setDetails({})
    }, [report.data])

    async function handleAnalyze() {
        if (!data || aiLoading) return
        setAiLoading(true)
        setAiError(null)
        try {
            const json = await fetchJson<{ analysis?: string }>('/api/occupation/gemini', {
                method: 'POST',
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
            if (!json.analysis) throw new Error('AI分析に失敗しました')
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
            const json = await fetchJson<OccupationDetailResponse>('/api/occupation/detail', {
                method: 'POST',
                body: JSON.stringify({ propertyId: currentProduct.ga4PropertyId, slug: o.slug, startDate: range.startDate, endDate: range.endDate }),
            })
            setDetails((prev) => ({ ...prev, [o.occ]: json }))
        } catch {
            setDetails((prev) => ({ ...prev, [o.occ]: 'error' }))
        }
    }

    const maxSignupCv = Math.max(1, ...(data?.occupations.map((o) => o.signupCv) ?? [1]))

    return (
        <PageShell
            pageId="occupation"
            requireProduct
            status={{ loading: report.loading, error: report.error, source: 'ga4', onRetry: report.run }}
            controls={<PeriodSelect state={periodState} options={PERIOD_OPTIONS} resolved={data} />}
        >
            {currentProduct && !currentProduct.ga4PropertyId && (
                <Alert tone="warn">このプロダクトには GA4 プロパティが設定されていません</Alert>
            )}

            {data && (
                <>
                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>全体（サイト全体）</h2>
                        <div className={ui.summaryRow}>
                            <div className={ui.summaryCard}>
                                <span className={ui.summaryLabel}>サイト全体セッション</span>
                                <span className={ui.summaryValue}>{data.totalSessions.toLocaleString()}</span>
                            </div>
                            <div className={ui.summaryCard}>
                                <span className={ui.summaryLabel}>会員登録CV合計</span>
                                <span className={ui.summaryValue}>{data.totalSignupCv.toLocaleString()}</span>
                                <span className={ui.summaryHint}>うち職種指定なし {data.noOccSignupCv.toLocaleString()}</span>
                            </div>
                            <div className={ui.summaryCard}>
                                <span className={ui.summaryLabel}>全体登録率</span>
                                <span className={ui.summaryValue}>{data.overallSignupRate != null ? `${(data.overallSignupRate * 100).toFixed(2)}%` : '－'}</span>
                                <span className={ui.summaryHint}>会員登録CV合計 ÷ サイト全体セッション</span>
                            </div>
                            <div className={ui.summaryCard}>
                                <span className={ui.summaryLabel}>LP応募CV合計</span>
                                <span className={ui.summaryValue}>{data.totalLpApplyCv.toLocaleString()}</span>
                                <span className={ui.summaryHint}>事業領域別LP経由</span>
                            </div>
                        </div>
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>職種別内訳</h2>
                        <div className={ui.tableWrap}>
                            <table className={ui.dataTable}>
                                <thead>
                                    <tr>
                                        <th>職種</th>
                                        <th className={ui.num}>会員登録CV</th>
                                        <th className={styles.barCol}></th>
                                        <th className={ui.num}>職種配下セッション</th>
                                        <th className={ui.num}>登録率</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.occupations.map((o) => {
                                        const detail = details[o.occ]
                                        const expanded = expandedOcc === o.occ
                                        return (
                                            <Fragment key={o.occ}>
                                                <tr className={o.slug ? styles.expandableRow : undefined} onClick={() => toggleDetail(o)}>
                                                    <td>
                                                        {o.slug && <span className={styles.expandIcon}>{expanded ? '▾' : '▸'}</span>}
                                                        {o.label}<span className={styles.occKey}>{o.occ}</span>
                                                        {o.slug && <span className={styles.slugKey}>/{o.slug} 配下</span>}
                                                    </td>
                                                    <td className={ui.num}>{o.signupCv.toLocaleString()}</td>
                                                    <td className={styles.barCol}><div className={styles.bar} style={{ width: `${(o.signupCv / maxSignupCv) * 100}%` }} /></td>
                                                    <td className={ui.num}>{o.sessions != null ? o.sessions.toLocaleString() : '－'}</td>
                                                    <td className={ui.num}>{o.signupRate != null ? `${(o.signupRate * 100).toFixed(2)}%` : '－'}</td>
                                                </tr>
                                                {expanded && (
                                                    <tr className={styles.detailRow}>
                                                        <td colSpan={5}>
                                                            {detail === 'loading' && <p className={ui.note}>内訳を読み込み中...</p>}
                                                            {detail === 'error' && <Alert tone="error">内訳の取得に失敗しました</Alert>}
                                                            {detail && detail !== 'loading' && detail !== 'error' && (
                                                                <div className={styles.detailBox}>
                                                                    <div className={styles.detailSummary}>
                                                                        <span>一覧トップ（/{detail.slug}）: {detail.listTopSessions.toLocaleString()}</span>
                                                                        <span>都道府県ページ計: {detail.prefectureSessions.toLocaleString()}</span>
                                                                        <span>求人詳細・その他計: {detail.jobDetailAndOtherSessions.toLocaleString()}</span>
                                                                    </div>
                                                                    {detail.subCategories.length > 0 ? (
                                                                        <table className={cx(ui.dataTable, styles.detailTable)}>
                                                                            <thead>
                                                                                <tr>
                                                                                    <th>サブカテゴリ</th>
                                                                                    <th className={ui.num}>セッション</th>
                                                                                    <th className={ui.num}>職種内構成比</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {detail.subCategories.map((s) => (
                                                                                    <tr key={s.segment}>
                                                                                        <td><code className={styles.pathCode}>{s.path}</code></td>
                                                                                        <td className={ui.num}>{s.sessions.toLocaleString()}</td>
                                                                                        <td className={ui.num}>{detail.totalSessions > 0 ? `${((s.sessions / detail.totalSessions) * 100).toFixed(1)}%` : '－'}</td>
                                                                                    </tr>
                                                                                ))}
                                                                            </tbody>
                                                                        </table>
                                                                    ) : (
                                                                        <p className={ui.note}>サブカテゴリページがありません</p>
                                                                    )}
                                                                    <p className={ui.tableNote}>
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
                        <p className={ui.tableNote}>
                            登録率 = 会員登録CV ÷ 職種配下セッション。各行の対象URL範囲は職種名の下に表示しています（例: ドライバー = /driver 配下すべて）。<br />
                            ※ タクシー・バスは /driver 配下のサブカテゴリのため、セッションはドライバーと重複計上されます。<br />
                            ※ CVは登録フォームで選択された職種（occ）、セッションは対象URL配下ページの閲覧で、母集団は完全には一致しません（例:
                            トップページから直接登録した人はCVのみに計上）。全体の登録率と比較する際の近似指標としてご利用ください。
                        </p>
                    </div>

                    <div className={ui.card}>
                        <h2 className={ui.sectionTitle}>事業領域別 LP応募CV</h2>
                        <div className={ui.tableWrap}>
                            <table className={ui.dataTable}>
                                <thead>
                                    <tr>
                                        <th>事業領域</th>
                                        <th className={ui.num}>LP応募CV</th>
                                        <th className={ui.num}>構成比</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.lpApplies.map((l) => (
                                        <tr key={l.slug}>
                                            <td>{l.label}</td>
                                            <td className={ui.num}>{l.cv.toLocaleString()}</td>
                                            <td className={ui.num}>{data.totalLpApplyCv > 0 ? `${((l.cv / data.totalLpApplyCv) * 100).toFixed(1)}%` : '－'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className={ui.card}>
                        <div className={styles.aiHeader}>
                            <h2 className={ui.sectionTitle} style={{ marginBottom: 0 }}>AI考察</h2>
                            <button type="button" className={ui.btnPrimary} onClick={handleAnalyze} disabled={aiLoading}>
                                {aiLoading ? <span className={ui.inlineLoading}><AISpinner /> 分析中...</span> : 'AIで分析する'}
                            </button>
                        </div>
                        {aiError && <Alert tone="error">{aiError}</Alert>}
                        {analysis && <div className={ui.aiResult}>{analysis.split('\n').map(renderAiLine)}</div>}
                    </div>
                </>
            )}
        </PageShell>
    )
}
