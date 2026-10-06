'use client'

import { useState } from 'react'
import Link from 'next/link'
import PageShell from '@/components/PageShell'
import Alert from '@/components/Alert'
import DocsAsk from '@/components/docs/DocsAsk'
import { ui } from '@/components/ui'
import { API_LIST } from './apiList'
import type { ApiEndpoint, ApiParam } from './types'
import styles from './ApiDocs.module.css'

function EndpointRow({ endpoint }: { endpoint: ApiEndpoint }) {
    const [open, setOpen] = useState(false)
    return (
        <li className={styles.endpoint}>
            <button
                type="button"
                className={styles.endpointHead}
                onClick={() => setOpen((prev) => !prev)}
                aria-expanded={open}
            >
                <span className={styles.method}>{endpoint.method}</span>
                <span className={styles.path}>{endpoint.path}</span>
                <span className={styles.name}>{endpoint.name}</span>
                <span className={styles.chevron} aria-hidden>
                    {open ? '▼' : '▶'}
                </span>
            </button>
            {open && (
                <div className={styles.endpointBody}>
                    <p className={styles.description}>{endpoint.description}</p>
                    {endpoint.params && endpoint.params.length > 0 && (
                        <div className={styles.section}>
                            <h4 className={styles.sectionTitle}>クエリ / パラメータ</h4>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>名前</th>
                                        <th>型</th>
                                        <th>必須</th>
                                        <th>説明</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {endpoint.params.map((p: ApiParam) => (
                                        <tr key={p.name}>
                                            <td><code>{p.name}</code></td>
                                            <td><code>{p.type}</code></td>
                                            <td>{p.required ? '○' : '−'}</td>
                                            <td>{p.description}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {endpoint.responseNote && (
                        <div className={styles.section}>
                            <h4 className={styles.sectionTitle}>レスポンス</h4>
                            <p className={styles.responseNote}>{endpoint.responseNote}</p>
                        </div>
                    )}
                </div>
            )}
        </li>
    )
}

export default function ApiDocsPage() {
    return (
        <PageShell
            pageId="docsApi"
            actions={<Link href="/docs/features" className={ui.btnGhost}>機能ドキュメント</Link>}
        >
            <Alert tone="info" title="認証">
                Basic 認証を有効にしている場合、未ログイン時は /login にリダイレクトされます。ログイン後はクッキー（ga4_auth）でセッションが維持され、
                ここに載っている API の多くはそのクッキーがある状態で利用します。/api/auth/login と /api/auth/logout は認証不要で呼び出せます。
            </Alert>

            <DocsAsk />

            <nav className={styles.toc}>
                <h2 className={styles.tocTitle}>カテゴリ</h2>
                <ul className={styles.tocList}>
                    {API_LIST.map((group) => (
                        <li key={group.category}>
                            <a href={`#category-${group.category}`} className={styles.tocLink}>
                                {group.category}
                            </a>
                        </li>
                    ))}
                </ul>
            </nav>
            <div className={styles.content}>
                {API_LIST.map((group) => (
                    <section
                        key={group.category}
                        id={`category-${group.category}`}
                        className={styles.category}
                    >
                        <h2 className={styles.categoryTitle}>{group.category}</h2>
                        <ul className={styles.endpointList}>
                            {group.endpoints.map((ep, i) => (
                                <EndpointRow key={`${ep.path}-${ep.method}-${i}`} endpoint={ep} />
                            ))}
                        </ul>
                    </section>
                ))}
            </div>
        </PageShell>
    )
}
