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

    const filtered = value.trim()
        ? labels.filter((l) => l.toLowerCase().includes(value.toLowerCase()) && l !== value)
        : []

    const showList = open && filtered.length > 0

    const select = (label: string) => {
        onChange(label)
        setOpen(false)
        setHighlighted(-1)
        inputRef.current?.focus()
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
                            onMouseDown={() => select(label)}
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
