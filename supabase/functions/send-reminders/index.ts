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
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import {
  isAuthorizedSecret,
  jstDateNow,
  jstTimeNow,
  reminderPayload,
  selectDueReminderUserIds,
  selectReminderTargets,
  selectUsersToRelease,
  sendToSubscriptions,
  type GroupMembership,
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
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const now = new Date();
  const currentTime = jstTimeNow(now);
  const today = jstDateNow(now);

  const { data: enabledSettings, error: settingsError } = await supabase
    .from("notification_settings")
    .select("user_id, reminder_time")
    .eq("enabled", true);

  if (settingsError) {
    console.error("notification_settingsの取得に失敗しました:", settingsError);
    return new Response("failed to load notification_settings", { status: 500 });
  }

  const { data: sentToday, error: sentError } = await supabase
    .from("reminder_deliveries")
    .select("user_id")
    .eq("sent_on", today);

  if (sentError) {
    console.error("reminder_deliveriesの取得に失敗しました:", sentError);
    return new Response("failed to load reminder_deliveries", { status: 500 });
  }

  const dueUserIds = selectDueReminderUserIds(
    (enabledSettings ?? []) as { user_id: string; reminder_time: string }[],
    now,
    (sentToday ?? []).map((row) => row.user_id as string)
  );
  if (dueUserIds.length === 0) {
    return new Response(JSON.stringify({ checked: 0, sent: 0 }), {
      headers: { "content-type": "application/json" },
    });
  }

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

  // 今日(JST)、outcomeまで入った記録が本人または同じグループの誰かに既にあれば、対象から除く。
  const { data: todaysRecords, error: recordsError } = await supabase
    .from("records")
    .select("user_id")
    .eq("record_date", today)
    .not("outcome", "is", null)
    .in("user_id", involvedUserIds);

  if (recordsError) {
    console.error("recordsの取得に失敗しました:", recordsError);
    return new Response("failed to load records", { status: 500 });
  }

  const candidateUserIds = selectReminderTargets(
    dueUserIds,
    (todaysRecords ?? []).map((row) => row.user_id as string),
    memberships
  );

  if (candidateUserIds.length === 0) {
    return new Response(JSON.stringify({ checked: dueUserIds.length, sent: 0 }), {
      headers: { "content-type": "application/json" },
    });
  }

  // 「今日送信済み」の印を先に付け、付けられた(=他の実行に先を越されなかった)ユーザーだけに送る。
  // 既存の行は ignoreDuplicates でスキップされ、返ってくるのは新規に入れた行だけ。
  const { data: claimed, error: claimError } = await supabase
    .from("reminder_deliveries")
    .upsert(
      candidateUserIds.map((user_id) => ({ user_id, sent_on: today })),
      { onConflict: "user_id,sent_on", ignoreDuplicates: true }
    )
    .select("user_id");
  if (claimError) {
    console.error("reminder_deliveriesへの記録に失敗しました:", claimError);
    return new Response("failed to record reminder_deliveries", { status: 500 });
  }
  const targetUserIds = (claimed ?? []).map((row) => row.user_id as string);
  if (targetUserIds.length === 0) {
    return new Response(JSON.stringify({ checked: dueUserIds.length, targeted: 0, sent: 0 }), {
      headers: { "content-type": "application/json" },
    });
  }

  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth_key")
    .in("user_id", targetUserIds);

  if (subscriptionsError) {
    console.error("push_subscriptionsの取得に失敗しました:", subscriptionsError);
    // 印だけ残ると今日は届かなくなるので、外して次の分に再試行させる。
    await supabase.from("reminder_deliveries").delete().eq("sent_on", today).in("user_id", targetUserIds);
    return new Response("failed to load push_subscriptions", { status: 500 });
  }

  const subscriptionRows = (subscriptions ?? []) as (PushSubscriptionRow & { user_id: string })[];
  const idByEndpoint = new Map(subscriptionRows.map((row) => [row.endpoint, row.id]));
  const sentSubscriptionIds: string[] = [];
  const { sent, staleSubscriptionIds } = await sendToSubscriptions(
    async (subscription, payload) => {
      await webpush.sendNotification(subscription, payload);
      const id = idByEndpoint.get(subscription.endpoint);
      if (id) sentSubscriptionIds.push(id);
    },
    subscriptionRows,
    reminderPayload()
  );

  // 購読があるのに1件も届かなかったユーザー(一時的な通信エラー等)は、印を外して次の分に再試行する。
  const releaseUserIds = selectUsersToRelease(subscriptionRows, sentSubscriptionIds);
  if (releaseUserIds.length > 0) {
    await supabase.from("reminder_deliveries").delete().eq("sent_on", today).in("user_id", releaseUserIds);
  }

  if (staleSubscriptionIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", staleSubscriptionIds);
  }

  return new Response(
    JSON.stringify({ checked: dueUserIds.length, targeted: targetUserIds.length, sent }),
    { headers: { "content-type": "application/json" } }
  );
});
