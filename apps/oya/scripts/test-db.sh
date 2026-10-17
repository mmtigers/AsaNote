#!/usr/bin/env bash
# おやノートの DB(supabase/schema.sql)の権限(RLS・RPC)のテストを、素の Postgres で実行する。
#   npm run test:db
# DB_URL を渡すと、その(空の)DB に対して実行する(CI はサービスコンテナの Postgres を渡す)。
# 渡さなければ、Docker で Postgres 16 を一時的に起動して実行する(要 Docker)。
#
# 適用する順: スタブ(auth・storage・ロール) → schema.sql を2回(何度流しても同じ結果になることの確認) → テスト。
# テストは1つのトランザクションで実行して rollback するので、DB に何も残さない。
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -z "${DB_URL:-}" ]; then
  CONTAINER_NAME="oyanote-db-test"
  PORT=54332
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
fi

psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f supabase/ci/supabase-stub.sql
psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f supabase/schema.sql
psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f supabase/schema.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.test.sql
