-- パートナーへの「きろくを追加しました」Push通知: recordsのトリガーのセットアップ。
--
-- cron-reminders.sqlと同様、service roleキーを埋め込むため main へのマージでは自動適用されない
-- (db-deploy.ymlはschema.sqlのみ対象)。SupabaseのSQL Editorで手動で1回実行すること。
-- 手順の全体像は docs/push-notifications-setup.md を参照。
--
-- 実行前に、下記の3つを実際の値へ置き換えること(置き換えた実値はリポジトリに残さない):
--   1. <PROJECT_REF>        : SupabaseプロジェクトのRef ID
--   2. <SERVICE_ROLE_KEY>   : プロジェクト設定 > API の service_role キー(legacy)。Supabase の入口の JWT 検証を
--      通すためだけに送る(関数は、この値との一致を確かめない)
--   3. <NOTIFY_SECRET>      : `supabase secrets set PARTNER_NOTIFY_SECRET=...` で関数側に設定した合言葉と同じ値
--      (16文字以上。`openssl rand -hex 32` などで作る。send-reminders の CRON_SECRET とは別の値にする)
--
-- 発火条件は「outcome入りの記録が新規にできた時」だけ:
--   - INSERT でoutcomeが入っている
--   - UPDATE でoutcomeがnullから値に変わった
-- 既にoutcomeがある記録の編集・同期の再送(upsert)では発火しない。

create extension if not exists pg_net;

create or replace function notify_partner_on_new_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 通知の失敗(pg_net側の問題など)で記録の保存自体を巻き戻さない。
  begin
    perform net.http_post(
      url := 'https://<PROJECT_REF>.supabase.co/functions/v1/notify-partner',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
        'x-notify-secret', '<NOTIFY_SECRET>'
      ),
      body := jsonb_build_object('user_id', new.user_id, 'record_id', new.id)
    );
  exception when others then
    raise warning 'notify_partner_on_new_record failed: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trg_notify_partner_on_insert on records;
create trigger trg_notify_partner_on_insert
  after insert on records
  for each row
  when (new.outcome is not null)
  execute function notify_partner_on_new_record();

drop trigger if exists trg_notify_partner_on_outcome_set on records;
create trigger trg_notify_partner_on_outcome_set
  after update of outcome on records
  for each row
  when (old.outcome is null and new.outcome is not null)
  execute function notify_partner_on_new_record();
