-- 未入力日のリマインドPush通知(#3-2): pg_cronのセットアップ。
--
-- schema.sqlと違い、これは main へのマージでは自動適用されない
-- (db-deploy.ymlはschema.sqlのみを対象にしている)。SupabaseのSQL Editorで
-- 手動で1回実行すること。手順の全体像は docs/push-notifications-setup.md を参照。
--
-- 実行前に、下記2箇所をプロジェクト固有の値へ置き換えること:
--   1. <PROJECT_REF>                 : SupabaseプロジェクトのRef ID
--   2. <SERVICE_ROLE_KEY>            : プロジェクト設定 > API の service_role キー
--      (公開してはいけない値。SQL Editorから実行した後はこのファイルの実際の値を
--       残さないこと。Vaultに保存して参照する方式に変えたい場合は
--       supabase.com/docs/guides/database/vault を参照)

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 既存のジョブがあれば一旦消してから登録し直す(冪等に再実行できるように)。
select cron.unschedule('send-reminders') where exists (
  select 1 from cron.job where jobname = 'send-reminders'
);

-- 毎分実行し、Edge Function側でリマインド時刻(分単位)が一致するユーザーだけに絞る。
select cron.schedule(
  'send-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);
