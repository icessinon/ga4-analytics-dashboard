'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/Link'
import { usePathname } from 'next/navigation'
import { useProduct } from '@/lib/contexts/ProductContext'
import { QUICK_ACCESS_GROUPS } from '@/app/dashboard/types'
import styles from './Sidebar.module.css'

const STORAGE_KEY = 'sidebar-collapsed'

export default function Sidebar() {
    const pathname = usePathname()
    const { currentProduct } = useProduct()
    const [collapsed, setCollapsed] = useState(false)

    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY)
            if (stored !== null) setCollapsed(stored === 'true')
        } catch {
        }
    }, [])

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

    function isActive(href: string): boolean {
        const hrefPath = href.split('?')[0]
        if (hrefPath === '/') return pathname === '/'
        const path = pathname.split('?')[0]
        return path === hrefPath
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
                {QUICK_ACCESS_GROUPS.map((group) => (
                    <div key={group.label} className={styles.group}>
                        <span className={styles.groupLabel}>{group.label}</span>
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
                    </div>
                ))}
            </nav>
        </aside>
    )
}
