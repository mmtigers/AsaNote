# 夜のリマインドPush通知 デプロイ手順

指定した時刻(既定21:00、`/group` 画面の「通知」で変更可)に、今夜まだ記録が無ければ、
アプリを閉じていてもプッシュ通知で知らせる機能。家族のどなたか(同じグループ)が記録済みなら届かない。

`supabase/schema.sql` の `evening_push_subscriptions` / `evening_notification_settings` は
SQL Editor で `schema.sql` を実行すれば作られる。以下は手動デプロイが必要。

> **共有モード(あさノートと同じSupabaseプロジェクト)の注意**
> あさノートの `push_subscriptions` / `notification_settings` / `send-reminders` とは**別の表・別の関数・別のcronジョブ名**にしてある。
> 混ぜるとあさノートの朝の通知がよるノートへ届いたり、時刻が衝突したりするため。
> VAPID鍵とシークレットは**あさノートで設定済みのものをそのまま使える**(手順1・4は不要)。

## 1. VAPID鍵を用意する(あさノートで作成済みなら不要)

```bash
npx web-push generate-vapid-keys
```

公開鍵はブラウザに渡る値(秘密情報ではない)。秘密鍵は**絶対にコミットしない**。

## 2. 公開鍵をビルド環境変数に設定する

Vercel の環境変数(種別は「Config」)と `.env.local` に追加する。`NEXT_PUBLIC_` の値はビルド時に埋め込まれるため、設定後に再デプロイすること。

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<公開鍵>
```

## 3. Supabase CLIでリンクする(初回のみ)

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
```

> **コマンドを実行する場所に注意。** よるノートの関数は `apps/yoru/supabase/functions/` にある(あさノートの関数は、リポジトリのルートの `supabase/functions/`)。
> `supabase functions deploy` は、実行した場所の `supabase/functions/` を探すので、ルートで実行すると
> `Entrypoint path does not exist` で失敗する(何も反映されないので、やり直せばよい)。
> よるノートの関数は、**`apps/yoru` に移動して、`--project-ref <PROJECT_REF>` を付けて**デプロイする(`apps/yoru` には `supabase link` の設定が無いため)。
> `supabase secrets set` は、プロジェクト単位なので、どこで実行してもよい(`link` 済みの場所、または `--project-ref` 付き)。

## 4. Edge Functionのシークレットを設定する

```bash
# VAPID_*: あさノートで設定済みなら不要(同じプロジェクトで共有される)
npx supabase secrets set VAPID_PUBLIC_KEY=<公開鍵> VAPID_PRIVATE_KEY=<秘密鍵> VAPID_SUBJECT=mailto:<連絡先>

# 合言葉(必須。16文字以上のランダムな文字列。例: openssl rand -hex 32 の出力)
npx supabase secrets set EVENING_CRON_SECRET=<合言葉>
```

`EVENING_CRON_SECRET` は、手順6で cron に渡す値と**同じもの**にする(cron からの呼び出しだけを通すための合言葉)。
あさノートと同じ Supabase プロジェクトを共有するため、あさノートの `CRON_SECRET` とは**別の名前・別の値**にする。
公開しない。ターミナルに表示した値は、手順6のSQLへ貼ったあと、`clear` で画面から消す。

## 5. Edge Functionをデプロイする

```bash
cd apps/yoru
npx supabase functions deploy send-evening-reminders --project-ref <PROJECT_REF>
```

`send-evening-reminders` は、`x-cron-secret` ヘッダが、手順4で設定した `EVENING_CRON_SECRET` と一致する呼び出しだけを
受け付ける(それ以外は `401 unauthorized`。未設定なら `500`)。Supabase の JWT 検証は公開されている anon キーでも
通ってしまうため、関数の側で、cron 専用の合言葉を確かめている。`SUPABASE_SERVICE_ROLE_KEY` との一致は使わない
(非推奨の変数で、値がダッシュボードの鍵と同じとは限らず、あさノートでは、正しい鍵でも弾いてしまった)。

デプロイ後、手順6のあとに、cron からの呼び出しが `200` で通っていることを確認する(トラブルシューティング参照)。
匿名キーでの呼び出しが `401` になることも確かめる。

