'use client'

import { useCallback, useEffect, useState } from 'react'
import { useProduct } from '@/lib/contexts/ProductContext'
import BackLink from '@/components/BackLink'
import RelatedPages from '@/components/RelatedPages/RelatedPages'
import PeriodSelect, { usePeriodRange } from '@/components/PeriodSelect/PeriodSelect'
import { withCustomOption, PeriodOption } from '@/lib/utils/period'
import { parseJsonResponse } from '@/lib/utils/fetch'
import styles from './ApplyFieldsPage.module.css'

interface FieldRow { name: string; users: number }
interface JobTypeRow {
    key: string
    label: string
    detailViews: number
    formViews: number
    completed: number
    formToComplete: number | null
    overallRate: number | null
    fields?: FieldRow[]
}
interface CvTypesResponse {
    jobTypes: JobTypeRow[]
    startDate: string
    endDate: string
}

const PERIOD_OPTIONS: PeriodOption[] = [
    { value: '14daysAgo', label: '過去14日' },
    { value: '30daysAgo', label: '過去30日' },
    { value: '90daysAgo', label: '過去90日' },
]

const TYPE_COLORS: Record<string, string> = {
    JobR: '#60a5fa',
    JobH: '#fbbf24',
    JobA: '#f87171',
}

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
    const [data, setData] = useState<CvTypesResponse | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        if (!currentProduct?.ga4PropertyId || !range) return
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/cv-types', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    propertyId: currentProduct.ga4PropertyId,
                    startDate: range.startDate,
                    endDate: range.endDate,
                }),
            })
            const json = await parseJsonResponse<CvTypesResponse & { error?: string }>(res)
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

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>応募フォーム 項目別タップ計測</h1>
                    <p className={styles.subtitle}>
                        各応募種別で、フォームの入力項目がどれだけタップ（着手）されているかの実数です。値はGTMクリックラベル
                        <code>EF__種別__Field__項目</code> のユニークユーザー数（ファネルではなく発火数）。
                    </p>
                </div>
                <BackLink href="/">ダッシュボード</BackLink>
            </div>

            {!currentProduct && <div className={styles.notice}>プロダクトを選択してください</div>}

            <RelatedPages pages={[{ href: '/cv-types', label: '求人種別CV分析' }, { href: '/signup-funnel', label: '会員登録フォームファネル' }, { href: '/funnel/path', label: '経路ファネルビルダー' }]} />

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
                    <div className={styles.cardGrid}>
                        {data.jobTypes.map((t) => {
                            const color = TYPE_COLORS[t.key] ?? '#9ca3af'
                            const fired = (t.fields ?? []).filter((f) => f.users > 0)
                            const denom = t.formViews > 0 ? t.formViews : 1
                            const totalFields = FIELDS_PER_TYPE[t.key]
                            return (
                                <div key={t.key} className={styles.card} style={{ borderTopColor: color }}>
                                    <div className={styles.cardHead}>
                                        <span className={styles.cardTitle}>{t.label}</span>
                                    </div>
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
                                        <p className={styles.emptyNote}>この期間に発火した項目タップはありません。</p>
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
                                                        <div
                                                            className={styles.barFill}
                                                            style={{ width: `${Math.min(100, rate)}%`, background: color }}
                                                        />
                                                    </div>
                                                </div>
                                            )
                                        })
                                    )}
                                </div>
                            )
                        })}
                    </div>

                    <div className={styles.noteCard}>
                        <p className={styles.tableNote}>
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
        </div>
    )
}
