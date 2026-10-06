'use client'

import { useCallback, useEffect, useState } from 'react'
import PageShell from '@/components/PageShell'
import Alert from '@/components/Alert'
import { ui, cx } from '@/components/ui'
import { useProduct } from '@/contexts/ProductContext'
import { fetchJson } from '@/lib/utils/fetch'
import type { Product } from './types'
import styles from './ProductsPage.module.css'

const EMPTY_FORM = { name: '', description: '', domain: '', ga4PropertyId: '' }

export default function ProductsPage() {
    const { products, setProducts } = useProduct()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [editingProduct, setEditingProduct] = useState<Product | null>(null)
    const [formData, setFormData] = useState(EMPTY_FORM)
    const [saving, setSaving] = useState(false)

    const fetchProducts = useCallback(async () => {
        setError(null)
        try {
            const data = await fetchJson<{ products?: Product[] }>('/api/products')
            setProducts(data.products || [])
        } catch (err) {
            setError(err instanceof Error ? err.message : 'エラーが発生しました')
        } finally {
            setLoading(false)
        }
    }, [setProducts])

    useEffect(() => { fetchProducts() }, [fetchProducts])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setSaving(true)
        setError(null)
        try {
            await fetchJson('/api/products', {
                method: editingProduct ? 'PUT' : 'POST',
                body: JSON.stringify(editingProduct ? { id: editingProduct.id, ...formData } : formData),
            })
            handleCancel()
            await fetchProducts()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'エラーが発生しました')
        } finally {
            setSaving(false)
        }
    }

    function handleEdit(product: Product) {
        setEditingProduct(product)
        setFormData({
            name: product.name,
            description: product.description || '',
            domain: product.domain || '',
            ga4PropertyId: product.ga4PropertyId || '',
        })
    }

    function handleCancel() {
        setEditingProduct(null)
        setFormData(EMPTY_FORM)
    }

    async function handleDelete(id: number) {
        if (!confirm('このプロダクトを削除しますか？')) return
        setError(null)
        try {
            await fetchJson(`/api/products?id=${id}`, { method: 'DELETE' })
            await fetchProducts()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'エラーが発生しました')
        }
    }

    const set = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) => setFormData((f) => ({ ...f, [key]: e.target.value }))

    return (
        <PageShell pageId="products" status={{ loading, source: 'db' }}>
            {error && <Alert tone="error">{error}</Alert>}

            <div className={ui.card}>
                <h2 className={ui.sectionTitle}>{editingProduct ? `プロダクトを編集: ${editingProduct.name}` : '新しいプロダクトを追加'}</h2>
                <p className={ui.sectionNote}>GA4 プロパティ ID を設定すると、各分析ページでこのプロダクトを選んで集計できます。</p>
                <form onSubmit={handleSubmit}>
                    <div className={styles.formGrid}>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>プロダクト名 *</span>
                            <input type="text" className={ui.input} value={formData.name} onChange={set('name')} required />
                        </label>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>ドメイン</span>
                            <input type="text" className={ui.input} value={formData.domain} onChange={set('domain')} placeholder="example.com" />
                        </label>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>GA4プロパティID</span>
                            <input type="text" className={ui.input} value={formData.ga4PropertyId} onChange={set('ga4PropertyId')} placeholder="534098180" />
                        </label>
                        <label className={styles.field}>
                            <span className={styles.fieldLabel}>説明</span>
                            <input type="text" className={ui.input} value={formData.description} onChange={set('description')} />
                        </label>
                    </div>
                    <div className={ui.controls}>
                        <button type="submit" className="executionButton" disabled={saving}>
                            <span>{saving ? '保存中...' : editingProduct ? '更新' : '追加'}</span>
                        </button>
                        {editingProduct && (
                            <button type="button" onClick={handleCancel} className={ui.btnGhost}>キャンセル</button>
                        )}
                    </div>
                </form>
            </div>

            <div className={ui.card}>
                <h2 className={ui.sectionTitle}>登録済みプロダクト</h2>
                <div className={ui.tableWrap}>
                    <table className={ui.dataTable}>
                        <thead>
                            <tr>
                                <th>プロダクト名</th>
                                <th>ドメイン</th>
                                <th>GA4プロパティID</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {products.length === 0 ? (
                                <tr><td colSpan={4} className={ui.empty}>プロダクトがありません</td></tr>
                            ) : products.map((product) => (
                                <tr key={product.id}>
                                    <td className={ui.strong}>{product.name}</td>
                                    <td>{product.domain || '-'}</td>
                                    <td>{product.ga4PropertyId || '-'}</td>
                                    <td>
                                        <div className={styles.actions}>
                                            <button type="button" onClick={() => handleEdit(product)} className={ui.btnGhost}>編集</button>
                                            <button type="button" onClick={() => handleDelete(product.id)} className={cx(ui.btnGhost, styles.danger)}>削除</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </PageShell>
    )
}
