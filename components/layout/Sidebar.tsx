'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/Link'
import { usePathname } from 'next/navigation'
import { useProduct } from '@/lib/contexts/ProductContext'
import { QUICK_ACCESS_GROUPS } from '@/app/dashboard/types'
import styles from './Sidebar.module.css'

const STORAGE_KEY = 'sidebar-collapsed'
const OPEN_GROUPS_KEY = 'sidebar-open-groups'

export default function Sidebar() {
    const pathname = usePathname()
    const { currentProduct } = useProduct()
    const [collapsed, setCollapsed] = useState(false)
    // グループの開閉状態。項目が増えたため、現在ページを含むグループ以外は初期状態で閉じる
    const [openGroups, setOpenGroups] = useState<Record<string, boolean> | null>(null)

    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY)
            if (stored !== null) setCollapsed(stored === 'true')
        } catch {
        }
    }, [])

    function isActive(href: string): boolean {
        const hrefPath = href.split('?')[0]
        if (hrefPath === '/') return pathname === '/'
        const path = pathname.split('?')[0]
        return path === hrefPath
    }

    // 初期化: 保存済みの開閉状態を復元し、現在ページのグループは必ず開く
    useEffect(() => {
        let stored: Record<string, boolean> = {}
        try {
            stored = JSON.parse(localStorage.getItem(OPEN_GROUPS_KEY) ?? '{}') as Record<string, boolean>
        } catch {
        }
        const next: Record<string, boolean> = {}
        for (const group of QUICK_ACCESS_GROUPS) {
            const containsActive = group.items.some((item) => isActive(item.getHref(currentProduct?.id).split('?')[0]))
            next[group.label] = containsActive || stored[group.label] === true
        }
        setOpenGroups(next)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname, currentProduct?.id])

    function toggle() {
        setCollapsed((prev) => {
            const next = !prev
            try {
                localStorage.setItem(STORAGE_KEY, String(next))
            } catch {
            }
            return next
        })
    }

    function toggleGroup(label: string) {
        setOpenGroups((prev) => {
            const next = { ...(prev ?? {}), [label]: !(prev?.[label] ?? false) }
            try {
                localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(next))
            } catch {
            }
            return next
        })
    }

    return (
        <aside
            className={`${styles.aside} ${collapsed ? styles.collapsed : ''}`}
            aria-label="メインナビゲーション"
        >
            <button
                type="button"
                onClick={toggle}
                className={styles.toggle}
                aria-expanded={!collapsed}
                aria-label={collapsed ? 'サイドメニューを開く' : 'サイドメニューを閉じる'}
            >
                <span className={styles.toggleIcon} aria-hidden>
                    {collapsed ? '›' : '‹'}
                </span>
            </button>
            <nav className={styles.nav}>
                <Link
                    href="/"
                    className={`${styles.link} ${styles.homeLink} ${pathname === '/' ? styles.active : ''}`}
                >
                    ダッシュボード
                </Link>
                {QUICK_ACCESS_GROUPS.map((group) => {
                    const isOpen = openGroups?.[group.label] ?? true
                    return (
                        <div key={group.label} className={styles.group}>
                            <button
                                type="button"
                                className={styles.groupButton}
                                onClick={() => toggleGroup(group.label)}
                                aria-expanded={isOpen}
                            >
                                <span className={styles.groupLabel}>{group.label}</span>
                                <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`} aria-hidden>▸</span>
                            </button>
                            {isOpen && (
                                <ul className={styles.list}>
                                    {group.items.map((item) => {
                                        const href = item.getHref(currentProduct?.id)
                                        const active = isActive(href.split('?')[0])
                                        return (
                                            <li key={item.title}>
                                                <Link
                                                    href={href}
                                                    className={`${styles.link} ${active ? styles.active : ''}`}
                                                >
                                                    {item.title}
                                                </Link>
                                            </li>
                                        )
                                    })}
                                </ul>
                            )}
                        </div>
                    )
                })}
            </nav>
        </aside>
    )
}
