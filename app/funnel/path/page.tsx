'use client'

import { useEffect, useState } from 'react'
import { useProduct } from '@/lib/contexts/ProductContext'
import BackLink from '@/components/BackLink'
import RelatedPages from '@/components/RelatedPages/RelatedPages'
import PeriodSelect, { usePeriodRange } from '@/components/PeriodSelect/PeriodSelect'
import { withCustomOption, PeriodOption } from '@/lib/utils/period'
import { parseJsonResponse } from '@/lib/utils/fetch'
import styles from './PathFunnelPage.module.css'

interface StepInput {
    name: string
    type: 'page' | 'click'
    matchType: 'EXACT' | 'BEGINS_WITH' | 'CONTAINS' | 'PARTIAL_REGEXP'
    value: string
}

interface StepResult {
    name: string
    users: number
    completionRate: number | null
    abandonments: number
}

interface SavedFunnel {
    name: string
    steps: StepInput[]
}

interface ComparisonResult {
    name: string
    steps: StepResult[]
}

const STORAGE_KEY = 'pathFunnelSaved'

const MATCH_OPTIONS: Array<{ value: StepInput['matchType']; label: string }> = [
    { value: 'EXACT', label: '完全一致' },
    { value: 'BEGINS_WITH', label: '前方一致' },
    { value: 'CONTAINS', label: '部分一致' },
    { value: 'PARTIAL_REGEXP', label: '正規表現' },
]

const PERIOD_OPTIONS: PeriodOption[] = [
    { value: '7daysAgo', label: '過去7日' },
    { value: '14daysAgo', label: '過去14日' },
    { value: '30daysAgo', label: '過去30日' },
    { value: '90daysAgo', label: '過去90日' },
]

const PRESETS: SavedFunnel[] = [
    {
        name: '王道経路（トップ→検索モーダル→検索結果→求人詳細→応募）',
        steps: [
            { name: 'トップページ閲覧', type: 'page', matchType: 'EXACT', value: '/' },
            { name: '検索モーダル操作', type: 'click', matchType: 'BEGINS_WITH', value: 'MW__' },
            { name: '検索結果閲覧', type: 'page', matchType: 'BEGINS_WITH', value: '/search' },
            { name: '求人詳細閲覧', type: 'page', matchType: 'PARTIAL_REGEXP', value: '/media_' },
            { name: '応募フォーム', type: 'page', matchType: 'BEGINS_WITH', value: '/entry/' },
        ],
    },
    {
        name: '職種直リンク導線（トップ→職種ボタン→一覧→求人詳細→応募）',
        steps: [
            { name: 'トップページ閲覧', type: 'page', matchType: 'EXACT', value: '/' },
            { name: '職種ボタンタップ', type: 'click', matchType: 'BEGINS_WITH', value: 'CT__Occupation__' },
            { name: '職種一覧・検索閲覧', type: 'page', matchType: 'PARTIAL_REGEXP', value: '^/(driver|sekokan|sekkei|soko|shokunin|seibi|hoshu|setsubi-sagyo|keibi|unkan|kojo-sagyo|food|unyu-sagyo|others)' },
            { name: '求人詳細閲覧', type: 'page', matchType: 'PARTIAL_REGEXP', value: '/media_' },
            { name: '応募フォーム', type: 'page', matchType: 'BEGINS_WITH', value: '/entry/' },
        ],
    },
    {
        name: 'キープ経由（キープ一覧→求人詳細→応募。詳細への遷移率が最も高い導線）',
        steps: [
            { name: 'キープ・お気に入り閲覧', type: 'page', matchType: 'BEGINS_WITH', value: '/favorite' },
            { name: '求人詳細閲覧', type: 'page', matchType: 'PARTIAL_REGEXP', value: '/media_' },
            { name: '応募フォーム', type: 'page', matchType: 'BEGINS_WITH', value: '/entry/' },
        ],
    },
]

const EMPTY_STEP: StepInput = { name: '', type: 'page', matchType: 'BEGINS_WITH', value: '' }

