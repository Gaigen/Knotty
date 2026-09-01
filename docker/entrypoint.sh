#!/bin/sh
# Entrypoint контейнера Knotty.
# Подготавливает /data (volume), AUTH_SECRET, схему БД и запускает сервер.
set -eu

DATA_DIR="${DATA_DIR:-/data}"
PORT="${PORT:-3000}"

# --- Пути: БД и вложения живут в volume, чтобы переживать обновления ---
export DATABASE_URL="${DATABASE_URL:-file:$DATA_DIR/custom.db}"
export UPLOADS_DIR="${UPLOADS_DIR:-$DATA_DIR/uploads}"

mkdir -p "$DATA_DIR" "$UPLOADS_DIR"

# --- AUTH_SECRET: env (если задан) > сохранённый в volume > сгенерировать ---
# Секрет пишется в volume один раз — сессии выживают перезапуски и обновления.
if [ -z "${AUTH_SECRET:-}" ] || [ "$(expr length "${AUTH_SECRET:-x}")" -lt 16 ]; then
  SECRET_FILE="$DATA_DIR/auth_secret"
  if [ ! -s "$SECRET_FILE" ]; then
    echo "[knotty] Генерирую AUTH_SECRET → $SECRET_FILE"
    node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" > "$SECRET_FILE" \
      || openssl rand -base64 32 > "$SECRET_FILE"
    chmod 600 "$SECRET_FILE" || true
  fi
  AUTH_SECRET="$(cat "$SECRET_FILE")"
  export AUTH_SECRET
fi

# --- Схема БД: идемпотентно (первый старт — создаст, обновление образа — накатит новые миграции) ---
echo "[knotty] БД: $DATABASE_URL"
echo "[knotty] Применяю миграции…"
node ./docker/migrate.cjs

echo "[knotty] Запуск: http://0.0.0.0:$PORT  (данные: $DATA_DIR)"
exec node server.js
