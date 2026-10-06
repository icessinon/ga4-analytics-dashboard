'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/Link'
import { usePathname } from 'next/navigation'
import { useProduct } from '@/lib/contexts/ProductContext'
import { navGroups } from '@/lib/registry'
import styles from './Sidebar.module.css'

const STORAGE_KEY = 'sidebar-collapsed'
const OPEN_GROUPS_KEY = 'sidebar-open-groups'

export default function Sidebar() {
    const pathname = usePathname()
    const { currentProduct } = useProduct()
    const [collapsed, setCollapsed] = useState(false)
    // グループの開閉状態。項目が増えたため、現在ページを含むグループ以外は初期状態で閉じる
    const [openGroups, setOpenGroups] = useState<Record<string, boolean> | null>(null)
    const groups = navGroups(currentProduct?.id)

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
        for (const group of groups) {
            const containsActive = group.items.some((item) => isActive(item.href))
            next[group.id] = containsActive || stored[group.id] === true
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
                {groups.map((group) => {
                    const isOpen = openGroups?.[group.id] ?? true
                    return (
                        <div key={group.id} className={styles.group}>
                            <button
                                type="button"
                                className={styles.groupButton}
                                onClick={() => toggleGroup(group.id)}
                                aria-expanded={isOpen}
                            >
                                <span className={styles.groupLabel}>{group.label}</span>
                                <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`} aria-hidden>▸</span>
                            </button>
                            {isOpen && (
                                <ul className={styles.list}>
                                    {group.items.map((item) => {
                                        const active = isActive(item.href)
                                        return (
                                            <li key={item.id}>
                                                <Link
                                                    href={item.href}
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
