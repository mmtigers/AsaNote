# 空グループ・期限切れ招待コードの掃除(Issue #128)

最後のメンバーが脱退しても `groups` 行と有効期限内の招待コードが残るため、DB関数
`cleanup_empty_groups_and_invites()` で定期的に消す。

## 何を消すか

| 対象 | 条件 |
| --- | --- |
| `group_invites` | `used_at is null` かつ `expires_at < now()`(期限切れで未使用)。使用済みの履歴は消さない |
| `groups` | `group_members` に1行も無いグループ(空グループ) |

空グループを消すと、`on delete cascade` により、そのグループの `group_invites`(使用済みの履歴を含む)も
一緒に消える。メンバーのいるグループには一切触れない。

## 消して安全な根拠(外部キーの確認)

`supabase/schema.sql`・`apps/yoru/supabase/schema.sql` の外部キーを全て確認した。`groups(id)` を参照するのは次の2つだけ。

- `group_members.group_id` → `on delete cascade`(空グループなので消える行は0件)
- `group_invites.group_id` → `on delete cascade`(そのグループの招待コードだけが消える)

`records` / `children` / `notification_settings` / `push_subscriptions` / `analytics_events` や、よるノートの
表に `group_id` 列は無い。記録は `user_id`、子どもは `created_by` で所有されるため、グループを消しても
記録・子ども・通知設定が消えたり孤立したりしない。

## 実行権限

`public` / `anon` / `authenticated` からは `revoke` 済み。実行できるのは `service_role` と、
pg_cron(`postgres`)だけ。

## 本番での登録手順(手動・1回だけ)

`cron.schedule` は schema.sql に入れていない(main へのマージで自動適用されないため、**本番で手動の登録が要る**)。

1. schema.sql が本番へ適用された(db-deploy が成功した)ことを確認する。
2. Supabase の SQL Editor で `supabase/cron-cleanup-groups.sql` を実行する(毎日 03:30 JST。冪等)。
3. 登録の確認: `select jobname, schedule, active from cron.job where jobname = 'cleanup-empty-groups';`
4. すぐ試す(初回は件数を確認してから):
   - 対象の確認: `select g.id from groups g where not exists (select 1 from group_members gm where gm.group_id = g.id);`
   - 実行: `select * from cleanup_empty_groups_and_invites();`(`deleted_invites` / `deleted_groups` が返る)
5. 実行履歴: `select status, return_message, start_time from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'cleanup-empty-groups') order by start_time desc limit 5;`

止めるとき: `select cron.unschedule('cleanup-empty-groups');`
