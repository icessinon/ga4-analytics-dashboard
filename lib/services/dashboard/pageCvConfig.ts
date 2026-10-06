/**
 * ページ単位の CV 定義（PageCvConfig）。
 * 設定があれば GA4 の conversions ではなく「指定イベント / ラベルの eventCount」を CV として数える。
 * ※ サーバー専用（prisma）
 */

import { prisma } from '@/lib/db/client'
import type { CvDimension } from './pageMetricsTypes'

export interface ResolvedCvConfig {
    /** null なら未設定（GA4 の conversions を使う） */
    cvEventName: string | null
    cvDimension: CvDimension
}

const CV_DIMENSIONS: readonly CvDimension[] = ['eventName', 'customEvent:click_label', 'customEvent:view_label']

export const DEFAULT_CV_CONFIG: ResolvedCvConfig = { cvEventName: null, cvDimension: 'eventName' }

/** productId 未指定・DB エラー・未設定はすべて既定（conversions）に倒す */
export async function loadPageCvConfig(productId: unknown, pagePath: string): Promise<ResolvedCvConfig> {
    if (productId == null || !pagePath) return DEFAULT_CV_CONFIG
    try {
        const config = await prisma.pageCvConfig.findUnique({
            where: { productId_pagePath: { productId: Number(productId), pagePath } },
            select: { cvEventName: true, cvDimension: true },
        })
        if (!config) return DEFAULT_CV_CONFIG
        const cvDimension = CV_DIMENSIONS.find((d) => d === config.cvDimension) ?? 'eventName'
        return { cvEventName: config.cvEventName, cvDimension }
    } catch {
        return DEFAULT_CV_CONFIG
    }
}
