#!/usr/bin/env bash
# supabase/schema.sql の変更を src/lib/db/database.types.ts へ反映する。
# Docker でコンテナ内 Postgres を一時的に起動し、supabase gen types typescript(要 Docker)で型を再生成する。
# CI の db-types-check ジョブ(.github/workflows/ci-sakuhin.yml)も同じ順で適用して、ずれを検出する。
#
# 適用する順: スタブ(auth・storage・ロール) → 共通表の正(ルートの supabase/schema.sql) → さくひんノートの schema.sql。
# 共通表(children など)もあさノートの定義そのものを使うので、共通表の列が変わると、ここの型も変わる。
set -euo pipefail

cd "$(dirname "$0")/.."

CONTAINER_NAME="sakuhinnote-db-types-gen"
PORT=54334
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
until psql "$DB_URL" -c "select 1" >/dev/null 2>&1; do
  sleep 1
done

psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f supabase/ci/supabase-stub.sql
psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f ../../supabase/schema.sql
psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f supabase/schema.sql

npx supabase gen types typescript --db-url "$DB_URL" > src/lib/db/database.types.ts

echo "src/lib/db/database.types.ts を更新しました。"
