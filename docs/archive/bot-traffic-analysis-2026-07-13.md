# 6月セッション急増bot（シンガポール）の正体調査

調査日: 2026-07-13 ／ 対象: x-work.jp ／ データソース: GA4（property 534098180）+ Amplify Hosting アクセスログ（CloudFront）

## 結論

**Ahrefsではない。Tencent Cloud シンガポール（ACEVILLE PTE.LTD.）上で動く、検知回避型の大規模分散スクレイパー。**
加えて、AWS東京のEC2からの別クローラーも並行稼働していた（こちらはGA4には映っていない）。

## 経緯

- GA4で6/16〜6/26にシンガポール発 283,440セッション（日本とほぼ同規模）を検出（desktop/Chrome/Direct 99.6%・CV 0件・24時間均等・1セッション≒1PV・平均滞在1.6秒）
- Ahrefs説（本社シンガポール）を検証するため、Amplify Hosting のアクセスログ（`aws amplify generate-access-logs`、appId d3egkdlj4m310n）でピーク日 6/20 12-13時(UTC) の337,334リクエストを分析

## 実ログでの判定結果

### シンガポール勢（GA4に映っていた本体）

- SINエッジ経由: **167,302リクエスト/時**（全体の約半分、最大勢力）
- 送信元: **43.172.x.x / 43.173.x.x に大量分散**（上位IPでも145リクエスト/時 → 数百〜数千IPに分散してレート検知を回避）
- RDAP: `43.160.0.0 - 43.175.255.255` = **ACEVILLEPTELTD-SG（ACEVILLE PTE.LTD.）= Tencent Cloud シンガポール**
- UA: Windows Chrome を偽装（`Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Chrome/121`）
- JSレンダリングを実行するためGA4タグが発火 → GA4に「シンガポール/desktop/Chrome/Direct」として記録された

### Ahrefs説の棄却

- Ahrefs公開IPレンジ（51レンジ、api.ahrefs.com/v3/public/crawler-ip-ranges）との突合: **一致 0リクエスト**
- UAに "Ahrefs" を含むリクエスト: 8件のみ（正規のAhrefsBotが微量に居るだけ。正規botはUAを名乗るためGA4の自動除外対象）

### 副産物: AWS東京の別クローラー

- `13.231.206.193`（AWS ap-northeast-1 EC2）から **42,456リクエスト/時**（単一IP・Chrome 121偽装UA・ページ8,104+アセット34,352）
- GA4のJapanセッションは平常値だったため、こちらはGA4タグを発火させていない（GAをブロックしている）
- その他の上位は正規bot（Googlebot 66.249.70.x、自社のuptime-monitor、DataForSeoBot 等）

## 対策の選択肢

1. **【実施済み】ダッシュボード側**: 全GA4クエリにデフォルト `country=Japan` フィルタ（2026-07-13 デプロイ済み）。分析への影響は解消
2. **【推奨】WAF/CloudFront側**: `43.160.0.0/12`（Tencent SG）へのブロックまたはレートリミット/チャレンジ。シンガポール発のCVは0件のため正規ユーザーへの影響は実質なし。AWS東京 `13.231.206.193` もブロック候補（IP可変の可能性あり、AWS WAF Bot Control の導入が本筋）
3. GA4の内部トラフィックフィルタでのIP除外は、対象IPが広大・可変のため非現実的（ダッシュボード側フィルタで代替済み）

## 備考

- Amplify アクセスログは `aws amplify generate-access-logs --app-id d3egkdlj4m310n --domain-name x-work.jp --start-time ... --end-time ...` で取得可能（drm-front の SDK_AWS_* 認証を使用）
- 分散スクレイピングの目的は求人データ収集の可能性が高い（media_ 求人ページを網羅的にクロール）