## 6. pg_cronで定期実行する

SQL Editor で `supabase/cron-evening-reminders.sql` の `<PROJECT_REF>`・`<SERVICE_ROLE_KEY>`・`<CRON_SECRET>` を置き換えて実行する
(`<CRON_SECRET>` は手順4の `EVENING_CRON_SECRET` と同じ値)。置き換えた実値はコミットしないこと。ジョブ名は `send-evening-reminders`(あさノートの `send-reminders` とは別)。

## 7. 動作確認

1. 「共有」タブの「通知」で夜のリマインド通知をONにし、通知を許可する。
2. `evening_notification_settings` に自分の行(`enabled = true`)、`evening_push_subscriptions` にこの端末の購読が作られていることを確認する。
3. 通知時刻を数分後にして、今夜の記録(様子を選んだもの)を作らずに待つ。通知が届けば成功。
4. 通知をタップしてアプリが開くことを確認する。

## 8. パートナーが記録したときの通知(任意)

家族(同じグループ)のどなたかが今夜の記録を追加したとき、通知をONにした人へ「〇〇さんが今夜の記録を追加しました」と届ける。
「共有」タブの「通知」にある「パートナーが記録したときの通知」を各自がONにする(既定はOFF)。
あさノートの `notify-partner` / `partner-notify-trigger.sql` とは別の関数・別のトリガー(対象は `evening_records`)。

1. `supabase/schema.sql` を実行して `evening_notification_settings.notify_partner_record` 列を作る(`add column if not exists` なので再実行しても安全)。
2. 合言葉を作って、関数側に設定する。`EVENING_CRON_SECRET` とは**別の値**にする(あさノートの `PARTNER_NOTIFY_SECRET` とも別)。

   ```bash
   npx supabase secrets set EVENING_NOTIFY_SECRET=<16文字以上のランダムな文字列(openssl rand -hex 32 など)>
   ```

3. Edge Functionをデプロイする。

   ```bash
   cd apps/yoru
   npx supabase functions deploy notify-evening-partner --project-ref <PROJECT_REF>
   ```

   `x-notify-secret` ヘッダが `EVENING_NOTIFY_SECRET` と一致しない呼び出しは `401`(未設定なら `500`)。

4. SQL Editor で `supabase/evening-partner-notify-trigger.sql` の `<PROJECT_REF>`・`<SERVICE_ROLE_KEY>`・`<NOTIFY_SECRET>` を置き換えて実行する
   (`<NOTIFY_SECRET>` は手順2と同じ値。置き換えた実値はコミットしない)。
5. 確認: 2つの端末(別アカウント・同じグループ)で、片方が通知をON、もう片方が様子を選んで保存する。ONにした側へ通知が届けば成功。
   既に様子が入っている記録の編集や、同期の再送では通知されない。

## トラブルシューティング

- 通知が届かない場合は、Supabase ダッシュボードの Edge Functions > `send-evening-reminders`(パートナー通知なら `notify-evening-partner`)> Logs を確認する。
- cronの呼び出し結果: `select status_code, content, created from net._http_response order by created desc limit 5;`
  (200なら正常、401は合言葉(`EVENING_CRON_SECRET` / `EVENING_NOTIFY_SECRET`)の不一致、404は PROJECT_REF の誤り)。
  合言葉の `401` が並ぶときは、cron・トリガーに入れた値と、`supabase secrets set` で設定した値を、同じにして登録し直す。
  このテーブルの記録は、既定で数時間(6時間ほど)で消えるので、確認は、呼び出しの直後に行う。
- 500 で `Vapid public key must be a URL safe Base 64` と出る場合は `VAPID_PUBLIC_KEY` の値が不正(末尾の `=`・引用符・空白の混入、秘密鍵との取り違え)。
- 「通知機能が未設定です」と出る場合は、Vercel の `NEXT_PUBLIC_VAPID_PUBLIC_KEY` が未設定、または設定後に再デプロイしていない。
- 購読の行が消えている場合は、ブラウザ側で購読が失効(410/404)して自動削除された可能性が高い。もう一度ONにし直す。
- iOS では、ホーム画面に追加したアプリとして開いていないと Push を受け取れない。
