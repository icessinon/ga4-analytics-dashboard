'use client'

import Link from 'next/link'
import BackLink from '@/components/BackLink'
import DocsAsk from '@/components/docs/DocsAsk'
import { FEATURE_LIST, FEATURE_CATEGORY_IDS, CATEGORIES } from '@/lib/registry'
import type { FeatureDoc } from '@/lib/registry'
import styles from './FeatureDocs.module.css'

function AIBadge() {
    return (
        <span className={styles.geminiBadge}>
            ✦ AI分析
        </span>
    )
}

function FeatureCard({ feature }: { feature: FeatureDoc }) {
    const color = CATEGORIES[feature.categoryId].color
    return (
        <div className={styles.card} style={{ borderColor: color.border, background: color.bg }}>
            <div className={styles.cardHeader}>
                <div className={styles.cardTitleRow}>
                    <h3 className={styles.cardTitle}>{feature.name}</h3>
                    {feature.ai && <AIBadge />}
                </div>
                <div className={styles.cardMeta}>
                    <span className={styles.categoryBadge} style={{ color: color.label, borderColor: color.border }}>
                        {feature.category}
                    </span>
                    {feature.apiRoute && (
                        <code className={styles.apiRoute}>{feature.apiRoute}</code>
                    )}
                </div>
            </div>

            <p className={styles.cardDescription}>{feature.description}</p>

            <ul className={styles.capabilityList}>
                {feature.capabilities.map((c, i) => (
                    <li key={i} className={styles.capabilityItem}>
                        <span className={styles.capabilityDot} style={{ background: color.label }} />
                        {c}
                    </li>
                ))}
            </ul>

            {feature.metrics && feature.metrics.length > 0 && (
                <div className={styles.metricsRow}>
                    <span className={styles.metricsLabel}>GA4メトリクス:</span>
                    {feature.metrics.map((m) => (
                        <code key={m} className={styles.metricChip}>{m}</code>
                    ))}
                </div>
            )}

            {feature.notes && feature.notes.length > 0 && (
                <ul className={styles.noteList}>
                    {feature.notes.map((n, i) => (
                        <li key={i} className={styles.noteItem}>{n}</li>
                    ))}
                </ul>
            )}

            {feature.href && (
                <div className={styles.cardFooter}>
                    <Link href={feature.href} className={styles.openLink}>
                        ページを開く →
                    </Link>
                </div>
            )}
        </div>
    )
}

export default function FeatureDocsPage() {
    return (
        <div className={styles.wrapper}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>機能ドキュメント</h1>
                    <p className={styles.lead}>
                        ダッシュボードの全機能の概要・使い方・使用GA4メトリクスをまとめています。
                        ✦ AI分析 バッジがある機能は、分析結果をもとに AI が自然言語でインサイトを生成します。
                        なお、海外botトラフィック対策として全GA4集計にデフォルトで国=日本フィルタを適用しています（国別軸の分析を除く）。
                    </p>
                </div>
                <div className={styles.headerLinks}>
                    <Link href="/docs/api" className={styles.subLink}>API ドキュメント →</Link>
                    <Link href="/docs/glossary" className={styles.subLink}>用語・ドメイン知識 →</Link>
                    <BackLink href="/">ダッシュボードに戻る</BackLink>
                </div>
            </div>

            <DocsAsk />

            <nav className={styles.toc}>
                <p className={styles.tocTitle}>カテゴリ</p>
                <div className={styles.tocList}>
                    {FEATURE_CATEGORY_IDS.map((cat) => {
                        const { color, label } = CATEGORIES[cat]
                        return (
                            <a
                                key={cat}
                                href={`#cat-${cat}`}
                                className={styles.tocChip}
                                style={{ borderColor: color.border, color: color.label }}
                            >
                                {label}
                            </a>
                        )
                    })}
                </div>
            </nav>

            <div className={styles.content}>
                {FEATURE_CATEGORY_IDS.map((cat) => {
                    const features = FEATURE_LIST.filter((f) => f.categoryId === cat)
                    if (features.length === 0) return null
                    const { color, label } = CATEGORIES[cat]
                    return (
                        <section key={cat} id={`cat-${cat}`} className={styles.section}>
                            <h2 className={styles.sectionTitle} style={{ borderColor: color.border, color: color.label }}>
                                {label}
                            </h2>
                            <div className={styles.cardGrid}>
                                {features.map((f) => (
                                    <FeatureCard key={f.name} feature={f} />
                                ))}
                            </div>
                        </section>
                    )
                })}
            </div>

            <div className={styles.footer}>
                <BackLink href="/">ダッシュボードに戻る</BackLink>
            </div>
        </div>
    )
}
