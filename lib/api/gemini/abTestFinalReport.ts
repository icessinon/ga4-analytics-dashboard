import { callGemini } from './callGemini'
import { CV_UNIT_VALUE_YEN, CV_UNIT_VALUE_ASOF, CV_UNIT_DERIVATIONS } from '@/lib/constants/cvUnitValue'

/** CV単価（1件あたり期待売上）＋算出根拠。金額換算の唯一の正データとしてプロンプトに注入する */
function cvUnitValueSection(): string {
    const lines = [
        `【CV単価（1件あたり期待売上・${CV_UNIT_VALUE_ASOF}にSalesforce実測から算出。金額換算は必ずこの単価のみを使い、他の金額を推測・捏造しない）】`,
        `- 会員登録（応募を伴わない単独登録）: ¥${CV_UNIT_VALUE_YEN.signup.toLocaleString()}`,
        `- 人材紹介 応募: ¥${CV_UNIT_VALUE_YEN.JobR.toLocaleString()}`,
        `- 求人広告 応募: ¥${CV_UNIT_VALUE_YEN.JobA.toLocaleString()}（紹介パスアップ成約分のみ）`,
        `- ハローワーク 応募: ¥${CV_UNIT_VALUE_YEN.JobH.toLocaleString()}`,
        `【単価の算出根拠】`,
        ...CV_UNIT_DERIVATIONS.map((d) =>
            `- ${d.label}: コホート${d.cohort}／CV${d.events.toLocaleString()}件・入社${d.hires}件・受注−返金¥${(d.grossFeeYen - d.refundYen).toLocaleString()} → 単価¥${d.unitYen.toLocaleString()}${d.note ? `（${d.note}）` : ''}`
        ),
        `※期待値（平均）。応募CVは求人種別で単価が異なる（人材紹介/求人広告/ハローワーク）ので、対象テストがどの種別の応募かを踏まえて単価を選ぶ。会員登録は下流価値込みで応募と重複を許容し合算しない前提。金額換算は「CV件数 × 単価」で行う`,
    ]
    return lines.join('\n')
}

export interface FinalReportVariant {
    name: string
    label: string
    pv: number
    cv: number
    cvr: number
}

export interface FinalReportFunnelStep {
    stepName: string
    users: Partial<Record<string, number>>
    dropoffRate: Partial<Record<string, number | null>>
}

export interface FinalReportFunnel {
    basis: 'view' | 'click'
    variants: string[]
    steps: FinalReportFunnelStep[]
}

export interface AbTestFinalReportRequest {
    testName: string
    hypothesis: string | null
    expectedImprovementPct: number | null
    startDate: string
    endDate: string | null
    variants: FinalReportVariant[]
    winnerVariant: string | null
    improvementVsAPercent: number | null
    statisticalSignificance: number | null
    recommendation: string | null
    victoryFactors: string | null
    defeatFactors: string | null
    funnel?: FinalReportFunnel | null
    /** 担当者が再生成時に指定した追加観点。指定時はレポート全体でこの観点を重点的に反映させる */
    additionalPerspective?: string | null
    /** Notion施策カードから取得した企画背景・狙い・期待効果などの文脈 */
    notionContext?: string | null
}

