#!/usr/bin/env bash
# supabase/schema.sql の変更を src/lib/db/database.types.ts へ反映する。
# Docker でコンテナ内 Postgres を一時的に起動し、supabase gen types typescript(要 Docker)で
# 型を再生成する。CI の db-types-check ジョブ(.github/workflows/ci.yml)も同じ手順でズレを検出する。
#
# schema.sql は共通表(groups / group_members / children)と auth / storage に依存するため、
# それらの最小スタブ(supabase/ci/*.sql)を先に適用する。共通表の定義の正はあさノート側(docs/SPEC.md §7)。
set -euo pipefail

cd "$(dirname "$0")/.."

CONTAINER_NAME="yorunote-db-types-gen"
PORT=54330
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
until docker exec "$CONTAINER_NAME" pg_isready -U postgres >/dev/null 2>&1; do
  sleep 1
done

psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/ci/auth-stub.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/ci/shared-tables-stub.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/schema.sql

npx supabase gen types typescript --db-url "$DB_URL" > src/lib/db/database.types.ts

echo "src/lib/db/database.types.ts を更新しました。"
