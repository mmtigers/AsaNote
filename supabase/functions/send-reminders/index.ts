// 未入力日のリマインドPush通知(#3-2)。
//
// pg_cron が毎分このEdge Functionを呼び出す(Authorization: Bearer <service_role key>)。
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY はSupabaseが全Edge Functionへ自動で注入する
// (手動設定不要)。以下3つだけ `supabase secrets set` で個別に設定すること:
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT(mailto:か https:// で始まる連絡先)
// 生成方法・デプロイ手順は docs/push-notifications-setup.md を参照。
//
// 処理の流れ:
//   1. 現在時刻をJSTのHH:MMに丸め、notification_settings.reminder_timeが一致し
//      enabled=trueのユーザーを探す(pg_cronを毎分実行にしているため分単位の一致でよい)。
//   2. そのユーザーの「今日(JST)」の記録にoutcomeが入っていれば何もしない
//      (アプリ内リマインダーRecordReminderNoticeと同じ「未入力なら知らせる」方針)。
//   3. 未入力なら、そのユーザーのpush_subscriptions全件へ通知を送る。
//      送信に失敗した購読(410 Gone等、失効した購読)はその場で削除する。
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import {
  jstDateNow,
  jstTimeNow,
  reminderPayload,
  selectReminderTargets,
  sendToSubscriptions,
  type PushSubscriptionRow,
} from "../_shared/pushLogic.ts";

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

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const now = new Date();
  const currentTime = jstTimeNow(now);
  const today = jstDateNow(now);

  const { data: dueSettings, error: settingsError } = await supabase
    .from("notification_settings")
    .select("user_id")
    .eq("enabled", true)
    .eq("reminder_time", `${currentTime}:00`);

  if (settingsError) {
    console.error("notification_settingsの取得に失敗しました:", settingsError);
    return new Response("failed to load notification_settings", { status: 500 });
  }

  const dueUserIds = (dueSettings ?? []).map((row) => row.user_id as string);
  if (dueUserIds.length === 0) {
    return new Response(JSON.stringify({ checked: 0, sent: 0 }), {
      headers: { "content-type": "application/json" },
    });
  }

  // 今日(JST)、outcomeまで入った記録が既にあるユーザーは対象から除く。
  const { data: todaysRecords, error: recordsError } = await supabase
    .from("records")
    .select("user_id")
    .eq("record_date", today)
    .not("outcome", "is", null)
    .in("user_id", dueUserIds);

  if (recordsError) {
    console.error("recordsの取得に失敗しました:", recordsError);
    return new Response("failed to load records", { status: 500 });
  }

  const targetUserIds = selectReminderTargets(
    dueUserIds,
    (todaysRecords ?? []).map((row) => row.user_id as string)
  );

  if (targetUserIds.length === 0) {
    return new Response(JSON.stringify({ checked: dueUserIds.length, sent: 0 }), {
      headers: { "content-type": "application/json" },
    });
  }

  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth_key")
    .in("user_id", targetUserIds);

  if (subscriptionsError) {
    console.error("push_subscriptionsの取得に失敗しました:", subscriptionsError);
    return new Response("failed to load push_subscriptions", { status: 500 });
  }

  const { sent, staleSubscriptionIds } = await sendToSubscriptions(
    (subscription, payload) => webpush.sendNotification(subscription, payload),
    (subscriptions ?? []) as PushSubscriptionRow[],
    reminderPayload()
  );

  if (staleSubscriptionIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", staleSubscriptionIds);
  }

  return new Response(
    JSON.stringify({ checked: dueUserIds.length, targeted: targetUserIds.length, sent }),
    { headers: { "content-type": "application/json" } }
  );
});
