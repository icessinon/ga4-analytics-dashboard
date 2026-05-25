/**
 * Gemini API クライアント
 * 元のGASコードのevaluateWithGemini関数を参考に実装
 */
import { logGeminiUsage } from './logger'

export interface GeminiEvaluationRequest {
    evaluation: {
        allPassed: boolean;
        checks: any;
        recommendation: string;
    };
    winner: {
        name: string;
        data: {
            cvr: number;
            pv: number;
            cv: number;
        };
    };
    runnerUp: {
        name: string;
        data: {
            cvr: number;
            pv: number;
            cv: number;
        };
    };
    config: any;
}

/**
 * Gemini APIでABテスト結果を評価
 */
export async function evaluateWithGemini(
    request: GeminiEvaluationRequest,
    apiKey: string
): Promise<string | null> {
    const key = apiKey?.trim() || process.env.GEMINI_API_KEY
    if (!key) return null

    try {
        const prompt = buildEvaluationPrompt(request.evaluation, request.winner, request.runnerUp, request.config);

        // Gemini APIのエンドポイント
        // GASコードでは gemini-2.5-flash を使用
        // 利用可能なモデル: gemini-2.5-flash, gemini-1.5-flash, gemini-1.5-pro
        const modelName = 'gemini-2.5-flash'
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`
        const payload = {
            contents: [
                {
                    parts: [
                        {
                            text: prompt,
                        },
                    ],
                },
            ],
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text()
            let error
            try {
                error = JSON.parse(errorText)
            } catch {
                error = { message: errorText }
            }
            console.error(`Gemini API Error: ${response.status} - ${JSON.stringify(error)}`)
            throw new Error(`Gemini API Error: ${response.status} - ${error.error?.message || error.message || 'Unknown error'}`)
        }

        const responseData = await response.json()

        const usage = responseData.usageMetadata
        if (usage) {
            logGeminiUsage({
                function: 'evaluateWithGemini',
                model: modelName,
                promptTokens: usage.promptTokenCount ?? 0,
                completionTokens: usage.candidatesTokenCount ?? 0,
                totalTokens: usage.totalTokenCount ?? 0,
            })
        }

        if (responseData.candidates && responseData.candidates.length > 0) {
            const candidate = responseData.candidates[0]
            if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                const text = candidate.content.parts[0].text
                if (text) {
                    return text.trim()
                }
            }
        }

        return null
    } catch (error) {
        console.error(`Gemini API呼び出しエラー: ${error}`);
        return null;
    }
}

/**
 * 評価プロンプトを構築
 */
function buildEvaluationPrompt(
    evaluation: any,
    winner: any,
    runnerUp: any,
    config: any
): string {
    const checks = evaluation.checks;
    const isFixedValue =
        checks.significance.periodBased === checks.significance.cvBased &&
        checks.significance.cvBased === checks.significance.pvBased;
    const significanceDisplay = isFixedValue
        ? `${checks.significance.required}%`
        : `${checks.significance.required}% (期間:${checks.significance.periodBased}% / CV数:${checks.significance.cvBased}% / PV数:${checks.significance.pvBased}%)`;

    return `あなたは統計分析の専門家です。以下のABテスト結果を評価し、実務的な見解を述べてください。

【ABテスト結果】
- 勝利パターン: ${winner.name} (CVR: ${(winner.data.cvr * 100).toFixed(2)}%, PV: ${winner.data.pv.toLocaleString()}, CV: ${winner.data.cv.toLocaleString()})
- 2位パターン: ${runnerUp.name} (CVR: ${(runnerUp.data.cvr * 100).toFixed(2)}%, PV: ${runnerUp.data.pv.toLocaleString()}, CV: ${runnerUp.data.cv.toLocaleString()})
- 改善率: ${checks.improvement.improvementRate.toFixed(2)}%
- 差分: ${checks.improvement.differencePt.toFixed(2)}pt

【判定基準と結果】
① 統計的有意差: ${checks.significance.passed ? '✅ 合格' : '❌ 不合格'}
        - 基準値: ${significanceDisplay}
        - 実績値: ${checks.significance.value}% (Z=${checks.significance.zScore})

② サンプル数: ${checks.sampleSize.passed ? '✅ 合格' : '❌ 不合格'}
        - 基準値: 各${config.minPV || 1000}PV以上
        - 実績値: ${winner.name}:${checks.sampleSize.winnerPV.toLocaleString()}PV (${checks.sampleSize.winnerCV}CV) / ${runnerUp.name}:${checks.sampleSize.runnerUpPV.toLocaleString()}PV (${checks.sampleSize.runnerUpCV}CV)

③ テスト期間: ${checks.period.passed ? '✅ 合格' : '❌ 不合格'}
        - 基準値: ${config.minDays || 14}日以上
        - 実績値: ${checks.period.days}日間 (${checks.period.reliabilityLevel})

④ 改善幅: ${checks.improvement.passed ? '✅ 合格' : '❌ 不合格'}
        - 基準値: 改善率${config.minImprovementRate || 5}%以上 または 差分${config.minDifferencePt || 0.5}pt以上
        - 実績値: 改善率${checks.improvement.improvementRate.toFixed(2)}% / 差分${checks.improvement.differencePt.toFixed(2)}pt

【総合判定】
${evaluation.allPassed ? '✅ すべての判定基準を満たしています。' : '⚠️ 一部の判定基準を満たしていません。'}

【評価依頼】
上記のABテスト結果について、以下の観点から評価してください：
1. 統計的な信頼性の観点（サンプルサイズ、有意差の解釈）
2. ビジネス的な意味（改善率の実務的な価値）
3. 注意点や追加で確認すべき点
4. 最終的な推奨事項

回答は簡潔に（200文字程度）、実務的な観点を重視してください。`;
}
