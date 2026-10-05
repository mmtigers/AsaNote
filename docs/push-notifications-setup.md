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

## 4. Edge Functionのシークレットを設定する(あさノートで設定済みなら不要)

```bash
npx supabase secrets set VAPID_PUBLIC_KEY=<公開鍵> VAPID_PRIVATE_KEY=<秘密鍵> VAPID_SUBJECT=mailto:<連絡先>
```

## 5. Edge Functionをデプロイする

```bash
npx supabase functions deploy send-evening-reminders
```

## 6. pg_cronで定期実行する

SQL Editor で `supabase/cron-evening-reminders.sql` の `<PROJECT_REF>` と `<SERVICE_ROLE_KEY>` を置き換えて実行する。
置き換えた実値はコミットしないこと。ジョブ名は `send-evening-reminders`(あさノートの `send-reminders` とは別)。

## 7. 動作確認

1. 「共有」タブの「通知」で夜のリマインド通知をONにし、通知を許可する。
2. `evening_notification_settings` に自分の行(`enabled = true`)、`evening_push_subscriptions` にこの端末の購読が作られていることを確認する。
3. 通知時刻を数分後にして、今夜の記録(様子を選んだもの)を作らずに待つ。通知が届けば成功。
4. 通知をタップしてアプリが開くことを確認する。

## トラブルシューティング

- 通知が届かない場合は、Supabase ダッシュボードの Edge Functions > `send-evening-reminders` > Logs を確認する。
- cronの呼び出し結果: `select status_code, content, created from net._http_response order by created desc limit 5;`
  (200なら正常、401は service_role キーの誤り、404は PROJECT_REF の誤り)。
- 500 で `Vapid public key must be a URL safe Base 64` と出る場合は `VAPID_PUBLIC_KEY` の値が不正(末尾の `=`・引用符・空白の混入、秘密鍵との取り違え)。
- 「通知機能が未設定です」と出る場合は、Vercel の `NEXT_PUBLIC_VAPID_PUBLIC_KEY` が未設定、または設定後に再デプロイしていない。
- 購読の行が消えている場合は、ブラウザ側で購読が失効(410/404)して自動削除された可能性が高い。もう一度ONにし直す。
- iOS では、ホーム画面に追加したアプリとして開いていないと Push を受け取れない。
