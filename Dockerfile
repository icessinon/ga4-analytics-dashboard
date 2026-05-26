# ── Stage 1: builder ─────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

ENV NODE_OPTIONS=--max-old-space-size=2048

RUN apt-get update -y && apt-get install -y --no-install-recommends ca-certificates && \
    echo "deb http://deb.debian.org/debian bullseye main" > /etc/apt/sources.list.d/bullseye.list && \
    apt-get update -y && apt-get install -y --no-install-recommends libssl1.1 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps

COPY prisma ./prisma/
RUN npx prisma generate

COPY . .
RUN npm run build

# ── Stage 2: app（standalone 軽量イメージ）────────────────────────────────────
FROM node:20-bookworm-slim AS app

RUN apt-get update -y && apt-get install -y --no-install-recommends ca-certificates && \
    echo "deb http://deb.debian.org/debian bullseye main" > /etc/apt/sources.list.d/bullseye.list && \
    apt-get update -y && apt-get install -y --no-install-recommends libssl1.1 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# standalone が内部に最小限の node_modules を持つ
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

# Prisma ネイティブバイナリ・依存（standalone に自動コピーされないため明示的に追加）
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# prisma CLI（migrate deploy 用。devDep のためビルダーから手動コピー）
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh && mkdir -p /app/logs

EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]

# ── Stage 3: scheduler（ソース + 最小構成）────────────────────────────────────
FROM node:20-bookworm-slim AS scheduler

RUN apt-get update -y && apt-get install -y --no-install-recommends ca-certificates && \
    echo "deb http://deb.debian.org/debian bullseye main" > /etc/apt/sources.list.d/bullseye.list && \
    apt-get update -y && apt-get install -y --no-install-recommends libssl1.1 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production

# スケジューラーが必要とするものだけ（Next.js ビルド成果物は不要）
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/workers ./workers
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/prisma ./prisma

ENTRYPOINT ["npx", "tsx", "workers/ab-test-scheduler.ts"]
