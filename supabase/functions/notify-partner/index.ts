// パートナーがきろくを新規に記入したときのPush通知。
//
// recordsのトリガー(supabase/partner-notify-trigger.sql)が、outcome入りの記録が
// 新規にできた時(INSERT、またはUPDATEでoutcomeがnull→値になった時)にこのEdge Functionを
// 呼び出す(Authorization: Bearer <service_role key>、body: { user_id, record_id })。
// 編集(outcomeが既に入っている記録の更新)ではトリガーが発火しないため通知しない。
// 環境変数は send-reminders と同じ(VAPID_* を `supabase secrets set` で設定済みであること)。
//
// 処理の流れ:
//   1. 記録した人(user_id)と同じグループの、本人以外のメンバーを探す。
//   2. そのうち notification_settings.notify_partner_record=true のメンバーの全購読へ送る。
//   3. 通知文言の「〇〇さん」は記録した人のメールアドレスの@より前(表示名を持たないための割り切り)。
//      送信に失敗した購読(410/404)はその場で削除する。
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import {
  displayNameFromEmail,
  partnerRecordPayload,
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

  // 呼び出せるのはトリガー(service role)だけ。他ユーザーのなりすましで通知を送れないようにする。
  if (req.headers.get("Authorization") !== `Bearer ${serviceRoleKey}`) {
    return new Response("unauthorized", { status: 401 });
  }

  let authorId: string | undefined;
  try {
    authorId = ((await req.json()) as { user_id?: string }).user_id;
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  if (!authorId) return new Response("user_id is required", { status: 400 });

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });

  const { data: membership, error: membershipError } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", authorId)
    .maybeSingle();
  if (membershipError) {
    console.error("group_membersの取得に失敗しました:", membershipError);
    return new Response("failed to load group_members", { status: 500 });
  }
  if (!membership) return json({ partners: 0, sent: 0 });

  const { data: members, error: membersError } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", membership.group_id)
    .neq("user_id", authorId);
  if (membersError) {
    console.error("group_membersの取得に失敗しました:", membersError);
    return new Response("failed to load group members", { status: 500 });
  }
  const partnerIds = (members ?? []).map((row) => row.user_id as string);
  if (partnerIds.length === 0) return json({ partners: 0, sent: 0 });

  const { data: settings, error: settingsError } = await supabase
    .from("notification_settings")
    .select("user_id")
    .eq("notify_partner_record", true)
    .in("user_id", partnerIds);
  if (settingsError) {
    console.error("notification_settingsの取得に失敗しました:", settingsError);
    return new Response("failed to load notification_settings", { status: 500 });
  }
  const targetIds = (settings ?? []).map((row) => row.user_id as string);
  if (targetIds.length === 0) return json({ partners: partnerIds.length, sent: 0 });

  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .in("user_id", targetIds);
  if (subscriptionsError) {
    console.error("push_subscriptionsの取得に失敗しました:", subscriptionsError);
    return new Response("failed to load push_subscriptions", { status: 500 });
  }

  const { data: author } = await supabase.auth.admin.getUserById(authorId);
  const name = displayNameFromEmail(author?.user?.email);
  const { sent, staleSubscriptionIds } = await sendToSubscriptions(
    (subscription, payload) => webpush.sendNotification(subscription, payload),
    (subscriptions ?? []) as PushSubscriptionRow[],
    partnerRecordPayload(name)
  );

  if (staleSubscriptionIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", staleSubscriptionIds);
  }

  return json({ partners: partnerIds.length, targeted: targetIds.length, sent });
});
