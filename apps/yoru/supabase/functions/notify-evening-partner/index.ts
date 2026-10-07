// パートナーが今夜の記録を新規に記入したときのPush通知。
//
// evening_records のトリガー(supabase/evening-partner-notify-trigger.sql)が、outcome入りの記録が
// 新規にできた時(INSERT、またはUPDATEでoutcomeがnull→値になった時)にこのEdge Functionを
// 呼び出す(Authorization: Bearer <service_role key> は Supabase の入口の JWT 検証用。呼び出し元の確認は、
// 別ヘッダ x-notify-secret の合言葉(EVENING_NOTIFY_SECRET)で行う。body: { user_id, record_id })。
// 編集(outcomeが既に入っている記録の更新)ではトリガーが発火しないため通知しない。
// 環境変数は send-evening-reminders と同じ(VAPID_* を設定済みであること)に加え、EVENING_NOTIFY_SECRET
// (16文字以上。EVENING_CRON_SECRET・あさノートの合言葉とは別の値)を `supabase secrets set` で設定すること。
//
// 処理の本体は _shared/partnerHandler.ts(テストあり)。ここは環境変数・認証・入力の読み取りと、
// 本物のクライアントの組み立てだけを行う。
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { isAuthorizedSecret } from "../_shared/pushLogic.ts";
import { runPartnerNotify } from "../_shared/partnerHandler.ts";
import type { ReminderDb } from "../_shared/reminderHandler.ts";

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

  // 呼び出せるのはトリガーだけ。Supabase の JWT 検証は公開されている anon キーでも通してしまうため、専用の合言葉
  // (`x-notify-secret` ヘッダ。`supabase secrets set EVENING_NOTIFY_SECRET=...` で設定)を確かめる。
  // `SUPABASE_SERVICE_ROLE_KEY` との一致は使わない(非推奨で、値がダッシュボードの鍵と同じとは限らない)。
  if (!Deno.env.get("EVENING_NOTIFY_SECRET")) {
    return new Response("EVENING_NOTIFY_SECRET が未設定です。docs/push-notifications-setup.mdを参照してください。", { status: 500 });
  }
  if (!isAuthorizedSecret(request.headers.get("x-notify-secret"), Deno.env.get("EVENING_NOTIFY_SECRET"))) {
    return new Response("unauthorized", { status: 401 });
  }

  let authorId: string | undefined;
  try {
    authorId = ((await request.json()) as { user_id?: string }).user_id;
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  if (!authorId) return new Response("user_id is required", { status: 400 });

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const client = createClient(supabaseUrl, serviceRoleKey);

  const result = await runPartnerNotify(
    client as unknown as ReminderDb,
    (subscription, payload) => webpush.sendNotification(subscription, payload),
    authorId,
    async (userId) => (await client.auth.admin.getUserById(userId)).data?.user?.email
  );
  return json(result.body, result.status);
});
