'use client'

import { useEffect, useRef, useState } from 'react'
import { useProduct } from '@/contexts/ProductContext'
import PageShell from '@/components/PageShell'
import FilterBar, { FilterField } from '@/components/FilterBar'
import PeriodSelect from '@/components/PeriodSelect'
import Alert from '@/components/Alert'
import { ui, cx } from '@/components/ui'
import { usePeriodRange } from '@/hooks/usePeriodRange'
import { useReport } from '@/hooks/useReport'
import { type PeriodOption } from '@/lib/utils/period'
import type { PageFlowNextRow, PageFlowPrevRow, PageFlowResponse } from '@/lib/services/journey/pageFlowTypes'
import styles from './PageFlowPage.module.css'

const PERIOD_OPTIONS: PeriodOption[] = [
    { value: '7daysAgo', label: '過去7日' },
    { value: '14daysAgo', label: '過去14日' },
    { value: '30daysAgo', label: '過去30日' },
    { value: '90daysAgo', label: '過去90日' },
]

const EXAMPLES = ['/lp-thanks', '/members/signup', '/entry/thanks', '/driver']

function PrevTable({ title, rows, totalPv, emptyText }: { title: string; rows: PageFlowPrevRow[]; totalPv: number; emptyText: string }) {
    const max = Math.max(1, ...rows.map((r) => r.pv))
    return (
        <div className={ui.card}>
            <h2 className={ui.sectionTitle}>{title}</h2>
            {rows.length === 0 ? (
                <p className={ui.empty}>{emptyText}</p>
            ) : (
                <div className={ui.tableWrap}>
                    <table className={ui.dataTable}>
                        <thead>
                            <tr>
                                <th>経路（直前ページ）</th>
                                <th className={ui.num}>到達PV</th>
                                <th className={styles.barCol}></th>
                                <th className={ui.num}>構成比</th>
                                <th className={ui.num}>経路の表示PV</th>
                                <th className={ui.num}>遷移率</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.page}>
                                    <td className={styles.pathCell}>{r.page}</td>
                                    <td className={ui.num}>{r.pv.toLocaleString()}</td>
                                    <td className={styles.barCol}><div className={styles.bar} style={{ width: `${(r.pv / max) * 100}%` }} /></td>
                                    <td className={ui.num}>{totalPv > 0 ? `${((r.pv / totalPv) * 100).toFixed(1)}%` : '－'}</td>
                                    <td className={ui.num}>{r.sourcePv != null ? r.sourcePv.toLocaleString() : '－'}</td>
                                    <td className={ui.num}>{r.transitionRate != null ? `${(r.transitionRate * 100).toFixed(1)}%` : '－'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <p className={ui.tableNote}>
                遷移率 = 到達PV ÷ 経路ページの表示PV（そのページを見たうち何%が対象ページへ進んだか）。外部サイトは表示PVを取得できないため「－」。
            </p>
        </div>
    )
}

function FlowTable({ title, rows, total, emptyText }: { title: string; rows: PageFlowNextRow[]; total: number; emptyText: string }) {
    const max = Math.max(1, ...rows.map((r) => r.users))
    return (
        <div className={ui.card}>
            <h2 className={ui.sectionTitle}>{title}</h2>
            {rows.length === 0 ? (
                <p className={ui.empty}>{emptyText}</p>
            ) : (
                <div className={ui.tableWrap}>
                    <table className={ui.dataTable}>
                        <thead>
                            <tr>
                                <th>ページ</th>
                                <th className={ui.num}>ユーザー</th>
                                <th className={styles.barCol}></th>
                                <th className={ui.num}>構成比</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.page}>
                                    <td className={styles.pathCell}>{r.page}</td>
                                    <td className={ui.num}>{r.users.toLocaleString()}</td>
                                    <td className={styles.barCol}><div className={styles.bar} style={{ width: `${(r.users / max) * 100}%` }} /></td>
                                    <td className={ui.num}>{total > 0 ? `${((r.users / total) * 100).toFixed(1)}%` : '－'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

export default function PageFlowPage() {
    const { currentProduct } = useProduct()
    const [pagePath, setPagePath] = useState('')
    const periodState = usePeriodRange('30daysAgo')
    const { range } = periodState
    const target = pagePath.trim()
    const pathOk = target.startsWith('/')

    // 分析するパスを打ち込んでから実行する手動型
    const report = useReport<PageFlowResponse>('/api/pageflow', {
        body: { propertyId: currentProduct?.ga4PropertyId, pagePath: target, startDate: range?.startDate, endDate: range?.endDate },
        manual: true,
    })
    const data = report.data

    // 例チップは「パスを入れてすぐ実行」なので、state 反映後の描画で run する
    const [pendingRun, setPendingRun] = useState(false)
    const runRef = useRef(report.run)
    runRef.current = report.run
    useEffect(() => {
        if (!pendingRun) return
        setPendingRun(false)
        runRef.current()
    }, [pendingRun])

    function analyze(path?: string) {
        if (path) {
            setPagePath(path)
            setPendingRun(true)
            return
        }
        if (!pathOk) return
        report.run()
    }

    return (
        <PageShell
            pageId="pageflow"
            requireProduct
            status={{ loading: report.loading, error: report.error, source: 'ga4', onRetry: report.run }}
            controls={
                <div className={ui.card}>
                    <FilterBar onSubmit={() => analyze()} submitLabel="分析する" submitting={report.loading} disabled={!currentProduct || !range || !pathOk}>
                        <FilterField label="ページパス（前方一致）" hint={target && !pathOk ? '/ で始めてください（例: /lp-thanks）' : undefined}>
                            <input
                                type="text"
                                className={styles.pathInput}
                                placeholder="例: /lp-thanks"
                                value={pagePath}
                                onChange={(e) => setPagePath(e.target.value)}
                            />
                        </FilterField>
                        <FilterField label="期間">
                            <PeriodSelect state={periodState} options={PERIOD_OPTIONS} />
                        </FilterField>
                    </FilterBar>
                    <div className={styles.examples}>
                        例:
                        {EXAMPLES.map((ex) => (
                            <button key={ex} type="button" className={styles.exampleChip} onClick={() => analyze(ex)} disabled={report.loading}>
                                {ex}
                            </button>
                        ))}
                    </div>
                    {currentProduct && !currentProduct.ga4PropertyId && (
                        <Alert tone="warn">このプロダクトには GA4 プロパティが設定されていません</Alert>
                    )}
                </div>
            }
        >
            {data && (
                <>
                    <div className={cx(ui.card, styles.targetCard)}>
                        <span className={ui.summaryLabel}>対象: <code className={styles.pathCode}>{data.pagePath}</code>（前方一致）</span>
                        <span className={styles.targetValue}>{data.targetUsers.toLocaleString()} ユーザー到達</span>
                        <span className={ui.note}>{data.startDate} 〜 {data.endDate}</span>
                    </div>

                    <PrevTable
                        title="← 経路別比較（直前ページ: 表示PV × 到達PV × 遷移率）"
                        rows={data.prevPages}
                        totalPv={data.prevPages.reduce((s, r) => s + r.pv, 0)}
                        emptyText="リファラーデータがありません"
                    />

                    <FlowTable
                        title="直後に見たページ →"
                        rows={data.nextPages}
                        total={data.targetUsers}
                        emptyText="このページを起点とした遷移がありません"
                    />

                    <p className={ui.tableNote}>
                        ※ 「直前」のうちリファラーなし（ブックマーク・アプリ・直打ち等）: {data.prevNoReferrer.toLocaleString()} ユーザー。<br />
                        ※ GA4のリファラーベースの近似集計です。同一ページ内の遷移・リロードは除外しています。<br />
                        ※ 経路はページ単位で表示されるため、/driver 〜 /others の大職種一覧14種もそれぞれ個別の行として内訳が見えます。
                    </p>
                </>
            )}
        </PageShell>
    )
}
