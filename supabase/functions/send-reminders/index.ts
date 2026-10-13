// 未入力日のリマインドPush通知(#3-2)。
//
// pg_cron が毎分このEdge Functionを呼び出す(Authorization: Bearer <service_role key> は Supabase の入口の
// JWT 検証を通すため。呼び出し元の確認は、別ヘッダ x-cron-secret の合言葉で行う)。
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY はSupabaseが全Edge Functionへ自動で注入する
// (手動設定不要)。以下3つだけ `supabase secrets set` で個別に設定すること:
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT(mailto:か https:// で始まる連絡先)
// さらに、cron からの呼び出しを確かめる合言葉 CRON_SECRET(16文字以上)も設定すること。
// 生成方法・デプロイ手順は docs/push-notifications-setup.md を参照。
//
// 処理の流れ:
//   1. enabled=trueのユーザーのうち、現在のJST時刻が reminder_time 以降で、直近
//      REMINDER_CATCHUP_WINDOW_MINUTES(15)分以内、かつ今日まだ送っていない(reminder_deliveries
//      に今日の行が無い)ユーザーを探す。cron/関数が1分欠けても、次の分以降で取り戻すため(#130)。
//   2. 「今日(JST)」の記録にoutcomeが入っていれば、本人または同じグループの誰かでも、何もしない
//      (アプリ内リマインダーRecordReminderNoticeと同じ「未入力なら知らせる」方針)。
//   3. 未入力なら、reminder_deliveries に「今日送信済み」の行を入れて(主キー衝突で二重送信を防ぐ。
//      入れられた=自分が担当したユーザーだけが送る)、そのユーザーのpush_subscriptions全件へ通知を送る。
//      購読があるのに1件も送れなかったユーザーは、行を消して次の分に再試行させる。
//      送信に失敗した購読(410 Gone等、失効した購読)はその場で削除する。
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

Deno.serve(async (req) => {
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

  // 呼び出せるのは pg_cron だけ。Supabase の JWT 検証は公開されている anon キーでも通してしまうため、
  // cron 専用の合言葉(`x-cron-secret` ヘッダ。`supabase secrets set CRON_SECRET=...` で設定)を確かめる。
  // `SUPABASE_SERVICE_ROLE_KEY` との一致は使わない(非推奨で、値がダッシュボードの鍵と同じとは限らない)。
  if (!Deno.env.get("CRON_SECRET")) {
    return new Response("CRON_SECRET が未設定です。docs/push-notifications-setup.mdを参照してください。", {
      status: 500,
    });
  }
  if (!isAuthorizedSecret(req.headers.get("x-cron-secret"), Deno.env.get("CRON_SECRET"))) {
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
