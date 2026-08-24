/**
 * ABテストコンポーネント用の型定義
 */

export interface AbTest {
    id: number
    name: string
    description: string | null
    hypothesis?: string | null
    issueUrl?: string | null
    expectedImprovement?: number | string | null
    startDate: string
    endDate: string | null
    status: string
    autoExecute?: boolean
    scheduleConfig?: Record<string, unknown> | null
    ga4Config?: {
        cvrC?: {
            denominatorDimension?: string
        }
        cvrD?: {
            denominatorDimension?: string
        }
    }
    product: {
        id: number
        name: string
    }
    variantAName?: string
    variantBName?: string
}

export interface AbTestCalendarProps {
    abTests: AbTest[]
    onDateClick?: (date: Date, tests: AbTest[]) => void
}

export interface AbTestFormModalProps {
    isOpen: boolean
    onClose: () => void
    onSubmit: (data: any) => Promise<void>
    editingTest?: AbTest | null
    products: Array<{ id: number; name: string; ga4PropertyId?: string | null }>
    currentProductId?: number
}
