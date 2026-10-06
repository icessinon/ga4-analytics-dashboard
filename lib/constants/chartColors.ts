/**
 * グラフ・バッジ用のカラーパレット。
 *
 * recharts は stroke/fill を属性で受け取るため CSS 変数（var(--…)）を渡せない。
 * そこで「ライトの白面でもダークの濃い面でも WCAG の非テキスト基準 3:1 を満たす」
 * 中間の明度の色だけを置き、テーマによらず同じ値を使う。
 *
 * 各色のコントラスト比（白 #ffffff / ダーク面 #1f2937）:
 *   blue   #3b82f6 … 3.67 / 3.96
 *   green  #16a34a … 3.30 / 4.41
 *   red    #ef4444 … 3.76 / 3.87
 *   amber  #d97706 … 3.20 / 4.54
 *   violet #8b5cf6 … 4.24 / 3.43
 *   cyan   #0891b2 … 3.68 / 3.95
 *   pink   #ec4899 … 3.52 / 4.13
 *   orange #ea580c … 3.55 / 4.09
 *
 * 系列に割り当てるときは CHART_SERIES の順で固定する（増減で色が入れ替わらないように）。
 */
export const CHART_COLORS = {
    blue: '#3b82f6',
    green: '#16a34a',
    red: '#ef4444',
    amber: '#d97706',
    violet: '#8b5cf6',
    cyan: '#0891b2',
    pink: '#ec4899',
    orange: '#ea580c',
} as const

/** 系列色の固定順。9系列目以降は「その他」に畳むか小分割する */
export const CHART_SERIES: string[] = [
    CHART_COLORS.blue,
    CHART_COLORS.green,
    CHART_COLORS.amber,
    CHART_COLORS.violet,
    CHART_COLORS.red,
    CHART_COLORS.cyan,
    CHART_COLORS.orange,
    CHART_COLORS.pink,
]

/** 状態色。アイコン・ラベルと併用し、色だけで意味を伝えない */
export const STATUS_COLORS = {
    good: CHART_COLORS.green,
    warn: CHART_COLORS.amber,
    bad: CHART_COLORS.red,
    info: CHART_COLORS.blue,
} as const
