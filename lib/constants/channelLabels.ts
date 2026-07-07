export const CHANNEL_LABELS: Record<string, string> = {
    'Organic Search': 'オーガニック検索',
    'Paid Search': '有料検索（広告）',
    'Direct': '直接流入',
    'Organic Social': 'SNS（自然）',
    'Paid Social': 'SNS（広告）',
    'Referral': '外部サイト経由',
    'Email': 'メール',
    'Display': 'ディスプレイ広告',
    'Organic Video': '動画（自然）',
    'Paid Video': '動画（広告）',
    '(Other)': 'その他流入',
    'Unassigned': '未分類',
}

export function channelLabel(raw: string): string {
    return CHANNEL_LABELS[raw] ?? (raw || 'その他流入')
}
