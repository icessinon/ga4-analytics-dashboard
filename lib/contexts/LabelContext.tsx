'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { useProduct } from './ProductContext'

interface LabelContextType {
    labels: string[]
    loading: boolean
    refresh: () => void
}

const LabelContext = createContext<LabelContextType>({
    labels: [],
    loading: false,
    refresh: () => {},
})

export function useLabels() {
    return useContext(LabelContext)
}

const STORAGE_PREFIX = 'ga4_labels_'

export function LabelProvider({ children }: { children: ReactNode }) {
    const { currentProduct } = useProduct()
    const [labels, setLabels] = useState<string[]>([])
    const [loading, setLoading] = useState(false)

    const fetchLabels = useCallback(async (propertyId: string) => {
        const storageKey = `${STORAGE_PREFIX}${propertyId}`

        // LocalStorageから前回のキャッシュを即時反映
        try {
            const cached = localStorage.getItem(storageKey)
            if (cached) {
                const { labels: cachedLabels, fetchedAt } = JSON.parse(cached)
                const ageMs = Date.now() - fetchedAt
                setLabels(cachedLabels)
                // 1時間以内のキャッシュならAPIは叩かない
                if (ageMs < 60 * 60 * 1000) return
            }
        } catch {}

        setLoading(true)
        try {
            const res = await fetch(`/api/ga4/labels?propertyId=${propertyId}`)
            if (!res.ok) return
            const data = await res.json()
            if (data.labels) {
                setLabels(data.labels)
                localStorage.setItem(storageKey, JSON.stringify({ labels: data.labels, fetchedAt: Date.now() }))
            }
        } catch {
            // バックグラウンド取得失敗は無視
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        if (currentProduct?.ga4PropertyId) {
            fetchLabels(currentProduct.ga4PropertyId)
        } else {
            setLabels([])
        }
    }, [currentProduct?.ga4PropertyId, fetchLabels])

    const refresh = useCallback(() => {
        if (!currentProduct?.ga4PropertyId) return
        const storageKey = `${STORAGE_PREFIX}${currentProduct.ga4PropertyId}`
        try { localStorage.removeItem(storageKey) } catch {}
        fetchLabels(currentProduct.ga4PropertyId)
    }, [currentProduct?.ga4PropertyId, fetchLabels])

    return (
        <LabelContext.Provider value={{ labels, loading, refresh }}>
            {children}
        </LabelContext.Provider>
    )
}
