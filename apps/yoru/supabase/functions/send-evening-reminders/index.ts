// 未入力の夜のリマインドPush通知。
//
// pg_cron が毎分このEdge Functionを呼び出す(Authorization: Bearer <service_role key> は Supabase の入口の
// JWT 検証を通すため。呼び出し元の確認は、別ヘッダ x-cron-secret の合言葉(EVENING_CRON_SECRET)で行う)。
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY はSupabaseが全Edge Functionへ自動で注入する。
// 以下は `supabase secrets set` で設定すること(あさノートと同じプロジェクトを共有している
// 場合、VAPID_* はあさノートで設定済みの値がそのまま使える。合言葉は、あさノートの CRON_SECRET とは別の値):
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT(mailto:か https:// で始まる連絡先)
//   EVENING_CRON_SECRET(16文字以上のランダムな文字列)
// 手順は docs/push-notifications-setup.md を参照。
//
// 処理の流れ:
//   1. 現在時刻をJSTのHH:MMに丸め、evening_notification_settings.reminder_time が一致し
//      enabled=true のユーザーを探す(毎分実行なので分単位の一致でよい)。
//   2. 今夜(JST)、様子まで入った記録が本人または同じグループの誰かに既にあれば何もしない。
//   3. 未入力なら、そのユーザーの evening_push_subscriptions 全件へ送る。
//      失効した購読(410/404)はその場で削除する。
//
// あさノートの notification_settings / push_subscriptions とは別の表を使う
// (共有モードでは同じ DB に同居するため、混ざるとあさノートの通知が届いてしまう)。
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import webpush from "npm:web-push@3.6.7";
import { isAuthorizedSecret } from "../_shared/pushLogic.ts";
import { runReminders, type ReminderDb } from "../_shared/reminderHandler.ts";

// 処理の本体は _shared/reminderHandler.ts(テストあり)。ここは環境変数と本物のクライアントの組み立てだけ。
const json = (body: unknown, status = 200) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: typeof body === "string" ? undefined : { "content-type": "application/json" },
  });

Deno.serve(async (request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");

  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return new Response("必要な環境変数(VAPID_*)が未設定です。docs/push-notifications-setup.mdを参照してください。", {
      status: 500,
    });
  }

  // 呼び出せるのはcronだけ。Supabase の JWT 検証は公開されている anon キーでも通してしまうため、専用の合言葉
  // (`x-cron-secret` ヘッダ。`supabase secrets set EVENING_CRON_SECRET=...` で設定)を確かめる。
  // `SUPABASE_SERVICE_ROLE_KEY` との一致は使わない(非推奨で、値がダッシュボードの鍵と同じとは限らない)。
  if (!Deno.env.get("EVENING_CRON_SECRET")) {
    return new Response("EVENING_CRON_SECRET が未設定です。docs/push-notifications-setup.mdを参照してください。", { status: 500 });
  }
  if (!isAuthorizedSecret(request.headers.get("x-cron-secret"), Deno.env.get("EVENING_CRON_SECRET"))) {
    return new Response("unauthorized", { status: 401 });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const db = createClient(supabaseUrl, serviceRoleKey) as unknown as ReminderDb;

  const result = await runReminders(
    db,
    (subscription, payload) => webpush.sendNotification(subscription, payload),
    new Date()
  );
  return json(result.body, result.status);
});
