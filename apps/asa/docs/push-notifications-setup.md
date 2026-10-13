# 未入力日のリマインドPush通知(#3-2) デプロイ手順

アプリ内リマインダー(`RecordReminderNotice`、正午以降に開いたときだけ表示)とは別に、
指定した時刻(既定21:00、`/group`画面で変更可)にその日まだ記録が無ければ、
アプリを閉じていてもプッシュ通知で知らせる機能。

`supabase/schema.sql`(`push_subscriptions` / `notification_settings` テーブル)は
`main`へのマージ時に`db-deploy.yml`が自動適用するが、以下は自動化の対象外なので
このドキュメントの手順で手動デプロイすること。

## 1. VAPID鍵を用意する

Web Push の送信元を識別する鍵ペア。**プロジェクトごとに1組だけ**でよい
(端末ごと・ユーザーごとに新しく作る必要はない)。

```bash
npx web-push generate-vapid-keys
```

- **公開鍵**: クライアント(ブラウザ)に渡る値。秘密情報ではない。
- **秘密鍵**: サーバー(Edge Function)側だけが使う。**絶対にリポジトリへコミットしない。**

## 2. 公開鍵をNext.jsのビルド環境変数に設定する

ホスティング先(Vercel等)の環境変数に追加する。ローカル開発では`.env.local`
(`.env.local.example`を参照)。

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<1で生成した公開鍵>
```

## 3. Supabase CLIでプロジェクトをリンクする(初回のみ)

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
```

## 4. Edge Functionのシークレットを設定する

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` はSupabaseが全Edge Functionへ自動で
注入するため、ここで設定するのは以下の4つだけ。

```bash
npx supabase secrets set \
  VAPID_PUBLIC_KEY=<1で生成した公開鍵> \
  VAPID_PRIVATE_KEY=<1で生成した秘密鍵> \
  VAPID_SUBJECT=mailto:<連絡先メールアドレス> \
  CRON_SECRET=<16文字以上のランダムな文字列(例: openssl rand -hex 32 の出力)>
