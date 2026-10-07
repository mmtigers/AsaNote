-- 夜のリマインドPush通知: pg_cronのセットアップ。
--
-- schema.sql と違い、これは main へのマージでは自動適用されない。
-- SupabaseのSQL Editorで手動で1回実行すること。手順の全体像は docs/push-notifications-setup.md を参照。
--
-- 実行前に、下記3箇所をプロジェクト固有の値へ置き換えること:
--   1. <PROJECT_REF>      : SupabaseプロジェクトのRef ID
--   2. <SERVICE_ROLE_KEY> : プロジェクト設定 > API の service_role キー(Supabase の入口の JWT 検証を通すため)
--   3. <CRON_SECRET>      : `supabase secrets set EVENING_CRON_SECRET=...` で設定した値と同じもの
--      (あさノートの CRON_SECRET とは別の値)
--      2・3 は公開してはいけない値。実行後はこのファイルに実際の値を残さないこと
--
-- あさノートのジョブ(send-reminders)とは別名で登録する。同じジョブ名にすると上書きしてしまう。

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 既存のジョブがあれば一旦消してから登録し直す(冪等に再実行できるように)。
select cron.unschedule('send-evening-reminders') where exists (
  select 1 from cron.job where jobname = 'send-evening-reminders'
);

-- 毎分実行し、Edge Function側でリマインド時刻(分単位)が一致するユーザーだけに絞る。
select cron.schedule(
  'send-evening-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-evening-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);
