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
}

export default function LabelInput({ value, onChange, placeholder, className, required }: LabelInputProps) {
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

    const filtered = current
        ? labels.filter((l) => l.toLowerCase().includes(current.toLowerCase()) && l !== current)
        : []

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
        } else if (e.key === 'Enter' && highlighted >= 0) {
            e.preventDefault()
            select(filtered[highlighted])
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
                    {filtered.slice(0, 30).map((label, i) => (
                        <li
                            key={label}
                            className={`${styles.item} ${i === highlighted ? styles.itemHighlighted : ''}`}
                            onMouseDown={(e) => { e.preventDefault(); select(label) }}
                            onMouseEnter={() => setHighlighted(i)}
                        >
                            {label}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
