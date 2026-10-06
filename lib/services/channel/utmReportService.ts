import type { Ga4Reporter } from '@/lib/api/ga4/report'
import { dim, metricInt, rowsOf, type Ga4Row } from '@/lib/api/ga4/rows'
import { cvKeyForPath, cvPagesFilter, emptyCvCounts } from '@/lib/services/cv/cvPages'
import type { UtmReportReport, UtmRow } from './utmReportTypes'

/**
 * UTM別集計レポート:
 *  GA4 Data API で utm_source × utm_medium × utm_campaign × utm_content 別に
 *  セッション・ユーザー・CV（応募 / LP応募 / 会員登録）を集計する汎用ビュー。
 *  utm_content は「同じ配信の中のどのリンク／どの文面か」を分ける軸（ステップメールの
 *  リンク位置、スカウトSMSの文面AB、広告のクリエイティブID）。付いていない配信は
 *  (not set) に寄るので、content を足しても既存の行が割れるのは使っている配信だけ。
 *  各行の「意味・発行タイミング」注記はフロント側で lib/constants/utmCatalog.ts が付与。
 *
 * 注: GA4 は UTM をセッション開始時のみ読むため、サイト内リンクUTM（フッター等）は
 *  ここにはほぼ出ない（＝流入UTMのみが対象）。詳細は docs/utm-naming-convention.md。
 */

const UTM_DIMS = ['sessionSource', 'sessionMedium', 'sessionCampaignName', 'sessionManualAdContent']
// UTM 値に出てこない区切り文字（U+0001）で 4 軸を 1 キーにする
const SEP = String.fromCharCode(1)
const key = (s: string, m: string, c: string, ct: string) => [s, m, c, ct].join(SEP)
const dimOr = (row: Ga4Row, i: number) => dim(row, i) || '(not set)'

export async function runUtmReport(reporter: Ga4Reporter): Promise<UtmReportReport> {
    const [main, cvRows] = await reporter.runAll([
        // UTM別のセッション・ユーザー
        { dimensions: UTM_DIMS, metrics: ['sessions', 'activeUsers'], orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 500 },
        // UTM×CVページ別の到達ユーザー（CVを3種に分解）
        { dimensions: [...UTM_DIMS, 'pagePath'], metrics: ['activeUsers'], dimensionFilter: cvPagesFilter(), limit: 3000 },
    ])

    // CVをUTMキー別に集計
    const cvByUtm = new Map<string, ReturnType<typeof emptyCvCounts>>()
    for (const r of rowsOf(cvRows)) {
        const k = key(dimOr(r, 0), dimOr(r, 1), dimOr(r, 2), dimOr(r, 3))
        const bucket = cvByUtm.get(k) ?? emptyCvCounts()
        const cvKey = cvKeyForPath(dim(r, 4))
        if (cvKey) bucket[cvKey] += metricInt(r)
        cvByUtm.set(k, bucket)
    }

    const rows: UtmRow[] = rowsOf(main).map((r) => {
        const source = dimOr(r, 0)
        const medium = dimOr(r, 1)
        const campaign = dimOr(r, 2)
        const content = dimOr(r, 3)
        return {
            source, medium, campaign, content,
            sessions: metricInt(r, 0),
            users: metricInt(r, 1),
            ...(cvByUtm.get(key(source, medium, campaign, content)) ?? emptyCvCounts()),
        }
    })

    return { rows }
}