export default function PathFunnelPage() {
    const { currentProduct } = useProduct()
    const [steps, setSteps] = useState<StepInput[]>(PRESETS[0].steps.map((s) => ({ ...s })))
    const periodState = usePeriodRange('30daysAgo')
    const { range } = periodState
    const [results, setResults] = useState<StepResult[] | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [saved, setSaved] = useState<SavedFunnel[]>([])
    const [saveName, setSaveName] = useState('')
    const [compareSelected, setCompareSelected] = useState<string[]>([])
    const [comparison, setComparison] = useState<ComparisonResult[] | null>(null)
    const [comparing, setComparing] = useState(false)

    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY)
            if (raw) setSaved(JSON.parse(raw))
        } catch { /* localStorageが壊れていても無視 */ }
    }, [])

    function updateStep(i: number, patch: Partial<StepInput>) {
        setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
    }

    function addStep() {
        if (steps.length >= 10) return
        setSteps((prev) => [...prev, { ...EMPTY_STEP }])
    }

    function removeStep(i: number) {
        if (steps.length <= 2) return
        setSteps((prev) => prev.filter((_, idx) => idx !== i))
    }

    function moveStep(i: number, dir: -1 | 1) {
        const j = i + dir
        if (j < 0 || j >= steps.length) return
        setSteps((prev) => {
            const next = [...prev]
            ;[next[i], next[j]] = [next[j], next[i]]
            return next
        })
    }

    function loadFunnel(f: SavedFunnel) {
        setSteps(f.steps.map((s) => ({ ...s })))
        setResults(null)
        setError(null)
    }

    function saveFunnel() {
        const name = saveName.trim()
        if (!name) return
        const next = [...saved.filter((f) => f.name !== name), { name, steps }]
        setSaved(next)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        setSaveName('')
    }

    function deleteFunnel(name: string) {
        const next = saved.filter((f) => f.name !== name)
        setSaved(next)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    }

    async function run() {
        if (!currentProduct?.ga4PropertyId || loading || !range) return
        if (steps.some((s) => !s.value.trim())) {
            setError('すべてのステップに条件値を入力してください')
            return
        }
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/funnel/path', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    propertyId: currentProduct.ga4PropertyId,
                    steps,
                    startDate: range.startDate,
                    endDate: range.endDate,
                }),
            })
            const json = await parseJsonResponse<{ steps?: StepResult[]; error?: string }>(res)
            if (!res.ok || !json.steps) throw new Error(json.error || 'ファネル集計に失敗しました')
            setResults(json.steps)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'ファネル集計に失敗しました')
            setResults(null)
        } finally {
            setLoading(false)
        }
    }

    function toggleCompare(name: string) {
        setCompareSelected((prev) =>
            prev.includes(name) ? prev.filter((n) => n !== name) : prev.length >= 4 ? prev : [...prev, name]
        )
    }

    async function runComparison() {
        if (!currentProduct?.ga4PropertyId || comparing || compareSelected.length < 2 || !range) return
        const all = [...PRESETS, ...saved]
        const targets = compareSelected
            .map((name) => all.find((f) => f.name === name))
            .filter((f): f is SavedFunnel => Boolean(f))
        if (targets.length < 2) return
        setComparing(true)
        setError(null)
        try {
            const responses = await Promise.all(targets.map(async (f) => {
                const res = await fetch('/api/funnel/path', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        propertyId: currentProduct.ga4PropertyId,
                        steps: f.steps,
                        startDate: range.startDate,
                        endDate: range.endDate,
                    }),
                })
                const json = await parseJsonResponse<{ steps?: StepResult[]; error?: string }>(res)
                if (!res.ok || !json.steps) throw new Error(`「${f.name}」: ${json.error || '集計に失敗しました'}`)
                return { name: f.name, steps: json.steps }
            }))
            setComparison(responses)
        } catch (e) {
            setError(e instanceof Error ? e.message : '比較集計に失敗しました')
            setComparison(null)
        } finally {
            setComparing(false)
        }
    }

    const maxUsers = Math.max(1, ...(results?.map((r) => r.users) ?? [1]))
    const firstUsers = results?.[0]?.users ?? 0
    const compareCandidates = [...PRESETS, ...saved]
    const maxCompareSteps = Math.max(0, ...(comparison?.map((c) => c.steps.length) ?? [0]))

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>経路ファネルビルダー</h1>
                    <p className={styles.subtitle}>
                        ページ閲覧とクリックタグ（GTMラベル）を自由に組み合わせて、同一ユーザーの順序付きファネルを作成します。トップの導線別比較などに使えます。
                    </p>
                </div>
                <BackLink href="/">ダッシュボード</BackLink>
            </div>

            {!currentProduct && <div className={styles.notice}>プロダクトを選択してください</div>}

            <RelatedPages pages={[{ href: '/funnel', label: 'エントリーフォームファネル' }, { href: '/pageflow', label: 'ページフロー分析' }, { href: '/journey', label: 'ユーザー経路分析' }]} />

            <div className={styles.presetRow}>
                <span className={styles.presetLabel}>プリセット:</span>
                {PRESETS.map((p) => (
                    <button key={p.name} className={styles.presetChip} onClick={() => loadFunnel(p)}>
                        {p.name.split('（')[0]}
                    </button>
                ))}
                {saved.map((f) => (
                    <span key={f.name} className={styles.savedChipWrap}>
                        <button className={`${styles.presetChip} ${styles.savedChip}`} onClick={() => loadFunnel(f)}>
                            {f.name}
                        </button>
                        <button className={styles.deleteChip} onClick={() => deleteFunnel(f.name)} title="削除">×</button>
                    </span>
                ))}
            </div>

            <div className={styles.builderCard}>
                {steps.map((s, i) => (
                    <div key={i} className={styles.stepRow}>
                        <span className={styles.stepIndex}>{i + 1}</span>
                        <select
                            className={styles.select}
                            value={s.type}
                            onChange={(e) => updateStep(i, { type: e.target.value as StepInput['type'] })}
                        >
                            <option value="page">ページ閲覧</option>
                            <option value="click">クリックタグ</option>
                        </select>
                        <select
                            className={styles.select}
                            value={s.matchType}
                            onChange={(e) => updateStep(i, { matchType: e.target.value as StepInput['matchType'] })}
                        >
                            {MATCH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <input
                            className={styles.valueInput}
                            placeholder={s.type === 'page' ? '/search' : 'MW__ / CT__Occupation__ など'}
                            value={s.value}
                            onChange={(e) => updateStep(i, { value: e.target.value })}
                        />
                        <input
                            className={styles.nameInput}
                            placeholder="ステップ名（任意）"
                            value={s.name}
                            onChange={(e) => updateStep(i, { name: e.target.value })}
                        />
                        <div className={styles.stepActions}>
                            <button className={styles.iconButton} onClick={() => moveStep(i, -1)} disabled={i === 0} title="上へ">↑</button>
                            <button className={styles.iconButton} onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} title="下へ">↓</button>
                            <button className={styles.iconButton} onClick={() => removeStep(i)} disabled={steps.length <= 2} title="削除">×</button>
                        </div>
                    </div>
                ))}

                <div className={styles.builderFooter}>
                    <button className={styles.addButton} onClick={addStep} disabled={steps.length >= 10}>
                        + ステップ追加
                    </button>
                    <div className={styles.runControls}>
                        <PeriodSelect
                            state={periodState}
                            options={withCustomOption(PERIOD_OPTIONS)}
                            selectClassName={styles.select}
                        />
                        <button className={styles.runButton} onClick={run} disabled={loading || !currentProduct?.ga4PropertyId || !range}>
                            {loading ? '集計中...' : 'ファネル実行'}
                        </button>
                    </div>
                </div>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            {results && !loading && (
                <div className={styles.resultCard}>
                    <h2 className={styles.sectionTitle}>結果（クローズドファネル・ユーザー数）</h2>
                    <div className={styles.funnelChart}>
                        {results.map((r, i) => (
                            <div key={i} className={styles.funnelStep}>
                                <div className={styles.funnelMeta}>
                                    <span className={styles.funnelName}>{i + 1}. {r.name}</span>
                                    <span className={styles.funnelUsers}>{r.users.toLocaleString()}人
                                        {firstUsers > 0 && i > 0 && (
                                            <span className={styles.funnelOverall}>（起点比 {((r.users / firstUsers) * 100).toFixed(1)}%）</span>
                                        )}
                                    </span>
                                </div>
                                <div className={styles.funnelBarTrack}>
                                    <div className={styles.funnelBar} style={{ width: `${(r.users / maxUsers) * 100}%` }} />
                                </div>
                                {r.completionRate != null && (
                                    <div className={styles.funnelTransition}>
                                        ↓ 通過率 {(r.completionRate * 100).toFixed(1)}% ／ 離脱 {r.abandonments.toLocaleString()}人
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                    <p className={styles.note}>
                        ※ GA4の順序付きクローズドファネル（v1alpha）です。ステップ1から順に通過した同一ユーザーのみをカウントします。<br />
                        ※ このAPIは国フィルタ非対応のため、ページ条件のみのファネルにはbotが混入する可能性があります。途中にクリックタグ条件を挟むとbotは自然に除外されます。
                    </p>
                    <div className={styles.saveRow}>
                        <input
                            className={styles.nameInput}
                            placeholder="このファネルを保存（名前を入力）"
                            value={saveName}
                            onChange={(e) => setSaveName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveFunnel() }}
                        />
                        <button className={styles.addButton} onClick={saveFunnel} disabled={!saveName.trim()}>保存</button>
                        <span className={styles.saveHint}>保存はこのブラウザ内（localStorage）に保持されます</span>
                    </div>
                </div>
            )}

            <div className={styles.compareCard}>
                <h2 className={styles.sectionTitle}>複数ファネル比較</h2>
                <p className={styles.compareHint}>
                    プリセット・保存済みファネルから2〜4個選んで、通過率を横並びで比較します。
                </p>
                <div className={styles.compareSelectRow}>
                    {compareCandidates.map((f) => (
                        <label key={f.name} className={styles.compareItem}>
                            <input
                                type="checkbox"
                                checked={compareSelected.includes(f.name)}
                                onChange={() => toggleCompare(f.name)}
                            />
                            {f.name.split('（')[0]}
                        </label>
                    ))}
                    <button
                        className={styles.runButton}
                        onClick={runComparison}
                        disabled={comparing || compareSelected.length < 2}
                    >
                        {comparing ? '比較集計中...' : `比較する（${compareSelected.length}件選択中）`}
                    </button>
                </div>

                {comparison && !comparing && (
                    <div className={styles.compareTableWrapper}>
                        <table className={styles.compareTable}>
                            <thead>
                                <tr>
                                    <th>ステップ</th>
                                    {comparison.map((c) => (
                                        <th key={c.name} className={styles.compareColHead}>{c.name.split('（')[0]}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {Array.from({ length: maxCompareSteps }, (_, i) => (
                                    <tr key={i}>
                                        <td className={styles.compareStepIdx}>{i + 1}</td>
                                        {comparison.map((c) => {
                                            const s = c.steps[i]
                                            if (!s) return <td key={c.name} className={styles.compareCell}>－</td>
                                            const first = c.steps[0]?.users ?? 0
                                            return (
                                                <td key={c.name} className={styles.compareCell}>
                                                    <div className={styles.compareStepName}>{s.name}</div>
                                                    <div className={styles.compareUsers}>
                                                        {s.users.toLocaleString()}人
                                                        {i > 0 && first > 0 && (
                                                            <span className={styles.compareRate}>（起点比 {((s.users / first) * 100).toFixed(1)}%）</span>
                                                        )}
                                                    </div>
                                                    {s.completionRate != null && (
                                                        <div className={styles.compareTransition}>↓ {(s.completionRate * 100).toFixed(1)}%</div>
                                                    )}
                                                </td>
                                            )
                                        })}
                                    </tr>
                                ))}
                                <tr className={styles.compareTotalRow}>
                                    <td className={styles.compareStepIdx}>計</td>
                                    {comparison.map((c) => {
                                        const first = c.steps[0]?.users ?? 0
                                        const last = c.steps[c.steps.length - 1]?.users ?? 0
                                        return (
                                            <td key={c.name} className={styles.compareCell}>
                                                <span className={styles.compareTotal}>
                                                    全体通過率 {first > 0 ? `${((last / first) * 100).toFixed(2)}%` : '－'}
                                                </span>
                                            </td>
                                        )
                                    })}
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