export async function generateAbTestFinalReport(req: AbTestFinalReportRequest, productId?: number): Promise<string | null> {
    const variantLines = req.variants.map((v) =>
        `- バリアント${v.name}（${v.label}）: PV ${v.pv.toLocaleString()} ／ CV ${v.cv.toLocaleString()} ／ CVR ${(v.cvr * 100).toFixed(2)}%`
    ).join('\n')

    const resultLines = [
        req.winnerVariant ? `勝者: バリアント${req.winnerVariant}` : '勝者: 判定不能',
        req.improvementVsAPercent != null ? `A比改善率: ${req.improvementVsAPercent >= 0 ? '+' : ''}${req.improvementVsAPercent.toFixed(1)}%` : null,
        req.statisticalSignificance != null ? `統計的有意差: ${req.statisticalSignificance.toFixed(1)}%` : null,
        req.recommendation ? `システム判定: ${req.recommendation}` : null,
    ].filter(Boolean).join('\n')

    const memoLines = [
        req.victoryFactors ? `【担当者メモ：勝因】\n${req.victoryFactors}` : null,
        req.defeatFactors ? `【担当者メモ：敗因・課題】\n${req.defeatFactors}` : null,
    ].filter(Boolean).join('\n\n')

    let funnelSection = ''
    if (req.funnel && req.funnel.steps.length > 0) {
        const basisNote = req.funnel.basis === 'click'
            ? 'クリック基準（各ステップで操作したユニークユーザー数。表示時間条件がなく通過実数に近い）'
            : 'ビュー基準（50%×1秒表示。即通過ユーザーは取りこぼされることがある）'
        const stepLines = req.funnel.steps.map((s) => {
            const cells = req.funnel!.variants.map((v) => {
                const users = s.users[v]
                if (users == null) return `${v}: -`
                const drop = s.dropoffRate[v]
                return `${v}: ${users.toLocaleString()}${drop != null ? `（離脱${(drop * 100).toFixed(1)}%）` : ''}`
            }).join(' ／ ')
            return `- ${s.stepName}: ${cells}`
        }).join('\n')
        funnelSection = `\n【ステップファネル】※${basisNote}\n${stepLines}\n`
    }

    const perspective = req.additionalPerspective?.trim()
    // 観点はレポート全体を方向づける最重要指示として先頭に置く
    const perspectiveDirective = perspective
        ? `\n★最重要指示（担当者が指定した重点観点）★\n今回のレポートは次の観点を主軸に据えて書き直すこと。全セクションをこの観点から捉え直し、関連する数値・ファネル・メモを結びつけて具体的に論じる。観点に関係する発見は各セクションで必ず言及し、必要なら独立した見出しを立ててよい。\n観点に「複数バリアントを合算・グループ化して比較する」旨（例: 「CはBの派生なのでB+Cを合算」「BとCをまとめて評価」など）が含まれる場合は、提示された各バリアントのPVとCVを自分で合算し、統合CVR（＝合算CV÷合算PV）を算出したうえで、その統合値どうしで勝敗・改善率・有意性を論じること。元の個別バリアント値をそのまま3者比較してはならない。\n観点: ${perspective}\n`
        : ''
    const perspectiveReminder = perspective
        ? `\n※ 冒頭の「最重要指示」で指定された観点を、全体を通して主軸として反映すること。表面的な一言で済ませず、その観点に沿って分析を掘り下げる。`
        : ''

    const notion = req.notionContext?.trim()
    const notionSection = notion
        ? `\n【施策カード（企画の背景・狙い・期待効果）】※Notionの施策カードから取得。この施策が「何を狙って作られたか」の一次情報。仮説検証・勝因敗因・学びの各セクションで、カードに書かれた狙い/想定インパクト/ガードレールと実測結果を突き合わせて評価すること。\n${notion}\n`
        : ''

    const prompt = `あなたはWebマーケティング・CRO（コンバージョン率最適化）の専門家です。以下は求人転職サービス(x-work.jp)で実施したABテストの終了時データです。最終レポートを作成してください。
${perspectiveDirective}

【テスト概要】
テスト名: ${req.testName}
期間: ${req.startDate} 〜 ${req.endDate ?? '未設定'}
事前仮説: ${req.hypothesis ?? '（未記入）'}
期待改善率: ${req.expectedImprovementPct != null ? `${req.expectedImprovementPct}%` : '（未設定）'}

【バリアント別結果】
${variantLines}

【判定】
${resultLines}
${funnelSection}${memoLines ? `\n${memoLines}\n` : ''}
${cvUnitValueSection()}
${notionSection}
以下の構成で最終レポートを作成してください:
1. **結果サマリー** — 数値ベースで結果を簡潔にまとめる
2. **仮説検証** — 事前仮説と期待改善率に対して結果はどうだったか（仮説が未記入の場合はテスト名から推測される意図に対して評価）
3. **勝因・敗因分析** — なぜこの結果になったのか。ステップファネルがある場合は「どのステップで差がついたか」を離脱率の数字で具体的に指摘する。統計的有意差・サンプルサイズも踏まえた確度の評価を含める。担当者メモがあれば内容を統合する
4. **学び（今後に活かせる知見）** — 求人転職サービスの改善に汎用的に使える教訓を抽出する
5. **次のアクション** — このテスト結果を受けて次に試すべき施策を具体的に2〜3個提案する

700文字程度で、箇条書きと短い段落を使って読みやすくまとめてください。${perspectiveReminder}`

    return callGemini(prompt, 'generateAbTestFinalReport', productId)
}