```

`CRON_SECRET` は、手順6で cron に渡す値と**同じもの**にする(cron からの呼び出しだけを通すための合言葉)。
公開しない。ターミナルに表示した値は、手順6のSQLへ貼ったあと、`clear` で画面から消す。

## 5. Edge Functionをデプロイする

```bash
npx supabase functions deploy send-reminders
```

デプロイ後、`https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders` に
`Authorization: Bearer <service_role key>` を付けてPOSTすると動作確認できる
(未入力ユーザーがいなければ `{"checked":0,"sent":0}` 等を返す)。

`send-reminders` は、`x-cron-secret` ヘッダが、手順4で設定した `CRON_SECRET` と一致する呼び出しだけを
受け付ける(それ以外は `401 unauthorized`。`CRON_SECRET` が未設定なら `500`)。Supabase の JWT 検証は
公開されている anon キーでも通ってしまうため、関数の側で、cron 専用の合言葉を確かめている。

> `SUPABASE_SERVICE_ROLE_KEY` との一致は、使わない。この変数は非推奨(JWT Signing Keys への移行後)で、
> 関数の中の値が、ダッシュボードの `service_role` の鍵と同じとは限らず、正しい鍵でも弾いてしまった。

**初回の切り替え順(止まらない順番)**: ①手順4で `CRON_SECRET` を設定 → ②手順6の SQL で、cron に
`x-cron-secret` ヘッダを足す(古い関数はこのヘッダを無視するので、この時点では動き続ける)→ ③関数を
デプロイ(この手順)。デプロイ後は、cron からの呼び出しが `200` で通っていることを確認する。
SQL Editor で:

```sql
select status_code, content, created from net._http_response order by created desc limit 5;
```

`401`(`unauthorized`)が並ぶなら、cron の合言葉と、関数の `CRON_SECRET` が違う。手順6を、同じ値で登録し直す。

## 5.5 依存の版と、再デプロイ

Edge Function が `npm:` で取り込む依存(`@supabase/supabase-js`・`web-push`)は、版を固定している(例:
`npm:@supabase/supabase-js@2.117.3`)。`@2` のような範囲指定だと、デプロイのたびに最新を取り込み、手元でテストした版と
違うものが本番の通知で動きうるため。`supabase/functions/_shared/npmPins.test.ts` が、あさノート・よるノートの4つの
`index.ts` で、固定されていて、同じパッケージは同じ版であることを検査する。

- 版を上げるときは、**4つの `index.ts` を同時に**直し(あさノート2・よるノート2)、4つとも再デプロイする。
- **関数のコードを変えても、再デプロイするまで本番には反映されない**(自動では反映されない)。処理の本体は
  `_shared/` のハンドラ(`reminderHandler.ts`・`partnerHandler.ts`)に分けてあり、テストがある(#204)。
  変更したら `npx supabase functions deploy send-reminders` と `notify-partner` を行う。

## 6. pg_cronで定期実行する

Supabaseダッシュボードの SQL Editor で `supabase/cron-reminders.sql` を開き、
ファイル内の `<PROJECT_REF>`・`<SERVICE_ROLE_KEY>`・`<CRON_SECRET>` を実際の値に置き換えてから
実行する(このファイル自体は雛形なので、置き換えた実値はリポジトリに残さないこと)。

`pg_cron` / `pg_net` 拡張が無効な場合は、Database > Extensions から有効化してから
実行すること。

## 6.5 パートナーへの「きろくを追加しました」通知

リマインドに加え、パートナーがきろく(outcome入り)を新規に記入したとき、同じグループの
他メンバーのうち`/group`で「パートナーがきろくを追加したとき」をONにしている人へ通知する。
VAPID鍵・シークレット(手順1〜4)は共通。

**切り替えの順番**(上から順に行う):

1. 合言葉を作って、関数側に設定する。`send-reminders` の `CRON_SECRET` とは**別の値**にする。
   ```bash
   openssl rand -hex 32     # 出力された値を、手順3でも使う。公開しない
   npx supabase secrets set PARTNER_NOTIFY_SECRET=<上の値>
   ```
2. 関数をデプロイする。
   ```bash
   npx supabase functions deploy notify-partner
   ```
3. SQL Editorで`supabase/partner-notify-trigger.sql`の`<PROJECT_REF>`・`<SERVICE_ROLE_KEY>`・
   `<NOTIFY_SECRET>`(手順1の値)を置き換えて実行する(recordsにトリガーを作る。実値はコミットしない。
   実行後はタブを保存せずに閉じ、ターミナルは`clear`で消す)。

`notify-partner` は、`x-notify-secret` ヘッダが `PARTNER_NOTIFY_SECRET` と一致する呼び出しだけを受け付ける
(それ以外は`401`、未設定なら`500`)。`SUPABASE_SERVICE_ROLE_KEY` との一致は使わない
(`send-reminders` と同じ理由。手順5のデプロイ後の確認を参照)。`Authorization` ヘッダは、Supabase の入口の
JWT 検証を通すために残す。

通知文言の「〇〇さん」は記録した人のメールアドレスの@より前。

**通知を受け取る人**は、各自の端末で`/group`画面の通知をONにして購読し、「パートナーがきろくを追加したとき」
もONにする(既定はOFF)。受け取る人の端末の購読が無いと、届かない。

> **トリガーはmainへのマージでは自動適用されない。** 手順3を実行しないと、パートナー通知は一度も呼ばれない。
> 入っているかは、次で確認できる(2行出れば入っている)。
> ```sql
> select tgname from pg_trigger where tgrelid = 'public.records'::regclass and not tgisinternal;
> ```

## 7. 動作確認

1. `/group` 画面の「通知」セクションで通知をONにし、ブラウザの通知許可ダイアログで許可する。
2. `notification_settings` テーブルにログイン中ユーザーの行(`enabled = true`)が、
   `push_subscriptions` テーブルにこの端末の購読が、それぞれ作成されていることを確認する。
3. `reminder_time` を数分後の時刻に変更し、その時刻になっても当日の記録(outcome入り)を
   作らずに待つ。通知が届けば成功。
4. (パートナー通知)2つのアカウントを同じグループに入れ、片方で「パートナーがきろくを追加したとき」を
   ONにしてもう片方で記録を保存する。「〇〇さんがきろくを追加しました」が届けば成功。
   同じ記録を編集して保存し直しても届かないこと。
5. 通知をタップしてアプリが開く(既に開いていれば前面に出る)ことを確認する。

## トラブルシューティング

- 通知が届かない場合、まずEdge Functionのログを確認する。Supabaseダッシュボードの
  Edge Functions > `send-reminders` > Logs で見られる(Supabase CLIに`functions logs`
  コマンドは無い)。
- pg_cronやトリガーからの呼び出し結果は、SQL Editorで`select status_code, content, created from net._http_response order by created desc limit 5;`
  を実行すると確認できる(200なら正常、401は合言葉(`CRON_SECRET` / `PARTNER_NOTIFY_SECRET`)の不一致、404はPROJECT_REFの誤り)。
  このテーブルの記録は、既定で数時間(6時間ほど)で消えるので、確認は、呼び出しの直後に行う。
- **cronの失敗検知(リマインド)**: `send-reminders` は設定時刻から15分以内なら取り戻すため、1〜数分の欠落は
  自動で補われる。それでも届かない日は、SQL Editorで次を実行して原因を切り分ける(自動の監視・アラートは入れていない)。
  ```sql
  -- 直近の呼び出し結果(200以外。status_codeがnullならタイムアウト/接続失敗)
  select status_code, error_msg, timed_out, created from net._http_response
  where status_code is distinct from 200 order by created desc limit 20;
  -- cron自体の実行結果(failedが並ぶならジョブ側の問題)
  select status, return_message, start_time from cron.job_run_details
  where jobid = (select jobid from cron.job where jobname = 'send-reminders')
  order by start_time desc limit 20;
  -- 今日の送信済み記録(行が無ければ、まだ送っていないか、記録済みで対象外)
  select * from reminder_deliveries where sent_on = (now() at time zone 'Asia/Tokyo')::date;
  ```
  `net._http_response` は数時間で消えるため、気づいたらすぐ確認する。`reminder_deliveries` は `schema.sql` の
  自動適用に含まれるが、**関数の再デプロイは手動**(`npx supabase functions deploy send-reminders`)。
- 500で、ログに`Vapid public key must be a URL safe Base 64 (without "=")`と出る場合は、
  `VAPID_PUBLIC_KEY`の値が不正(末尾の`=`・引用符・空白の混入、秘密鍵との取り違え)。
  `npx supabase secrets set VAPID_PUBLIC_KEY=...`で入れ直す。Vercelの
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY`と同じ値にすること。
- `/group`で「通知機能が未設定です(NEXT_PUBLIC_VAPID_PUBLIC_KEY)」と出る場合は、Vercelの環境変数が
  未設定、または設定後に再デプロイしていない(`NEXT_PUBLIC_`の値はビルド時に埋め込まれる)。
  公開鍵は秘密情報ではないので、Vercelでは種別を「Config」にする。
- Windows(PowerShell)では、手順4の`secrets set`は`\`で改行せず1行で書く。`<...>`は
  「ここに値を入れる」という意味の印なので、実際の入力には含めない。
- `push_subscriptions`の行が消えている場合、ブラウザ側の購読が失効した(410/404)ために
  Edge Function側で自動削除された可能性が高い。もう一度「通知」をONにし直す。
- iOSでは、Push通知を受け取るにはホーム画面に追加したPWAとして開いている必要がある
  (Safariのタブとして開いているだけでは通知が届かない)。
