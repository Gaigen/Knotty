# ---------- Этап 1: сборка ----------
# bun — только как менеджер пакетов (bun.lock); сборку и prisma гоняем на node.
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl && npm install -g bun
WORKDIR /app

# Сначала манифесты — слой с зависимостями кешируется между сборками
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Prisma-клиент + движки под текущую платформу (linux-musl)
COPY prisma ./prisma
RUN node ./node_modules/.bin/prisma generate

# Исходники и standalone-сборка
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN node ./node_modules/.bin/next build

# ---------- Этап 2: runtime ----------
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data

# Standalone-сервер (внутри — урезанный node_modules из trace-анализа Next,
# включая .prisma-клиент, @prisma/client, sharp)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Страховка поверх trace: нативные модули исторически выпадают из standalone
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/node_modules/@img ./node_modules/@img
COPY --from=builder /app/node_modules/sharp ./node_modules/sharp

# Миграции и entrypoint (схему БД применяет docker/migrate.cjs — без prisma CLI)
COPY --from=builder /app/prisma/migrations ./prisma/migrations
COPY docker/entrypoint.sh docker/migrate.cjs ./docker/
# Windows CRLF в entrypoint → exec format error в Linux; нормализуем при сборке
RUN sed -i 's/\r$//' ./docker/entrypoint.sh \
    && chmod +x ./docker/entrypoint.sh \
    && rm -f .env .env.local .env.production \
    && mkdir -p /data && chown -R node:node /data

USER node
VOLUME /data
EXPOSE 3000

# /api/health публичный и проверяет БД — годится для Docker/orchestrator-проб
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/health" || exit 1

ENTRYPOINT ["sh", "./docker/entrypoint.sh"]
