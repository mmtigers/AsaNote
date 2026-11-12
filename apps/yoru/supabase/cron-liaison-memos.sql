-- 連絡メモの下書き(apps/yoru/docs/liaison-memo.md): pg_cron のセットアップ。
--
-- schema.sql と違い、これは main へのマージでは自動適用されない。
-- Supabase の SQL Editor で手動で1回実行すること。手順は docs/push-notifications-setup.md の「連絡メモの下書き」を参照。
--
-- 実行前に、下記3箇所をプロジェクト固有の値へ置き換えること:
--   1. <PROJECT_REF>      : Supabase プロジェクトの Ref ID
--   2. <SERVICE_ROLE_KEY> : プロジェクト設定 > API の service_role キー(Supabase の入口の JWT 検証を通すため)
--   3. <CRON_SECRET>      : `supabase secrets set EVENING_CRON_SECRET=...` で設定した値と同じもの
--      (夜のリマインドの cron-evening-reminders.sql と同じ値)
--      2・3 は公開してはいけない値。実行後はこのファイルに実際の値を残さないこと
--
-- 設定の時刻は1時間きざみで、関数は「予定の時刻から3時間以内」を拾うので、10分ごとで足りる(毎分は要らない)。

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 既存のジョブがあれば一旦消してから登録し直す(冪等に再実行できるように)。
select cron.unschedule('generate-liaison-memos') where exists (
  select 1 from cron.job where jobname = 'generate-liaison-memos'
);

select cron.schedule(
  'generate-liaison-memos',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/generate-liaison-memos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb,
    -- AI の呼び出しを待つので、既定(5秒)より長くする。
    timeout_milliseconds := 120000
  );
  $$
);
