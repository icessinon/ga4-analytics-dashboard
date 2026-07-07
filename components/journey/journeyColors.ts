export const NODE_COLORS: Record<string, string> = {
    'オーガニック検索': '#22c55e',
    '有料検索（広告）': '#3b82f6',
    '直接流入': '#94a3b8',
    'SNS（自然）': '#a855f7',
    'SNS（広告）': '#d946ef',
    '外部サイト経由': '#64748b',
    'メール': '#f59e0b',
    'ディスプレイ広告': '#06b6d4',
    '動画（自然）': '#84cc16',
    '動画（広告）': '#eab308',
    'その他流入': '#6b7280',
    '未分類': '#4b5563',
    'TOP': '#3b82f6',
    'LP': '#8b5cf6',
    '人材紹介LP': '#7c3aed',
    'featured': '#0891b2',
    'ログイン': '#0ea5e9',
    'マイページ': '#0284c7',
    'スカウト': '#0369a1',
    '検索結果': '#10b981',
    '大職種一覧': '#059669',
    '絞り込み検索': '#047857',
    '資格条件': '#065f46',
    'コラム': '#a3a3a3',
    '求人詳細': '#f59e0b',
    '直接アクセス': '#6b7280',
    '会員登録フォーム': '#f97316',
    '応募フォーム': '#ef4444',
    '会員系その他': '#ea580c',
}

export function nodeColor(id: string): string {
    return NODE_COLORS[id] || '#818cf8'
}

export function exitRateColor(rate: number): string {
    if (rate < 0.3) return '#34d399'
    if (rate < 0.6) return '#fbbf24'
    return '#f87171'
}

export function exitRateLabel(rate: number): string {
    if (rate < 0.3) return '低'
    if (rate < 0.6) return '中'
    return '高'
}
