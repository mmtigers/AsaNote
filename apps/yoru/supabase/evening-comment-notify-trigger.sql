-- パートナーへの「コメントしました」Push通知: evening_record_comments のトリガーのセットアップ。
--
-- evening-partner-notify-trigger.sql と同様、service role キーを埋め込むため main へのマージでは
-- 自動適用されない(schema.sql のみが対象)。SupabaseのSQL Editorで手動で1回実行すること。
-- 手順の全体像は docs/push-notifications-setup.md を参照。
--
-- 実行前に、下記の <PROJECT_REF>・<SERVICE_ROLE_KEY>・<NOTIFY_SECRET> を実際の値へ置き換えること
-- (置き換えた実値はリポジトリに残さない)。
--   <SERVICE_ROLE_KEY> : Supabase の入口の JWT 検証を通すため
--   <NOTIFY_SECRET>    : `supabase secrets set EVENING_NOTIFY_SECRET=...` で設定した値と同じもの
--                        (evening-partner-notify-trigger.sql と同じ値。notify-evening-comment も
--                        notify-evening-partner と同じ EVENING_NOTIFY_SECRET を使う)
--
-- 発火条件は「コメントが新規にできた時(INSERT)」だけ。コメントの編集(UPDATE)・削除では発火しない。

create extension if not exists pg_net;

create or replace function evening_notify_partner_on_new_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 通知の失敗(pg_net側の問題など)でコメントの保存自体を巻き戻さない。
  begin
    perform net.http_post(
      url := 'https://<PROJECT_REF>.supabase.co/functions/v1/notify-evening-comment',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
        'x-notify-secret', '<NOTIFY_SECRET>'
      ),
      body := jsonb_build_object('user_id', new.user_id, 'record_id', new.record_id)
    );
  exception when others then
    raise warning 'evening_notify_partner_on_new_comment failed: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trg_evening_notify_partner_on_comment_insert on evening_record_comments;
create trigger trg_evening_notify_partner_on_comment_insert
  after insert on evening_record_comments
  for each row
  execute function evening_notify_partner_on_new_comment();
