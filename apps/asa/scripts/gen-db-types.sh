#!/usr/bin/env bash
# supabase/schema.sqlの変更をsrc/lib/db/database.types.tsへ反映する。
# Dockerでコンテナ内Postgresを一時的に起動し、supabase gen types typescript
# (要: Docker Desktop等でDockerが利用可能なこと)で型を再生成する。
# CIの db-types-check ジョブ(.github/workflows/ci.yml)も同じ手順で
# ズレを検出する。
set -euo pipefail

cd "$(dirname "$0")/.."
# supabase/(schema.sql・CI用スタブ)はモノレポのルート直下にある(あさノートの正)。
SUPABASE_DIR="../../supabase"

CONTAINER_NAME="gotoschool-db-types-gen"
PORT=54329
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

psql "$DB_URL" -f "$SUPABASE_DIR/ci/auth-stub.sql"
psql "$DB_URL" -f "$SUPABASE_DIR/schema.sql"

npx supabase gen types typescript --db-url "$DB_URL" > src/lib/db/database.types.ts

echo "src/lib/db/database.types.ts を更新しました。"
