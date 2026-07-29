import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, paginateScan, type ScanCommandInput } from '@aws-sdk/lib-dynamodb'

/**
 * クロスワーク本体（drm-front）のDynamoDBを読み取り専用で参照するクライアント。
 * スカウトファネル等、GA4に無い製品データの集計に使う。
 * 書き込みは行わない（IAM上も読み取りに留める運用）。
 */

export const DDB_TABLES = {
    scoutHistories: 'ScoutHistories-prd',
    jobApplications: 'JobApplication-prd',
    guestJobApplications: 'GuestJobApplication-prd',
    jobDescriptions: 'JobDescriptions-prd',
    memberUsers: 'MemberUsers-prd',
} as const

let docClient: DynamoDBDocumentClient | null = null

export function getDdbDocClient(): DynamoDBDocumentClient {
    if (docClient) return docClient
    const accessKeyId = process.env.DDB_AWS_ACCESS_KEY_ID
    const secretAccessKey = process.env.DDB_AWS_SECRET_ACCESS_KEY
    if (!accessKeyId || !secretAccessKey) {
        throw new Error('DDB_AWS_ACCESS_KEY_ID / DDB_AWS_SECRET_ACCESS_KEY が設定されていません')
    }
    const client = new DynamoDBClient({
        region: process.env.DDB_AWS_REGION || 'ap-northeast-1',
        credentials: { accessKeyId, secretAccessKey },
    })
    docClient = DynamoDBDocumentClient.from(client, {
        marshallOptions: { removeUndefinedValues: true },
    })
    return docClient
}

/** ページネーションを吸収してScanの全件を返す（テーブルが小規模な用途専用） */
export async function scanAll<T>(input: ScanCommandInput, maxItems = 100000): Promise<T[]> {
    const client = getDdbDocClient()
    const items: T[] = []
    for await (const page of paginateScan({ client }, input)) {
        for (const item of page.Items ?? []) {
            items.push(item as T)
            if (items.length >= maxItems) return items
        }
    }
    return items
}
