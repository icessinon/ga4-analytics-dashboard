export interface CompletedAbTest {
    id: number
    name: string
    description: string | null
    hypothesis: string | null
    expectedImprovement: number | string | null
    startDate: string
    endDate: string | null
    status: string
    winnerVariant: string | null
    improvementVsAPercent: number | null
    victoryFactors: string | null
    defeatFactors: string | null
    product: {
        id: number
        name: string
    }
}

export type FilterMode = 'all' | 'win' | 'lose'
