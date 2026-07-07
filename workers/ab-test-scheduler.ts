import * as cron from 'node-cron'
import { findAbTestsToExecute } from '@/lib/services/ab-test/scheduleService'
import { runBqSync } from './bq-sync-missing'

/**
 * 定期的にDBをチェックして、実行すべきABテストを実行
 * 5分ごとにチェック
 */
const cronExpression = '0 */5 * * * *'
cron.schedule(cronExpression, async () => {
    try {
        const abTestIds = await findAbTestsToExecute()
        
        const ts = new Date().toISOString()
        if (abTestIds.length === 0) {
            console.log(`[AB Test Scheduler] ${ts} チェック完了: 実行対象 0 件`)
            return
        }

        console.log(`[AB Test Scheduler] ${ts} チェック完了: 実行対象 ${abTestIds.length} 件 (ID: ${abTestIds.join(", ")})`)
        // スケジューラーから API を叩くための URL（Docker 時は APP_URL=http://app:3000 を compose で指定）
        const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        const internalSecret = process.env.INTERNAL_API_SECRET || ''
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (internalSecret) headers['x-internal-secret'] = internalSecret

        for (const abTestId of abTestIds) {
            try {
                const url = `${appUrl}/api/ab-test/execute`
                
                const response = await fetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ abTestId }),
                })

                if (!response.ok) {
                    const text = await response.text()
                    console.error(`[AB Test Scheduler] HTTPエラー (ID: ${abTestId}): ${response.status} ${response.statusText}`)
                    console.error(`[AB Test Scheduler] レスポンス: ${text.substring(0, 200)}`)
                    continue
                }

                const contentType = response.headers.get('content-type')
                if (!contentType || !contentType.includes('application/json')) {
                    const text = await response.text()
                    console.error(`[AB Test Scheduler] 予期しないContent-Type (ID: ${abTestId}): ${contentType}`)
                    console.error(`[AB Test Scheduler] レスポンス: ${text.substring(0, 200)}`)
                    continue
                }

                await response.json()
            } catch (error) {
                console.error(`[AB Test Scheduler] ABテスト実行エラー (ID: ${abTestId}):`, error)
                if (error instanceof Error) {
                    console.error(`[AB Test Scheduler] エラーメッセージ: ${error.message}`)
                }
            }
        }
    } catch (error) {
        console.error('[AB Test Scheduler] スケジュールチェックエラー:', error)
    }
}, {
    timezone: 'Asia/Tokyo',
})

// CV急落アラート: 毎日 09:30 JST に前日CV/CVRを過去4週の同一曜日平均と比較して急落時にSlack通知
cron.schedule('0 30 9 * * *', async () => {
    try {
        const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (process.env.INTERNAL_API_SECRET) headers['x-internal-secret'] = process.env.INTERNAL_API_SECRET
        const response = await fetch(`${appUrl}/api/alerts/cv-drop`, { method: 'POST', headers })
        if (!response.ok) {
            console.error(`[CV Drop Alert] HTTPエラー: ${response.status} ${response.statusText}`)
            return
        }
        const data = await response.json() as { results?: Array<{ alerts: unknown[] }> }
        const alertCount = (data.results ?? []).reduce((sum, r) => sum + r.alerts.length, 0)
        console.log(`[CV Drop Alert] ${new Date().toISOString()} チェック完了: アラート ${alertCount} 件`)
    } catch (error) {
        console.error('[CV Drop Alert] 実行エラー:', error)
    }
}, {
    timezone: 'Asia/Tokyo',
})

// BQ 補完同期: 毎日 04:00 JST に過去 3 日ぶんの未同期レコードを再送
cron.schedule('0 0 4 * * *', async () => {
    try {
        await runBqSync(3, 'cron')
    } catch (error) {
        console.error('[BQ Sync] スケジュール実行エラー:', error)
    }
}, {
    timezone: 'Asia/Tokyo',
})

process.on('SIGINT', () => {
    process.exit(0)
})

process.on('SIGTERM', () => {
    process.exit(0)
})
