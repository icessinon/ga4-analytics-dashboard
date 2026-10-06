import { getGA4AccessToken } from '@/lib/api/ga4/client'
import { createGa4Reporter, type Ga4Reporter } from '@/lib/api/ga4/report'
import { HttpError } from './errorResponse'

export interface Ga4RequestBody {
    propertyId: string
    startDate: string
    endDate: string
    accessToken: string
    /** 解釈済みの期間で作った reporter。サービスにはこれを渡す */
    reporter: Ga4Reporter
    /** パース済みの body 全体（route 固有のパラメータを取り出す用） */
    raw: Record<string, unknown>
}

export interface ReadGa4BodyOptions {
    /** 既定 '30daysAgo' */
    defaultStartDate?: string
    /** 既定 'yesterday'（route によっては 'today'） */
    defaultEndDate?: string
    /** propertyId 欠落時の文言。'propertyId is required' と 'propertyId が必要です' が混在していたので、移行中は route ごとに従来の文言を渡す */
    propertyIdMissingMessage?: string
    /** 'YYYY-MM-DD' 以外（月指定など）を具体日付に直したい route 用 */
    resolveDates?: (startDate: string, endDate: string) => { startDate: string; endDate: string }
}

/**
 * GA4 系 route の冒頭 15 行（body パース → propertyId 必須チェック → 既定期間 → トークン）。
 * propertyId が無ければ HttpError(400) を投げるので、route は errorResponse で受ける。
 */
export async function readGa4Body(request: Request, opts: ReadGa4BodyOptions = {}): Promise<Ga4RequestBody> {
    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const propertyId = typeof raw.propertyId === 'string' || typeof raw.propertyId === 'number' ? String(raw.propertyId) : ''
    if (!propertyId) {
        throw new HttpError(400, opts.propertyIdMissingMessage ?? 'propertyId is required')
    }

    let startDate = typeof raw.startDate === 'string' && raw.startDate ? raw.startDate : (opts.defaultStartDate ?? '30daysAgo')
    let endDate = typeof raw.endDate === 'string' && raw.endDate ? raw.endDate : (opts.defaultEndDate ?? 'yesterday')
    if (opts.resolveDates) ({ startDate, endDate } = opts.resolveDates(startDate, endDate))

    const accessToken = await getGA4AccessToken(typeof raw.accessToken === 'string' ? raw.accessToken : undefined)
    const reporter = createGa4Reporter({ propertyId, accessToken, dateRanges: [{ startDate, endDate }] })

    return { propertyId, startDate, endDate, accessToken, reporter, raw }
}
