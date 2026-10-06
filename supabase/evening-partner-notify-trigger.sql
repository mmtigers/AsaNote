-- パートナーへの「今夜の記録を追加しました」Push通知: evening_records のトリガーのセットアップ。
--
-- cron-evening-reminders.sql と同様、service role キーを埋め込むため main へのマージでは
-- 自動適用されない(schema.sql のみが対象)。SupabaseのSQL Editorで手動で1回実行すること。
-- 手順の全体像は docs/push-notifications-setup.md を参照。
--
-- 実行前に、下記の <PROJECT_REF> と <SERVICE_ROLE_KEY> を実際の値へ置き換えること
-- (置き換えた実値はリポジトリに残さない)。
--
-- あさノートの partner-notify-trigger.sql(records 用)とは別名・別の表のトリガー。
-- 発火条件は「outcome入りの記録が新規にできた時」だけ:
--   - INSERT でoutcomeが入っている
--   - UPDATE でoutcomeがnullから値に変わった
-- 既にoutcomeがある記録の編集・同期の再送(upsert)では発火しない。

create extension if not exists pg_net;

create or replace function evening_notify_partner_on_new_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 通知の失敗(pg_net側の問題など)で記録の保存自体を巻き戻さない。
  begin
    perform net.http_post(
      url := 'https://<PROJECT_REF>.supabase.co/functions/v1/notify-evening-partner',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
      ),
      body := jsonb_build_object('user_id', new.user_id, 'record_id', new.id)
    );
  exception when others then
    raise warning 'evening_notify_partner_on_new_record failed: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trg_evening_notify_partner_on_insert on evening_records;
create trigger trg_evening_notify_partner_on_insert
  after insert on evening_records
  for each row
  when (new.outcome is not null)
  execute function evening_notify_partner_on_new_record();

drop trigger if exists trg_evening_notify_partner_on_outcome_set on evening_records;
create trigger trg_evening_notify_partner_on_outcome_set
  after update of outcome on evening_records
  for each row
  when (old.outcome is null and new.outcome is not null)
  execute function evening_notify_partner_on_new_record();
