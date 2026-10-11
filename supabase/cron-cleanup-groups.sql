-- 空グループと期限切れ・未使用の招待コードの掃除(Issue #128)の定期実行: pg_cronのセットアップ。
--
-- schema.sqlと違い、これは main へのマージでは自動適用されない
-- (db-deploy.ymlはschema.sqlのみを対象にしている)。SupabaseのSQL Editorで
-- 手動で1回実行すること。手順の全体像は docs/group-cleanup.md を参照。
--
-- 前提: schema.sql が本番へ適用済みで、関数 cleanup_empty_groups_and_invites() が存在すること。
-- cron.schedule は schema.sql に入れていない(pg_cron の無い環境で schema.sql 全体が
-- 失敗しないように、また本番の定期ジョブを自動適用で書き換えないため)。

create extension if not exists pg_cron;

-- 既存のジョブがあれば一旦消してから登録し直す(冪等に再実行できるように)。
select cron.unschedule('cleanup-empty-groups') where exists (
  select 1 from cron.job where jobname = 'cleanup-empty-groups'
);

-- 毎日 03:30 JST(= 18:30 UTC。pg_cronはUTC)に実行する。
select cron.schedule(
  'cleanup-empty-groups',
  '30 18 * * *',
  $$ select public.cleanup_empty_groups_and_invites(); $$
);
