'use client'

import { useState, useRef, useEffect, useId } from 'react'
import { useLabels } from '@/lib/contexts/LabelContext'
import styles from './LabelInput.module.css'

interface LabelInputProps {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    className?: string
    required?: boolean
    /** この文字列を含む候補を先頭に並べる（例: ABテストのバリアントサフィックス __B-1741） */
    prioritySubstring?: string
    /**
     * 検索にヒットしたサフィックスなしラベルから「ラベル+このサフィックス」の生成候補も出す。
     * リリース前・発火前でバリアント用ラベルがまだGA4に存在しないケース向け（命名規則: B/C/DはAのラベル+__{V}-{issue}）
     */
    synthesizeSuffix?: string
}

const VARIANT_SUFFIX_RE = /__[A-D]-\w+$/

interface Suggestion {
    label: string
    /** 実ラベルではなく命名規則から生成した未発火候補 */
    synthetic: boolean
}

export default function LabelInput({ value, onChange, placeholder, className, required, prioritySubstring, synthesizeSuffix }: LabelInputProps) {
    const { labels } = useLabels()
    const [open, setOpen] = useState(false)
    const [highlighted, setHighlighted] = useState(-1)
    const inputRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLUListElement>(null)
    const id = useId()

    // カンマ区切りの複数ラベル入力に対応: 最後のセグメントで補完し、選択時はそこだけ置換する
    const lastSep = Math.max(value.lastIndexOf(','), value.lastIndexOf('、'))
    const prefix = lastSep >= 0 ? value.slice(0, lastSep + 1) : ''
    const current = value.slice(lastSep + 1).trim()

    const matched = current
        ? labels.filter((l) => l.toLowerCase().includes(current.toLowerCase()) && l !== current)
        : prioritySubstring
        // 未入力でもフォーカス時にサフィックス一致の候補を出す（バリアント用ラベルの発見を助ける）
        ? labels.filter((l) => l.includes(prioritySubstring))
        : []
    let filtered: Suggestion[]
    if (prioritySubstring || synthesizeSuffix) {
        // 並び順: ①発火済みのサフィックス付き実ラベル ②未発火の生成候補 ③その他の実ラベル。
        // 候補リストは先頭30件しか表示しないため、②を③より前に置かないとリリース前に埋もれて見えなくなる
        const key = prioritySubstring ?? synthesizeSuffix ?? ''
        const withSuffix = matched.filter((l) => l.includes(key))
        const others = matched.filter((l) => !l.includes(key))
        let synthetic: Suggestion[] = []
        if (synthesizeSuffix) {
            // 実ラベルにまだ存在しないバリアント用ラベルを、サフィックスなしラベルから合成して提示する
            const realSet = new Set(labels)
            synthetic = matched
                .filter((l) => !VARIANT_SUFFIX_RE.test(l))
                .map((l) => `${l}${synthesizeSuffix}`)
                .filter((l) => !realSet.has(l) && l !== current)
                .map((label) => ({ label, synthetic: true }))
        }
        filtered = [
            ...withSuffix.map((label) => ({ label, synthetic: false })),
            ...synthetic,
            ...others.map((label) => ({ label, synthetic: false })),
        ]
    } else {
        filtered = matched.map((label) => ({ label, synthetic: false }))
    }

    const showList = open && filtered.length > 0

    const select = (label: string) => {
        const next = prefix ? `${prefix}${label}` : label
        onChange(next)
        setOpen(false)
        setHighlighted(-1)
        const input = inputRef.current
        if (input) {
            input.focus()
            // 値の再レンダリング後にカーソルを末尾へ（続けてカンマ入力できるように）
            requestAnimationFrame(() => input.setSelectionRange(next.length, next.length))
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!showList) return
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlighted((h) => Math.min(h + 1, filtered.length - 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlighted((h) => Math.max(h - 1, 0))
        } else if (e.key === 'Enter' && highlighted >= 0 && !e.nativeEvent.isComposing) {
            e.preventDefault()
            select(filtered[highlighted].label)
        } else if (e.key === 'Escape') {
            setOpen(false)
        }
    }

    // 候補リストの選択行を自動スクロール
    useEffect(() => {
        if (highlighted >= 0 && listRef.current) {
            const item = listRef.current.children[highlighted] as HTMLElement
            item?.scrollIntoView({ block: 'nearest' })
        }
    }, [highlighted])

    // 外クリックで閉じる
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (!(e.target as Element).closest(`[data-labelinput="${id}"]`)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [id])

    return (
        <div className={styles.wrapper} data-labelinput={id}>
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => { onChange(e.target.value); setOpen(true); setHighlighted(-1) }}
                onFocus={() => setOpen(true)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className={className}
                required={required}
                autoComplete="off"
            />
            {showList && (
                <ul ref={listRef} className={styles.list}>
                    {filtered.slice(0, 30).map((s, i) => (
                        <li
                            key={s.label}
                            className={`${styles.item} ${i === highlighted ? styles.itemHighlighted : ''}`}
                            onMouseDown={(e) => { e.preventDefault(); select(s.label) }}
                            onMouseEnter={() => setHighlighted(i)}
                        >
                            {s.synthetic && <span className={styles.syntheticBadge}>未発火・生成</span>}
                            {s.label}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
