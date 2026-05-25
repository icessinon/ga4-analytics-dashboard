'use client'

import { useState } from 'react'
import Link from 'next/link'
import BackLink from '@/components/BackLink'
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
        <div className={styles.wrapper}>
            <div className={styles.header}>
                <h1 className={styles.title}>API ドキュメント</h1>
                <p className={styles.lead}>
                    ダッシュボードで利用している API エンドポイントの一覧と説明です。必要に応じてクエリパラメータやレスポンスの概要を確認できます。
                </p>
                <p className={styles.lead}>
                    <strong>認証:</strong> Basic認証を有効にしている場合、未ログイン時は /login にリダイレクトされます。ログイン成功後はクッキー（ga4_auth）でセッションが維持され、本ドキュメントの API の多くはそのクッキーがある状態で利用します。/api/auth/login と /api/auth/logout は認証不要で呼び出せます。
                </p>
            </div>
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
            <div className={styles.footer}>
                <Link href="/docs/features" style={{ fontSize: '0.875rem', color: '#818cf8', textDecoration: 'none', marginRight: '1.5rem' }}>
                    機能ドキュメントを見る →
                </Link>
                <BackLink href="/">ダッシュボードに戻る</BackLink>
            </div>
        </div>
    )
}
