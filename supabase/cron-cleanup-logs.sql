-- 古いログの掃除(Issue #199・#216)の定期実行: pg_cronのセットアップ。
--
-- schema.sqlと違い、これは main へのマージでは自動適用されない
-- (db-deploy.ymlはschema.sqlのみを対象にしている)。SupabaseのSQL Editorで
-- 手動で1回実行すること。手順の全体像は docs/log-retention.md を参照。
--
-- 前提: schema.sql が本番へ適用済みで、関数 cleanup_old_logs() が存在すること。
-- cron.schedule は schema.sql に入れていない(pg_cron の無い環境で schema.sql 全体が
-- 失敗しないように、また本番の定期ジョブを自動適用で書き換えないため)。
--
-- 登録しないと古い行は消えず、client_errors は総行数の上限(20,000行)に達した時点で
-- 新しい記録が入らなくなる(schema.sql の client_errors_enforce_cap)。

create extension if not exists pg_cron;

-- 既存のジョブがあれば一旦消してから登録し直す(冪等に再実行できるように)。
select cron.unschedule('cleanup-old-logs') where exists (
  select 1 from cron.job where jobname = 'cleanup-old-logs'
);

-- 毎日 03:40 JST(= 18:40 UTC。pg_cronはUTC)に実行する。空グループの掃除(03:30 JST)とずらしてある。
select cron.schedule(
  'cleanup-old-logs',
  '40 18 * * *',
  $$ select public.cleanup_old_logs(); $$
);
