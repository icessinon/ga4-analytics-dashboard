#!/usr/bin/env bash
# 本番ダッシュボード(EC2)の API を叩くラッパー。
#
#   scripts/prod-api.sh GET  '/api/ab-test?limit=10'
#   scripts/prod-api.sh POST /api/ab-test payload.json
#   scripts/prod-api.sh PUT  /api/ab-test '{"id":12,"status":"completed"}'
#   scripts/prod-api.sh DELETE '/api/ab-test?id=12'
#
# 認証は middleware.ts の ga4_auth Cookie 方式。初回に /api/auth/login で Cookie を取り、
# 以降はキャッシュを使い回す（24時間で失効。失効を検知したら自動で取り直す）。
# 接続情報は .env の PROD_DASHBOARD_URL / _USER / _PASSWORD（.env は gitignore 済み）。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COOKIE_JAR="${TMPDIR:-/tmp}/ga4-prod-dashboard-cookie.txt"

RELOGIN=0
if [ "${1:-}" = "--relogin" ]; then RELOGIN=1; shift; fi

METHOD="${1:?usage: prod-api.sh [--relogin] <METHOD> <PATH> [json-file|json-string]}"
API_PATH="${2:?usage: prod-api.sh [--relogin] <METHOD> <PATH> [json-file|json-string]}"
BODY="${3:-}"

[ -f "$REPO_ROOT/.env" ] || { echo "ERROR: .env がありません" >&2; exit 1; }
set -a
# shellcheck disable=SC1091
. "$REPO_ROOT/.env"
set +a

: "${PROD_DASHBOARD_URL:?.env に PROD_DASHBOARD_URL を設定してください}"
: "${PROD_DASHBOARD_USER:?.env に PROD_DASHBOARD_USER を設定してください}"
: "${PROD_DASHBOARD_PASSWORD:?.env に PROD_DASHBOARD_PASSWORD を設定してください}"

# ログイン本文は環境変数から python に組み立てさせる（コマンドラインに出さない）
login() {
    python3 -c 'import json,os,sys; sys.stdout.write(json.dumps({"username":os.environ["PROD_DASHBOARD_USER"],"password":os.environ["PROD_DASHBOARD_PASSWORD"]}))' \
        | curl -sS -X POST "$PROD_DASHBOARD_URL/api/auth/login" \
            -H 'Content-Type: application/json' \
            -c "$COOKIE_JAR" --max-time 30 --data-binary @- >/dev/null
    chmod 600 "$COOKIE_JAR" 2>/dev/null || true
}

if [ "$RELOGIN" = "1" ] || ! grep -q 'ga4_auth' "$COOKIE_JAR" 2>/dev/null; then
    login
fi

RESPONSE_BODY="$(mktemp "${TMPDIR:-/tmp}/ga4-prod-api-body.XXXXXX")"
trap 'rm -f "$RESPONSE_BODY"' EXIT

# 本文はファイルに落とし、戻り値として HTTP ステータスだけを返す。
# Cookie 失効時の応答は本文が `/login?from=...` の一行だけだったり
# ログイン画面の HTML だったりと一定しないので、本文ではなくステータスで判定する。
request() {
    local args=(-sS -o "$RESPONSE_BODY" -w '%{http_code}' -X "$METHOD" "$PROD_DASHBOARD_URL$API_PATH" -b "$COOKIE_JAR" --max-time 180)
    if [ -n "$BODY" ]; then
        args+=(-H 'Content-Type: application/json')
        if [ -f "$BODY" ]; then args+=(--data-binary "@$BODY"); else args+=(--data-binary "$BODY"); fi
    fi
    curl "${args[@]}"
}

STATUS="$(request)"

# 3xx（/login へのリダイレクト）・401・403 は Cookie 失効とみなし、一度だけ取り直して再試行
case "$STATUS" in
    30[0-9]|401|403)
        login
        STATUS="$(request)"
        ;;
esac

case "$STATUS" in
    30[0-9]|401|403)
        echo "ERROR: 認証に失敗しました (HTTP $STATUS)。.env の PROD_DASHBOARD_USER / PROD_DASHBOARD_PASSWORD を確認してください。" >&2
        exit 1
        ;;
esac

# JSON なら整形、そうでなければ素通し
python3 -c '
import json, sys
raw = open(sys.argv[1], encoding="utf-8", errors="replace").read()
try:
    print(json.dumps(json.loads(raw), ensure_ascii=False, indent=2))
except Exception:
    print(raw)
' "$RESPONSE_BODY"

# 4xx / 5xx は本文を出したうえで異常終了する（呼び出し側が失敗に気づけるように）
case "$STATUS" in
    [45][0-9][0-9])
        echo "ERROR: HTTP $STATUS" >&2
        exit 1
        ;;
esac
