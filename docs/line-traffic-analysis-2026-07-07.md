# LINE流入・direct過多の実態調査

調査日: 2026-07-07 ／ 対象: x-work.jp（GA4 property 534098180）／ 期間: 過去30日（2026-06-07 〜 2026-07-06）

> **【2026-07-08 追記】直後の調査で「6/16〜6/26のキャンペーンスパイク」と記載した desktop Chrome direct の急増は、
> シンガポール発のbotトラフィックと確定した（国=Singapore が期間計283,440セッション・99.6%が desktop/Chrome/Direct・CV 0件）。
> 対策としてダッシュボードの全GA4クエリにデフォルトで country=Japan フィルタを適用済み（国別軸の分析は除外可能）。**

## 調査の背景

会員登録の流入経路分析（docs/signup-source-analysis-2026-07-06.md）で `(direct)/(none)` が721人と最多だったため、「LINE内ブラウザのリファラー欠落を含む」仮説を検証した。

## 結論（サマリー）

**「direct過多 = LINE計測漏れ」仮説はほぼ否定。** directの正体は主に3つ:

1. **6/16〜6/26 キャンペーン期間の desktop Chrome 異常トラフィック**（bot・計測ツールの疑い）
2. 通常時のブックマーク・URL直接アクセス（企業側 /manage 系を含む）
3. アプリ内ブラウザ経由の utm 欠落分（direct CV の約19%と限定的）

LINE流入は utm 運用が概ね効いており、**richmenu経由のCVRは5.2%とサイト平均の約25倍**。計測改善よりも「LINE配信の拡大」の方がリターンが大きい。

## 数字の根拠

### 1. direct 334,829セッションの大半はキャンペーンスパイク

- 日別 direct セッション: 通常期 約1,800〜2,600/日 → **6/16〜6/26 は 7,900〜43,300/日**
- スパイク期間の合計 ≈ 28万セッション（direct全体の約85%）
- **デバイス内訳: desktop 288,652（86%）/ mobile 48,290**
  - モバイル9割のサービスで desktop direct が異常比率 → ユーザー流入ではなく bot・広告計測システムの可能性が高い
- ブラウザ内訳: Chrome 301,633 が突出。LINE系アプリ内ブラウザ（Safari in-app 5,478 + Android Webview 5,396）は約1.1万で direct 全体の3%のみ

### 2. LINE流入（utm付き）は少数精鋭

| source/medium | セッション | 会員登録CV | CVR |
|---|---|---|---|
| line / social | 2,730 | 141 | **5.2%** |
| (direct) / (none) | 334,829 | 696 | 0.2% |
| google / organic | 32,238 | 63 | 0.2% |
| scout / sms | 115,928 | 41 | 0.04% |

- line ソースのキャンペーン内訳: richmenu_all_jobsearch 1,082 / survey_thanks_scout 667 / richmenu_member_jobsearch 554 / richmenu_member_scoutcheck 355 / richmenu_all_registration 66
- `openExternalBrowser=1` 付きランディング（LINEから外部ブラウザへ遷移した痕跡）: line 1,399 / product 634 / **(direct) 142** → utm欠落は142セッションのみで、LINE→外部ブラウザ遷移でも utm はほぼ維持されている

### 3. direct CV 696人のブラウザ内訳

| ブラウザ | CV | 解釈 |
|---|---|---|
| Safari 276 + Chrome 265 + Edge 21 ほか | 567（81%） | ブックマーク・再訪・URL直打ちの登録が主体 |
| Safari (in-app) 68 + Android Webview 61 | 129（19%） | アプリ内ブラウザ経由（LINE以外のアプリも含む） |

## 推奨アクション

1. **【最優先】6/16〜6/26 の desktop Chrome direct 急増の正体確認**
   - 当該期間に実施した施策（広告・掲載面）を配信レポートと突合。実ユーザーでなければ広告費の妥当性に関わる
   - GA4 管理画面で「内部トラフィックフィルタ」「既知のボットフィルタリング」の設定を確認
2. **LINE配信の拡大検討**: richmenu経由 CVR 5.2% は圧倒的に高効率。richmenu_all_registration（66セッション）など露出の少ない導線の強化余地あり
3. **LINE個別配信メッセージの utm 徹底**: REMIND_NEXT_DAY 系が計4セッションと極端に少ない。リマインド配信のリンクに utm が付いているか確認
4. **スカウトSMSのCVR改善**: scout/sms は115,928セッションに対しCV 41（CVR 0.04%）。流入は大きいのに登録に繋がっていない。ランディング先とメッセージ訴求の見直し候補
5. アプリ内ブラウザの utm 欠落（direct の約19%）は許容範囲。utm 運用の継続が最善策で、追加の計測実装は不要

## 補足

- browser ディメンションに "Line" は出現しない（GA4はLINE内ブラウザを Safari (in-app) / Android Webview に分類）
- (direct) のランディング上位に /manage/*（企業側管理画面）が多数 → 企業ユーザーのブックマークアクセスが direct に混入している。求職者分析では /manage 系の除外を検討
