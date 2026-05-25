'use client'

import Link from 'next/link'
import BackLink from '@/components/BackLink'
import { FEATURE_LIST, FEATURE_CATEGORIES } from './featureList'
import type { FeatureDoc } from './featureList'
import styles from './FeatureDocs.module.css'

const CATEGORY_COLORS: Record<string, { border: string; bg: string; label: string }> = {
    'ユーザー分析':             { border: '#818cf8', bg: 'rgba(99,102,241,0.08)',  label: '#818cf8' },
    '経路・離脱分析':           { border: '#f87171', bg: 'rgba(248,113,113,0.08)', label: '#f87171' },
    'コンバージョン・ファネル': { border: '#34d399', bg: 'rgba(52,211,153,0.08)',  label: '#34d399' },
    'ABテスト':                 { border: '#fbbf24', bg: 'rgba(251,191,36,0.08)',  label: '#fbbf24' },
    'レポート・データ':         { border: '#60a5fa', bg: 'rgba(96,165,250,0.08)',  label: '#60a5fa' },
}

function AIBadge() {
    return (
        <span className={styles.geminiBadge}>
            ✦ AI分析
        </span>
    )
}

function FeatureCard({ feature }: { feature: FeatureDoc }) {
    const color = CATEGORY_COLORS[feature.category] ?? CATEGORY_COLORS['レポート・データ']
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

            <div className={styles.cardFooter}>
                <Link href={feature.href} className={styles.openLink}>
                    ページを開く →
                </Link>
            </div>
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
                    </p>
                </div>
                <div className={styles.headerLinks}>
                    <Link href="/docs/api" className={styles.subLink}>API ドキュメント →</Link>
                    <BackLink href="/dashboard">ダッシュボードに戻る</BackLink>
                </div>
            </div>

            <nav className={styles.toc}>
                <p className={styles.tocTitle}>カテゴリ</p>
                <div className={styles.tocList}>
                    {FEATURE_CATEGORIES.map((cat) => {
                        const color = CATEGORY_COLORS[cat]
                        return (
                            <a
                                key={cat}
                                href={`#cat-${cat}`}
                                className={styles.tocChip}
                                style={{ borderColor: color.border, color: color.label }}
                            >
                                {cat}
                            </a>
                        )
                    })}
                </div>
            </nav>

            <div className={styles.content}>
                {FEATURE_CATEGORIES.map((cat) => {
                    const features = FEATURE_LIST.filter((f) => f.category === cat)
                    if (features.length === 0) return null
                    const color = CATEGORY_COLORS[cat]
                    return (
                        <section key={cat} id={`cat-${cat}`} className={styles.section}>
                            <h2 className={styles.sectionTitle} style={{ borderColor: color.border, color: color.label }}>
                                {cat}
                            </h2>
                            <div className={styles.cardGrid}>
                                {features.map((f) => (
                                    <FeatureCard key={f.href} feature={f} />
                                ))}
                            </div>
                        </section>
                    )
                })}
            </div>

            <div className={styles.footer}>
                <BackLink href="/dashboard">ダッシュボードに戻る</BackLink>
            </div>
        </div>
    )
}
