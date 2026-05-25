#!/bin/sh
set -e

# standalone モード（node server.js）での起動時にマイグレーション実行
if [ -n "$DATABASE_URL" ] && [ "$1" = "node" ] && [ "$2" = "server.js" ]; then
  echo "Running database migrations..."
  ./node_modules/.bin/prisma migrate deploy
fi

exec "$@"
