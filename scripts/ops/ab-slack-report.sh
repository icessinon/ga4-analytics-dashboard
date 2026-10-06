#!/usr/bin/env bash
# ABテスト結果をSlackへ共有する（本番ダッシュボードの数値＋詳細URL入り・見やすいBlock Kit）。
# 送信先は .env の SLACK_WEBHOOK_URL_ABREPORT（AB結果共有チャンネル。SEO等の通知用 SLACK_WEBHOOK_URL とは別）。
# 使い方:
#   scripts/ab-slack-report.sh <abTestId>
# 例: scripts/ab-slack-report.sh 8
set -euo pipefail
cd "$(dirname "$0")/../.."

ID="${1:?usage: ab-slack-report.sh <abTestId>}"
MODE="prod"

# .env から webhook / ダッシュボードURL を読む（キー名のみ参照。値はログに出さない）
get_env() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
DASH_URL="$(get_env PROD_DASHBOARD_URL)"
WEBHOOK="$(get_env SLACK_WEBHOOK_URL_ABREPORT)"
[ -n "$WEBHOOK" ] || { echo "ERROR: SLACK_WEBHOOK_URL_ABREPORT が .env に未設定"; exit 1; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
./scripts/prod-api.sh GET "/api/ab-test/$ID"          > "$TMP/ab.json"
./scripts/prod-api.sh GET "/api/ab-test/$ID/current"  > "$TMP/cur.json"

PAYLOAD="$TMP/slack.json"
AB="$TMP/ab.json" CUR="$TMP/cur.json" DASH="$DASH_URL" MODE="$MODE" OUT="$PAYLOAD" python3 - << 'PY'
import json, os
ab  = json.load(open(os.environ['AB']))['abTest']
cur = json.load(open(os.environ['CUR']))
dash = os.environ['DASH'].rstrip('/')
mode = os.environ['MODE']

import re
name   = ab.get('name','(no name)')
status = ab.get('status','')
winner = ab.get('winnerVariant')
improve= ab.get('improvementVsAPercent')
issue  = ab.get('issueUrl')
report = ab.get('finalAiReport') or ''
victory= ab.get('victoryFactors') or ''

def md_to_slack(t):
    # Markdown → Slack mrkdwn。番号付き見出し(### 1. 結果サマリー 等)は ◽️＋太字で段落を見やすく
    out = []
    for line in t.split('\n'):
        h = re.match(r'^#{1,6}\s*(?:\d+[.．、]\s*)?(.+?)\s*$', line)
        if h:
            out.append('◽️ *' + re.sub(r'\*\*', '', h.group(1)).strip() + '*')
        else:
            out.append(re.sub(r'^\s*[\*\-]\s+', '• ', line.replace('**', '*')))
    return '\n'.join(out).strip()

def pick_sections(md, keywords):
    # "### 見出し" 区切りで、keywords を含む見出しのセクション本文を集める
    parts = re.split(r'\n(?=#{2,6}\s)', md)
    picked = []
    for p in parts:
        head = p.splitlines()[0] if p.splitlines() else ''
        if any(k in head for k in keywords):
            picked.append(p)
    return "\n\n".join(picked)

# 勝因サマリー: victoryFactors優先、無ければ最終AIレポートの「サマリー/勝因/要因」セクション
summary_src = victory or pick_sections(report, ['サマリー','勝因','勝利','要因']) or report
summary_txt = md_to_slack(summary_src)
if len(summary_txt) > 1500:
    summary_txt = summary_txt[:1500].rstrip() + ' …'
def d(s):
    return (s or '')[:10]
period = f"{d(ab.get('startDate'))} 〜 {d(ab.get('endDate'))}"
url = f"{dash}/ab-test/{ab.get('id')}"

variants = cur.get('variants', [])
comps = {c['variant']: c for c in cur.get('comparisons', [])}
vmap = {v['key']: v for v in variants}
# リフト/有意性（winner優先、無ければleader）
leader = winner or cur.get('leader')
sig = None
if leader and leader in comps:
    sig = comps[leader].get('significance')

done = status == 'completed'
head = f"{'✅ ABテスト完了' if done else '🧪 ABテスト途中経過'}｜{name}"

# 勝者サマリー行
if winner and improve is not None:
    try: imp = f"{float(improve):+.1f}%"
    except Exception: imp = f"+{improve}%"
    summary = f"勝者は *{winner}*。A比 *{imp}* の改善" + (f"（有意性{sig}%）" if sig is not None else "") + "。"
elif leader:
    summary = f"現在のリーダーは *{leader}*" + (f"（有意性{sig}%）" if sig is not None else "") + "。"
else:
    summary = "結果集計中。"

# バリアント別CVRフィールド
def cvr_line(v):
    pv, cv, r = v.get('pv',0), v.get('cv',0), v.get('cvr',0)
    star = ' :trophy:' if v['key']==winner else ''
    return f"*{v['key']}群{star}:*\n{r*100:.1f}%（{cv}/{pv}）"
fields = [{'type':'mrkdwn','text':cvr_line(v)} for v in variants]
fields.append({'type':'mrkdwn','text':f"*期間:*\n{period}"})

blocks = [
    {'type':'header','text':{'type':'plain_text','text':head}},
    {'type':'section','text':{'type':'mrkdwn','text':summary}},
    {'type':'section','fields':fields[:10]},
]
if summary_txt:
    blocks.append({'type':'divider'})
    blocks.append({'type':'section','text':{'type':'mrkdwn','text':'*📝 サマリー・勝因*\n'+summary_txt}})
blocks += [
    {'type':'actions','elements':[
        {'type':'button','text':{'type':'plain_text','text':'📊 ダッシュボードで詳細を見る'},'url':url}
    ]},
    {'type':'context','elements':[{'type':'mrkdwn','text':
        (f"issue #{issue} ・ " if issue else "") + f"{url}"}]},
]
json.dump({'text':f"{head} / {summary}", 'blocks':blocks}, open(os.environ['OUT'],'w'), ensure_ascii=False)
PY

CODE=$(curl -s -o "$TMP/resp.txt" -w '%{http_code}' -X POST -H 'Content-type: application/json' --data @"$PAYLOAD" "$WEBHOOK")
echo "mode=$MODE http=$CODE resp=$(cat "$TMP/resp.txt")"
[ "$CODE" = "200" ]
