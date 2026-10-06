// 未入力の夜のリマインドPush通知。
//
// pg_cron が毎分このEdge Functionを呼び出す(Authorization: Bearer <service_role key>)。
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY はSupabaseが全Edge Functionへ自動で注入する。
// 以下3つだけ `supabase secrets set` で設定すること(あさノートと同じプロジェクトを共有している
// 場合は、あさノートで設定済みの値がそのまま使える):
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT(mailto:か https:// で始まる連絡先)
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
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import {
  isAuthorizedCall,
  jstDateNow,
  jstTimeNow,
  reminderPayload,
  selectReminderTargets,
  sendToSubscriptions,
  type GroupMembership,
  type PushSubscriptionRow,
} from "../_shared/pushLogic.ts";

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });

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

  // cron 以外(anon キーを知っているだけの第三者)からの呼び出しは受け付けない。
  if (!isAuthorizedCall(request.headers.get("Authorization"), serviceRoleKey)) {
    return new Response("unauthorized", { status: 401 });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const now = new Date();
  const currentTime = jstTimeNow(now);
  const today = jstDateNow(now);

  const { data: dueSettings, error: settingsError } = await supabase
    .from("evening_notification_settings")
    .select("user_id")
    .eq("enabled", true)
    .eq("reminder_time", `${currentTime}:00`);
  if (settingsError) {
    console.error("evening_notification_settingsの取得に失敗しました:", settingsError);
    return new Response("failed to load evening_notification_settings", { status: 500 });
  }

  const dueUserIds = (dueSettings ?? []).map((row) => row.user_id as string);
  if (dueUserIds.length === 0) return json({ checked: 0, sent: 0 });

  // 同じグループの人が記録済みかも見るため、due ユーザーの所属グループとその全メンバーを集める。
  const { data: ownMemberships, error: ownMembershipsError } = await supabase
    .from("group_members")
    .select("user_id, group_id")
    .in("user_id", dueUserIds);
  if (ownMembershipsError) {
    console.error("group_membersの取得に失敗しました:", ownMembershipsError);
    return new Response("failed to load group_members", { status: 500 });
  }
  const groupIds = [...new Set((ownMemberships ?? []).map((m) => m.group_id as string))];
  const { data: groupMemberships, error: groupMembershipsError } = groupIds.length
    ? await supabase.from("group_members").select("user_id, group_id").in("group_id", groupIds)
    : { data: [] as GroupMembership[], error: null };
  if (groupMembershipsError) {
    console.error("group_membersの取得に失敗しました:", groupMembershipsError);
    return new Response("failed to load group_members", { status: 500 });
  }
  const memberships = (groupMemberships ?? []) as GroupMembership[];
  const involvedUserIds = [...new Set([...dueUserIds, ...memberships.map((m) => m.user_id)])];

  const { data: todaysRecords, error: recordsError } = await supabase
    .from("evening_records")
    .select("user_id")
    .eq("record_date", today)
    .not("outcome", "is", null)
    .in("user_id", involvedUserIds);
  if (recordsError) {
    console.error("evening_recordsの取得に失敗しました:", recordsError);
    return new Response("failed to load evening_records", { status: 500 });
  }

  const targetUserIds = selectReminderTargets(
    dueUserIds,
    (todaysRecords ?? []).map((row) => row.user_id as string),
    memberships
  );
  if (targetUserIds.length === 0) return json({ checked: dueUserIds.length, sent: 0 });

  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from("evening_push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth_key")
    .in("user_id", targetUserIds);
  if (subscriptionsError) {
    console.error("evening_push_subscriptionsの取得に失敗しました:", subscriptionsError);
    return new Response("failed to load evening_push_subscriptions", { status: 500 });
  }

  const { sent, staleSubscriptionIds } = await sendToSubscriptions(
    (subscription, payload) => webpush.sendNotification(subscription, payload),
    (subscriptions ?? []) as PushSubscriptionRow[],
    reminderPayload()
  );

  if (staleSubscriptionIds.length > 0) {
    await supabase.from("evening_push_subscriptions").delete().in("id", staleSubscriptionIds);
  }

  return json({ checked: dueUserIds.length, targeted: targetUserIds.length, sent });
});
