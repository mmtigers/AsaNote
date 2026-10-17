#!/usr/bin/env bash
# supabase/schema.sql の変更を src/lib/db/database.types.ts へ反映する(よるノートの scripts/gen-db-types.sh と同じ方式)。
#   npm run db:types
# Docker で Postgres 16 を一時的に起動し、スタブと schema.sql を適用してから、supabase gen types typescript(要 Docker)で
# 型を再生成する。CI の型ずれの検査(_db-types-check.yml)も、同じ SQL を同じ順で適用して比べる。
set -euo pipefail

cd "$(dirname "$0")/.."

CONTAINER_NAME="oyanote-db-types-gen"
PORT=54333
DB_URL="postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres"

cleanup() {
  docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run -d --rm --name "$CONTAINER_NAME" \
  -e POSTGRES_PASSWORD=postgres \
  -p "${PORT}:5432" \
  postgres:16 >/dev/null

echo "Postgresの起動を待っています..."
# コンテナの初期化中は一時的なサーバーが動くため、pg_isready だけでは早すぎることがある。TCP で実際に繋がるまで待つ。
until psql "$DB_URL" -c "select 1" >/dev/null 2>&1; do
  sleep 1
done

psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f supabase/ci/supabase-stub.sql
psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f supabase/schema.sql
psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f supabase/schema.sql

# 版は CI(_db-types-check.yml の setup-cli)と同じものに固定する(違う版だと出力の形が変わり、型ずれと判定される)。
npx -y supabase@2.117.0 gen types typescript --db-url "$DB_URL" > src/lib/db/database.types.ts

echo "src/lib/db/database.types.ts を更新しました。"
