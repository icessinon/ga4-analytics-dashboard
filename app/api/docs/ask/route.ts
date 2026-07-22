import { NextResponse } from 'next/server'
import { callGemini } from '@/lib/api/gemini/callGemini'
import { buildKnowledgeBase } from '@/lib/docs/knowledgeBase'

export async function POST(request: Request) {
    try {
        const { question } = await request.json()
        if (typeof question !== 'string' || !question.trim() || question.length > 1000) {
            return NextResponse.json({ error: '質問を入力してください（1000文字以内）' }, { status: 400 })
        }

        const prompt = `あなたはGA4分析ダッシュボード（クロスワーク/x-work.jp向け）のヘルプアシスタントです。
以下のドキュメント（機能一覧・API一覧・ドメイン知識）だけを根拠に、ユーザーの質問に日本語で答えてください。

${buildKnowledgeBase()}

---

ユーザーの質問: ${question.trim()}

回答のルール:
- 簡潔に、質問に直接答える（目安300字以内。表が有効なら使ってよい）
- 該当する機能ページやドキュメントがあれば、パス（例: /cv-types、/docs/glossary）を案内する
- ドキュメントに記載がないことは推測せず「ドキュメントに記載がありません」と答え、近い情報があれば紹介する
- 重要な語は **太字** で強調`

        const answer = await callGemini(prompt, 'docsAsk')
        if (!answer) {
            return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 })
        }
        return NextResponse.json({ answer })
    } catch (error) {
        console.error('Docs Ask API Error:', error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : '回答の生成に失敗しました' },
            { status: 500 }
        )
    }
}
