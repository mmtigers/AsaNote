# 古いログの掃除と、client_errors の上限(Issue #199・#216)

`client_errors`(ブラウザ側エラーの記録)と `reminder_deliveries`(リマインドの送信済み記録)は、
放っておくと行が増え続ける。DB関数 `cleanup_old_logs()` で定期的に消す。あわせて、`client_errors` は
anon(未ログイン)からも insert できるため、総行数に上限を設けている。

## 保管期間(決定事項)

| 表 | 保管期間 | 理由 |
| --- | --- | --- |
| `client_errors` | **90日** | 原因調査に使う。古い障害の記録は、追う価値が薄い |
| `reminder_deliveries` | **7日**(JSTの日付基準) | `send-reminders` が使うのは当日の行だけ。残りは調査用 |
| `analytics_events` | **自動では消さない** | 計測データの扱い(集計にどこまで過去を使うか)が未決定。決まったら `cleanup_old_logs()` に足す |

保管期間を変えるときは `supabase/schema.sql` の `cleanup_old_logs()`(`interval '90 days'` / `- 7`)を直す。

## 総行数の上限(濫用対策)

anon キーは公開値なので、第三者が REST で `client_errors` へ連投できる。1行の大きさは check 制約で
縛っている(message 1000字・stack 8000字・context 2000字など)が、件数は縛れなかったため、
`BEFORE INSERT` トリガー `client_errors_enforce_cap` で**総行数 20,000 行**を上限にした。

- 上限に達すると insert は失敗する(`54000 client_errors is full`)。クライアントは fire-and-forget のため、画面には影響せず、ログが入らなくなるだけ。
- 掃除の cron を登録していないと、いずれ上限に達する。**登録は手動**(下)。
- 上限は余裕を見た値(1行はほぼ1KB前後、最大でも約10KB)。変えるときは `client_errors_enforce_cap()` の `20000` を直す。
- 限界: 上限までは誰でも入れられる。上限に達している間は、本物のエラーも入らない。厳密なレート制限(Supabase 側)は別途の検討事項。

## 確認用のビュー

`client_errors_summary_7d`(直近7日を、画面・種類・文言ごとに集計)。`analytics_*` ビューと同じく
anon / authenticated へは grant しない。SQL Editor から読む。

```sql
select * from client_errors_summary_7d;
select count(*) from client_errors;   -- 上限(20,000)までの残りを見る
```

## 本番での登録手順(手動・1回だけ)

`cron.schedule` は schema.sql に入れていない(main へのマージで自動適用されないため、**本番で手動の登録が要る**)。

1. schema.sql が本番へ適用された(db-deploy が成功した)ことを確認する。
2. Supabase の SQL Editor で `supabase/cron-cleanup-logs.sql` を実行する(毎日 03:40 JST。冪等)。
3. 登録の確認: `select jobname, schedule, active from cron.job where jobname = 'cleanup-old-logs';`
4. すぐ試す(初回は件数を確認してから):
   - 対象の確認: `select count(*) from client_errors where created_at < now() - interval '90 days';`
   - 実行: `select * from cleanup_old_logs();`(`deleted_client_errors` / `deleted_reminder_deliveries` が返る)
5. 実行履歴: `select status, return_message, start_time from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'cleanup-old-logs') order by start_time desc limit 5;`

止めるとき: `select cron.unschedule('cleanup-old-logs');`

## 実行権限

`public` / `anon` / `authenticated` からは `revoke` 済み。実行できるのは `service_role` と、
pg_cron(`postgres`)だけ。
