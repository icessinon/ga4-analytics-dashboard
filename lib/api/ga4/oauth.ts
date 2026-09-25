/**
 * GA4 OAuth2認証
 * GASコードのAnalyticsDataサービスと同じように動作するように実装
 * 
 * GASでは、Apps Scriptエディタで「サービス」→「Google Analytics Data API」を有効化すると
 * 自動的にOAuth2認証が行われ、アクセストークンの管理はGoogle側で行われます。
 * 
 * Next.jsアプリでは、以下のいずれかの方法で認証を行います：
 * 1. サービスアカウント（推奨）
 * 2. OAuth2認証フロー
 */

import { google } from 'googleapis'
import { getServiceAccountCredentials } from '@/lib/serviceAccount'

/**
 * サービスアカウントを使用してアクセストークンを取得
 * GASの自動認証と同等の機能
 */
export async function getAccessTokenWithServiceAccount(
    serviceAccountKey: any
): Promise<string> {
    const auth = new google.auth.GoogleAuth({
        credentials: serviceAccountKey,
        scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    })

    const client = await auth.getClient()
    const accessToken = await client.getAccessToken()

    if (!accessToken.token || typeof accessToken.token !== 'string') {
        throw new Error('Failed to get access token from service account')
    }

    return accessToken.token
}

/**
 * OAuth2認証フローでアクセストークンを取得
 * ユーザー認証が必要な場合に使用
 */
export async function getAccessTokenWithOAuth2(
    clientId: string,
    clientSecret: string,
    refreshToken: string
): Promise<string> {
    // リダイレクトURI（Docker では APP_URL で 3003 等を指定。Google Cloud の認証情報に同じ URI を登録すること）
    const redirectUri = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        redirectUri.replace(/\/$/, '') // 末尾スラッシュ除去
    )

    oauth2Client.setCredentials({
        refresh_token: refreshToken,
    })

    const accessToken = await oauth2Client.getAccessToken()

    if (!accessToken.token || typeof accessToken.token !== 'string') {
        throw new Error('Failed to get access token from OAuth2')
    }

    return accessToken.token
}

/**
 * 環境変数から認証情報を読み込んでアクセストークンを取得
 * GASの自動認証と同等の機能を提供
 */
export async function getGA4AccessTokenAuto(): Promise<string> {
    // サービスアカウント（統合SA）。2026-09-25に用途別SAを1本へ統合し、
    // 旧 GA4_SERVICE_ACCOUNT_KEY* 経路は撤去した。詳細は lib/serviceAccount.ts。
    try {
        return await getAccessTokenWithServiceAccount(getServiceAccountCredentials())
    } catch (error) {
        console.error('[ga4/oauth] サービスアカウントでのトークン取得に失敗:',
            error instanceof Error ? error.message : error)
    }

    // 方法2: OAuth2認証情報が設定されている場合
    const clientId = process.env.GA4_CLIENT_ID
    const clientSecret = process.env.GA4_CLIENT_SECRET
    const refreshToken = process.env.GA4_REFRESH_TOKEN

    if (clientId && clientSecret && refreshToken) {
        return await getAccessTokenWithOAuth2(clientId, clientSecret, refreshToken)
    }

    // 方法3: 直接アクセストークンが設定されている場合（一時的）
    const accessToken = process.env.GA4_ACCESS_TOKEN
    if (accessToken) {
        return accessToken
    }

    throw new Error(
        'GA4認証情報が設定されていません。.env または .env.local に以下のいずれかを設定してください：\n' +
        '1. GCP_SERVICE_ACCOUNT_KEY（JSONを1行で）または GCP_SERVICE_ACCOUNT_KEY_PATH（キーファイルのパス）\n' +
        '2. GA4_CLIENT_ID / GA4_CLIENT_SECRET / GA4_REFRESH_TOKEN（OAuth2）\n' +
        '3. GA4_ACCESS_TOKEN（一時的なトークン）'
    )
}
