'use client'

import type { ReactNode } from 'react'
import BackLink from '@/components/BackLink'
import RelatedPages from '@/components/RelatedPages'
import Alert from '@/components/Alert'
import LoadState, { type DataSource } from '@/components/LoadState'
import { ui, cx } from '@/components/ui'
import { useProduct } from '@/lib/contexts/ProductContext'
import { PAGES, pageHref, type PageId } from '@/lib/registry'

export interface PageStatus {
    loading?: boolean
    error?: string | null
    source?: DataSource
    loadingText?: string
    onRetry?: () => void
}

export interface PageShellProps {
    /** レジストリの id。title / subtitle / 戻り先 / 関連ページをここから解決する */
    pageId: PageId
    /** 動的タイトル（詳細ページ）。省略時はレジストリの title */
    title?: ReactNode
    subtitle?: ReactNode
    /** 戻り先の上書き。null で非表示（ダッシュボード自身） */
    back?: { href: string; label?: string } | null
    /** BackLink の隣に並べる操作（履歴へ・新規作成など） */
    actions?: ReactNode
    /** false で関連ページを出さない。既定はレジストリから導出 */
    related?: boolean
    /** 期間 UI やフィルタ行 */
    controls?: ReactNode
    /** プロダクト未選択なら警告だけ出し、controls と children を描画しない */
    requireProduct?: boolean
    /** ページ全体の取得状態。loading 中は children を隠して Loader を出す */
    status?: PageStatus
    /** true なら loading 中も children を残し、Loader は controls の直下にインライン表示（前回データを残したいページ） */
    keepChildrenWhileLoading?: boolean
    width?: 'default' | 'wide' | 'narrow'
    children: ReactNode
}

const WIDTH_CLASS = { default: ui.page, wide: ui.pageWide, narrow: ui.pageNarrow } as const

/**
 * ページの枠。h1 → subtitle → BackLink → controls → 状態 → 本文 → 関連ページ の順を固定する。
 * これまで loading / error / 正常の分岐ごとに h1 と BackLink を書き直していたページが 11 本あり、
 * ここに寄せることで h1 は PageShell の中にしか存在しなくなる。
 */
export default function PageShell({
    pageId, title, subtitle, back, actions, related = true, controls,
    requireProduct, status, keepChildrenWhileLoading, width = 'default', children,
}: PageShellProps) {
    const def = PAGES[pageId]
    const { currentProduct } = useProduct()

    // 親が動的ルート（/ab-test/[id] など）のときは id をここで解決できないので、ページ側が back を渡す。
    // 渡されなければダッシュボードに戻す（Link に '[id]' を含む href を渡すと app router が例外を投げる）
    const parentHref = def.parent ? pageHref(def.parent, { productId: currentProduct?.id }) : null
    const parentIsStatic = !!parentHref && !parentHref.includes('[')
    const backHref = back === null ? null : back?.href ?? (parentIsStatic ? parentHref : '/')
    const backLabel = back?.label ?? (parentIsStatic && def.parent ? `${PAGES[def.parent].title}に戻る` : 'ダッシュボードに戻る')

    const productMissing = requireProduct && !currentProduct
    const busy = status?.loading === true
    const failed = !!status?.error
    const hideChildren = productMissing || (busy && !keepChildrenWhileLoading) || (failed && !keepChildrenWhileLoading)

    return (
        <div className={cx(WIDTH_CLASS[width])}>
            <div className={ui.pageHeader}>
                <div>
                    <h1 className={ui.pageTitle}>{title ?? def.title}</h1>
                    {(subtitle ?? def.subtitle) && <p className={ui.pageSubtitle}>{subtitle ?? def.subtitle}</p>}
                </div>
                {(backHref || actions) && (
                    <div className={ui.pageActions}>
                        {actions}
                        {backHref && <BackLink href={backHref}>{backLabel}</BackLink>}
                    </div>
                )}
            </div>

            {productMissing ? (
                <Alert tone="warn">
                    プロダクトを選択してください。サイドバー上部のドロップダウンから選択できます。
                </Alert>
            ) : (
                <>
                    {controls && <div className={ui.controls}>{controls}</div>}
                    {status && (busy || failed) && (
                        <LoadState
                            loading={busy}
                            error={status.error}
                            source={status.source}
                            loadingText={status.loadingText}
                            onRetry={status.onRetry}
                            variant={keepChildrenWhileLoading ? 'inline' : 'block'}
                        />
                    )}
                    {!hideChildren && children}
                </>
            )}

            {related && <RelatedPages pageId={pageId} />}
        </div>
    )
}
