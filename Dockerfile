# GA4 Analytics Dashboard - 本番用マルチステージビルド
# Debian ベース（Prisma が OpenSSL と互換性を取るため）
FROM node:20-bookworm-slim AS builder

# t3a.medium（4GB）等でビルド時に OOM しないよう Node のヒープ上限を 2GB
ENV NODE_OPTIONS=--max-old-space-size=2048

# Prisma がビルド時の page data 収集で libssl1.1 を必要とするため追加（Bookworm では Bullseye から取得）
RUN apt-get update -y && apt-get install -y --no-install-recommends ca-certificates && \
    echo "deb http://deb.debian.org/debian bullseye main" > /etc/apt/sources.list.d/bullseye.list && \
    apt-get update -y && apt-get install -y --no-install-recommends libssl1.1 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 依存関係（eslint-config-next の peer と合わせるため --legacy-peer-deps）
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps

# Prisma クライアント生成
COPY prisma ./prisma/
RUN npx prisma generate

# ソースをコピーしてビルド
COPY . .
RUN npm run build

# ----------------------------------------
# 本番用イメージ
# ----------------------------------------
FROM node:20-bookworm-slim AS runner

# Prisma が OpenSSL 1.1 エンジンを使うため libssl1.1 を追加（Bookworm では Bullseye から取得）
RUN apt-get update -y && apt-get install -y --no-install-recommends ca-certificates && \
    echo "deb http://deb.debian.org/debian bullseye main" > /etc/apt/sources.list.d/bullseye.list && \
    apt-get update -y && apt-get install -y --no-install-recommends libssl1.1 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# アプリ実行用のファイルをコピー
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/next.config.ts ./

# scheduler 用（tsx で TypeScript を直接実行するため）
COPY --from=builder /app/workers ./workers
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/app ./app
COPY --from=builder /app/components ./components
COPY --from=builder /app/tsconfig.json ./

# マイグレーション実行後に Next を起動
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3000

# デフォルトは Web アプリ。scheduler は compose で command を上書き
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
