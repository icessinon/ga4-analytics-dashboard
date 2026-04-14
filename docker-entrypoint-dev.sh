#!/bin/sh
set -e

# ボリュームマウント後は node_modules が空のため、初回のみ npm ci で投入
if [ ! -d node_modules/next ]; then
    echo "Installing dependencies (npm ci)..."
    # Ensure prisma (devDependency) is present even if NODE_ENV=production in scheduler.
    npm ci --legacy-peer-deps --include=dev
fi

# app 起動時のみ Prisma generate / migrate を実行
if [ -n "$DATABASE_URL" ] && [ "$1" = "npm" ] && [ "$2" = "run" ] && [ "$3" = "dev" ]; then
    npx prisma generate
    echo "Running database migrations..."
    npx prisma migrate deploy
fi

exec "$@"
