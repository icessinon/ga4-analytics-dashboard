'use client'

import { useProduct } from '@/contexts/ProductContext'
import PageShell from '@/components/PageShell'
import PeriodSelect from '@/components/PeriodSelect'
import { ui } from '@/components/ui'
import { usePeriodRange } from '@/hooks/usePeriodRange'
import { useReport } from '@/hooks/useReport'
import { type PeriodOption } from '@/lib/utils/period'
import { JOB_TYPE_COLORS } from '@/lib/services/cv/jobTypeLabels'
import type { CvTypesResponse } from '@/lib/services/cv/cvTypesTypes'
import styles from './ApplyFieldsPage.module.css'

const PERIOD_OPTIONS: PeriodOption[] = [
    { value: '14daysAgo', label: '過去14日' },
    { value: '30daysAgo', label: '過去30日' },
    { value: '90daysAgo', label: '過去90日' },
]

function pct(v: number | null): string {
    return v != null ? `${(v * 100).toFixed(1)}%` : '－'
}

// 種別ごとに「フォームに存在する項目」（drm-front の entry フォーム定義に基づく）。
// 人材紹介/ハローワークは agency 判定で3項目固定、求人広告のみ最大8項目。
const FIELDS_PER_TYPE: Record<string, number> = { JobR: 3, JobH: 3, JobA: 8 }

export default function ApplyFieldsPage() {
    const { currentProduct } = useProduct()
    const periodState = usePeriodRange('30daysAgo')
    const { range } = periodState

    const report = useReport<CvTypesResponse>('/api/cv-types', {
        body: { propertyId: currentProduct?.ga4PropertyId, startDate: range?.startDate, endDate: range?.endDate },
        enabled: !!currentProduct?.ga4PropertyId && !!range,
    })
    const data = report.data

    return (
        <PageShell
            pageId="applyFields"
            requireProduct
            status={{ loading: report.loading, error: report.error, source: 'ga4', onRetry: report.run }}
            controls={<PeriodSelect state={periodState} options={PERIOD_OPTIONS} resolved={data} />}
        >
            {data && (
                <>
                    <div className={styles.cardGrid}>
                        {data.jobTypes.map((t) => {
                            const color = JOB_TYPE_COLORS[t.key] ?? 'var(--text-muted)'
                            const fired = (t.fields ?? []).filter((f) => f.users > 0)
                            const denom = t.formViews > 0 ? t.formViews : 1
                            const totalFields = FIELDS_PER_TYPE[t.key]
                            return (
                                <div key={t.key} className={styles.typeCard} style={{ borderTopColor: color }}>
                                    <h2 className={styles.cardTitle}>{t.label}</h2>
                                    <div className={styles.cvrRow}>
                                        <div className={styles.cvrCell}>
                                            <span className={styles.cvrValue} style={{ color }}>{pct(t.formToComplete)}</span>
                                            <span className={styles.cvrLabel}>フォーム完了率<br />（送信 / フォーム表示）</span>
                                        </div>
                                        <div className={styles.cvrCell}>
                                            <span className={styles.cvrValue}>{pct(t.overallRate)}</span>
                                            <span className={styles.cvrLabel}>詳細→完了<br />（送信 / 詳細閲覧）</span>
                                        </div>
                                    </div>
                                    <p className={styles.cardMeta}>
                                        詳細閲覧 <strong>{t.detailViews.toLocaleString()}</strong> ／ フォーム表示 <strong>{t.formViews.toLocaleString()}</strong> ／ 送信完了 <strong>{t.completed.toLocaleString()}</strong>
                                        <br />
                                        計測対象の項目数: <strong>{fired.length}</strong>
                                        {totalFields != null ? ` / ${totalFields}（フォームに存在する項目数）` : ''}
                                    </p>

                                    {fired.length === 0 ? (
                                        <p className={ui.note}>この期間に発火した項目タップはありません。</p>
                                    ) : (
                                        fired.map((f) => {
                                            const rate = (f.users / denom) * 100
                                            return (
                                                <div key={f.name} className={styles.fieldRow}>
                                                    <div className={styles.fieldLabelLine}>
                                                        <span className={styles.fieldName}>{f.name}</span>
                                                        <span className={styles.fieldValue}>
                                                            {f.users.toLocaleString()}
                                                            <span className={styles.fieldPct}>対フォーム {rate.toFixed(0)}%</span>
                                                        </span>
                                                    </div>
                                                    <div className={styles.barTrack}>
                                                        <div className={styles.barFill} style={{ width: `${Math.min(100, rate)}%`, background: color }} />
                                                    </div>
                                                </div>
                                            )
                                        })
                                    )}
                                </div>
                            )
                        })}
                    </div>

                    <div className={ui.card}>
                        <p className={ui.tableNote} style={{ marginTop: 0 }}>
                            ※ 数値は各項目を1度でもタップ（着手）したユニークユーザー数。バーの長さ・%は「フォーム表示」に対する割合です。
                            並び順・遷移は表しません（各項目は独立カウントで、ファネルではありません）。<br />
                            ※ <strong>計測漏れはありません</strong>。本体フォーム（drm-front）を確認済みで、画面に描画される全項目にラベルが付いています。
                            人材紹介・ハローワークは「非会員のままゲスト応募」導線のため<strong>フォームに氏名・生まれ年・電話番号の3項目しか存在しない</strong>設計で、
                            それ以外の項目はそもそも画面に無いため発火しません（求人広告のみ最大8項目）。<br />
                            ※ <strong>2026-07-28以降のデータのみ有効</strong>（それ以前はGTM設定によりテキスト入力が未計測。期間を広げても増えません）。<br />
                            ※ 会員はプロフィール自動入力のため項目に触れず送信します。項目の数字は実質<strong>ゲスト応募の行動</strong>です。
                        </p>
                    </div>
                </>
            )}
        </PageShell>
    )
}
