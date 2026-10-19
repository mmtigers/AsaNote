-- #173: よるノート公開後の確認用(読み取り専用)。本番の SQL Editor で、各ブロックを順に実行する。
-- 結果にはユーザーIDが出る。スクリーンショットや Issue への貼り付けでは、件数だけを書くこと。

-- (1) 通知の購読端末。期待: パートナーを含めて、よるノートは 2 行(2台)
select count(*) as evening_subscriptions, count(distinct user_id) as users from evening_push_subscriptions;

-- (2) あさノートのログアウト確認。ログアウト後は、その端末の行が消える(件数が 1 減る)
select count(*) as asa_subscriptions, count(distinct user_id) as users from push_subscriptions;

-- (3) リマインドの取り戻し(#130 / #190)。リマインドが届いた日に、1ユーザー1日1行が入る
select sent_on, count(*) as users from reminder_deliveries group by sent_on order by sent_on desc limit 7;

-- (4) 通知設定(期待: 設定時刻が 20 時台、有効)
select reminder_time, enabled from evening_notification_settings order by updated_at desc;

-- (5) cron の登録と直近の実行(4つ: send-reminders / send-evening-reminders / cleanup-old-logs / cleanup-empty-groups)
select jobname, schedule, active from cron.job order by jobname;
select j.jobname, d.status, d.start_time
from cron.job_run_details d join cron.job j using (jobid)
order by d.start_time desc limit 10;

-- (6) 空グループ(#128 / #186)。期待: 0 件(cron が掃除する)。手動で cron-cleanup-groups.sql を流す必要は無い
-- 詳細な select は docs/group-cleanup.md を参照
