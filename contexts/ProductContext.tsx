'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface Product {
    id: number
    name: string
    description: string | null
    domain: string | null
    ga4PropertyId: string | null
    isActive: boolean
}

interface ProductContextType {
    currentProduct: Product | null
    setCurrentProduct: (product: Product | null) => void
    products: Product[]
    setProducts: (products: Product[]) => void
    loading: boolean
}

const ProductContext = createContext<ProductContextType | undefined>(undefined)

export function ProductProvider({ children }: { children: ReactNode }) {
    const [currentProduct, setCurrentProductState] = useState<Product | null>(null)
    const [products, setProducts] = useState<Product[]>([])
    const [loading, setLoading] = useState(true)

    // プロダクト一覧を取得
    useEffect(() => {
        fetchProducts()
    }, [])

    // プロダクト一覧が読み込まれたら、保存されたプロダクトIDを設定
    useEffect(() => {
        if (products.length > 0 && !currentProduct) {
            try {
                const savedProductId = typeof window !== 'undefined' ? localStorage.getItem('currentProductId') : null
                if (savedProductId) {
                    const product = products.find((p) => p.id === parseInt(savedProductId, 10))
                    if (product) {
                        setCurrentProductState(product)
                    } else {
                        // 保存されたプロダクトが見つからない場合は最初のプロダクトを選択
                        setCurrentProductState(products[0])
                    }
                } else {
                    // 保存されたプロダクトがない場合は最初のプロダクトを選択
                    setCurrentProductState(products[0])
                }
            } catch (error) {
                console.error('Failed to load saved product:', error)
                // エラーが発生した場合は最初のプロダクトを選択
                if (products.length > 0) {
                    setCurrentProductState(products[0])
                }
            }
        }
    }, [products, currentProduct])

    // プロダクトが変更されたらlocalStorageに保存
    const setCurrentProduct = (product: Product | null) => {
        setCurrentProductState(product)
        try {
            if (typeof window !== 'undefined') {
                if (product) {
                    localStorage.setItem('currentProductId', product.id.toString())
                } else {
                    localStorage.removeItem('currentProductId')
                }
            }
        } catch (error) {
            console.error('Failed to save product to localStorage:', error)
        }
    }

    async function fetchProducts() {
        try {
            const response = await fetch('/api/products')
            if (!response.ok) {
                console.error('Failed to fetch products:', response.status, response.statusText)
                setProducts([])
                setLoading(false)
                return
            }
            const data = await response.json()
            if (data.success) {
                setProducts(data.products || [])
            } else {
                console.error('Failed to fetch products:', data.error || data.message)
                setProducts([])
            }
        } catch (error) {
            console.error('Failed to fetch products:', error)
            setProducts([])
        } finally {
            setLoading(false)
        }
    }

    return (
        <ProductContext.Provider
            value={{
                currentProduct,
                setCurrentProduct,
                products,
                setProducts,
                loading,
            }}
        >
            {children}
        </ProductContext.Provider>
    )
}

export function useProduct() {
    const context = useContext(ProductContext)
    if (context === undefined) {
        throw new Error('useProduct must be used within a ProductProvider')
    }
    return context
}
