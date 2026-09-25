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
    // 方法0: 統合SA（GCP_SERVICE_ACCOUNT_KEY*）。2026-09-25以降はこれが本筋。
    //        未設定の環境では従来の GA4_SERVICE_ACCOUNT_KEY* 等にフォールバックする。
    try {
        return await getAccessTokenWithServiceAccount(getServiceAccountCredentials())
    } catch (error) {
        console.error('[ga4/oauth] 統合SAでのトークン取得に失敗、従来の方法にフォールバックします:',
            error instanceof Error ? error.message : error)
    }

    // 方法1: サービスアカウントキー（JSON）が設定されている場合
    const serviceAccountKeyJson = process.env.GA4_SERVICE_ACCOUNT_KEY
    if (serviceAccountKeyJson) {
        try {
            // 改行文字を正しく処理
            let jsonString = serviceAccountKeyJson
            // シングルクォートで囲まれている場合は削除
            if (jsonString.startsWith("'") && jsonString.endsWith("'")) {
                jsonString = jsonString.slice(1, -1)
            }
            // \\nを\nに変換
            jsonString = jsonString.replace(/\\n/g, '\n')
            const serviceAccountKey = JSON.parse(jsonString)
            return await getAccessTokenWithServiceAccount(serviceAccountKey)
        } catch (error) {
            console.error('Failed to parse service account key:', error)
            // エラーを再スローして次の方法を試す
        }
    }

    // 方法1-2: サービスアカウントキーファイルパスが設定されている場合
    const serviceAccountKeyPath = process.env.GA4_SERVICE_ACCOUNT_KEY_PATH
    if (serviceAccountKeyPath) {
        try {
            const fs = await import('fs/promises')
            const path = await import('path')
            // 相対パスは process.cwd() 基準で解決（ローカル=プロジェクトルート、Docker=/app）
            const resolvedPath = path.isAbsolute(serviceAccountKeyPath)
                ? serviceAccountKeyPath
                : path.resolve(process.cwd(), serviceAccountKeyPath)
            const keyFile = await fs.readFile(resolvedPath, 'utf-8')
            if (!keyFile.trim()) {
                console.error('GA4_SERVICE_ACCOUNT_KEY_PATH: ファイルが空です:', resolvedPath)
            } else {
                const serviceAccountKey = JSON.parse(keyFile)
                return await getAccessTokenWithServiceAccount(serviceAccountKey)
            }
        } catch (error: any) {
            if (error?.code === 'ENOENT') {
                console.error('GA4_SERVICE_ACCOUNT_KEY_PATH: ファイルが見つかりません:', process.cwd(), serviceAccountKeyPath)
            } else {
                console.error('Failed to read service account key file:', error)
            }
        }
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
        '1. GA4_SERVICE_ACCOUNT_KEY（JSONを1行で）\n' +
        '2. GA4_SERVICE_ACCOUNT_KEY_PATH（キーファイルのパス。Docker の場合はファイルをマウントするか 1 を利用）\n' +
        '3. GA4_CLIENT_ID / GA4_CLIENT_SECRET / GA4_REFRESH_TOKEN（OAuth2）\n' +
        '4. GA4_ACCESS_TOKEN（一時的なトークン）'
    )
}
